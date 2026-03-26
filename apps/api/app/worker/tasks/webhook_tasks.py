"""
Celery Tasks for Webhook Processing
Handles async processing of webhook events from Etsy and other providers
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.orders import Order
from app.models.webhooks import WebhookEvent
from app.models.tenancy import Shop
from app.services.etsy_client import EtsyClient, EtsyAPIError

logger = logging.getLogger(__name__)


@celery_app.task(name="app.worker.tasks.webhook_tasks.process_webhook_event", max_retries=3)
def process_webhook_event(webhook_event_id: int, shop_id: int) -> Dict[str, Any]:
    """
    Process a webhook event asynchronously.

    Args:
        webhook_event_id: WebhookEvent ID
        shop_id: Shop ID

    Returns:
        dict: Processing result
    """
    db = SessionLocal()

    try:
        webhook_event = db.query(WebhookEvent).filter(
            WebhookEvent.id == webhook_event_id
        ).first()

        if not webhook_event:
            logger.error(f"Webhook event {webhook_event_id} not found")
            return {"success": False, "error": "event_not_found"}

        if webhook_event.status == "processed":
            logger.info(f"Webhook event {webhook_event_id} already processed")
            return {"success": True, "status": "already_processed"}

        shop = db.query(Shop).filter(Shop.id == shop_id).first()
        if not shop:
            logger.error(f"Shop {shop_id} not found")
            webhook_event.status = "skipped"
            db.commit()
            return {"success": False, "error": "shop_not_found"}

        # Route to appropriate handler based on event type
        payload = webhook_event.payload
        event_type = payload.get("type", "")

        result = {}

        if event_type.startswith("receipt.") or event_type.startswith("order."):
            result = _handle_order_event(db, shop, payload)
        elif event_type.startswith("shop."):
            result = _handle_shop_event(db, shop, payload)
        else:
            logger.warning(f"Unknown event type: {event_type}")
            webhook_event.status = "skipped"
            db.commit()
            return {"success": False, "error": "unknown_event_type"}

        # Mark as processed
        webhook_event.status = "processed"
        webhook_event.processed_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Successfully processed webhook event {webhook_event_id}")
        return {"success": True, "result": result}

    except Exception as e:
        logger.exception(f"Error processing webhook event {webhook_event_id}: {e}")

        if webhook_event:
            webhook_event.status = "pending"  # Will retry later
            db.commit()

        return {"success": False, "error": str(e)}

    finally:
        db.close()


def _handle_order_event(db, shop: Shop, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle order/receipt events (new order, shipped, cancelled, refunded).

    Event types:
    - receipt.created
    - receipt.updated
    - receipt.shipped
    - receipt.refunded
    """
    event_type = payload.get("type")
    receipt_id = str(payload.get("resource_id"))  # Etsy receipt ID

    logger.info(f"Handling order event: {event_type} for receipt {receipt_id}")

    # Trigger order sync for this specific receipt
    from app.worker.tasks.order_tasks import sync_order_by_id
    sync_order_by_id.delay(shop.id, receipt_id)

    # When an order is shipped/refunded, trigger payment detail sync
    # so the financial dashboard picks up the fee breakdown quickly
    if event_type in ("receipt.shipped", "receipt.refunded"):
        from app.worker.tasks.financial_tasks import sync_payment_details
        sync_payment_details.apply_async(
            kwargs={"shop_id": shop.id, "tenant_id": shop.tenant_id},
            countdown=60,  # Delay 60s to let Etsy finalize the payment record
        )

    return {
        "action": "order_sync_triggered",
        "receipt_id": receipt_id,
        "event_type": event_type
    }


def _handle_shop_event(db, shop: Shop, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle shop-level events (shop updated, vacation mode, etc.).

    Event types:
    - shop.updated
    - shop.vacation_mode_changed
    """
    event_type = payload.get("type")

    logger.info(f"Handling shop event: {event_type} for shop {shop.id}")

    # Update shop metadata if available (with payload size limit)
    if event_type == "shop.updated" and "data" in payload:
        shop_data = payload.get("data", {})
        # Limit stored payload size to 64KB to prevent unbounded writes
        import json as _json
        serialized = _json.dumps(shop_data)
        if len(serialized) > 65536:
            logger.warning(f"Shop event payload too large ({len(serialized)} bytes) for shop {shop.id}, truncating")
            shop_data = {"_truncated": True, "shop_name": shop_data.get("shop_name")}
        shop.shop_data = shop_data
        shop.display_name = shop_data.get("shop_name", shop.display_name)
        db.commit()

    return {
        "action": "shop_updated",
        "event_type": event_type
    }
