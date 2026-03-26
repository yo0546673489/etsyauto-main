"""
Webhook Endpoints for External Services (Etsy, etc.)
"""
from fastapi import APIRouter, Request, HTTPException, status, Header, Depends
from sqlalchemy.orm import Session
import hmac
import hashlib
import json
import logging
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.core.config import settings
from app.models.webhooks import WebhookEvent
from app.models.tenancy import Shop
from app.services.audit_service import AuditService
from app.worker.tasks.webhook_tasks import process_webhook_event

router = APIRouter()
logger = logging.getLogger(__name__)


def verify_etsy_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/etsy", tags=["Webhooks"])
async def etsy_webhook(
    request: Request,
    x_etsy_signature: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Receive webhook events from Etsy API.
    
    Etsy sends webhooks for:
    - Listing state changes (draft, active, inactive, expired)
    - Order updates (new order, shipped, cancelled)
    - Shop updates
    
    Signature verification:
    - Etsy signs webhook payloads with HMAC-SHA256
    - Signature is in X-Etsy-Signature header
    """
    try:
        # Read raw body
        body = await request.body()
        body_str = body.decode("utf-8")

        audit_service = AuditService(db)
        signature_status = "unverified"
        
        # Verify webhook signature when secret is configured (mandatory in production)
        if settings.ETSY_WEBHOOK_SECRET:
            if not x_etsy_signature:
                logger.warning("Webhook request missing X-Etsy-Signature header")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Missing webhook signature"
                )
            if not verify_etsy_signature(body, x_etsy_signature, settings.ETSY_WEBHOOK_SECRET):
                logger.warning("Invalid Etsy webhook signature received")
                audit_service.log_action(
                    action="webhook_received",
                    status="unverified",
                    actor_ip=request.client.host if request.client else None,
                    target_type="webhook",
                    target_id=request.headers.get("x-request-id") or "unknown",
                    http_method=request.method,
                    http_path=str(request.url.path),
                    http_status=status.HTTP_401_UNAUTHORIZED,
                    error_message="Invalid webhook signature",
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid webhook signature"
                )
            signature_status = "verified"
        else:
            logger.warning("ETSY_WEBHOOK_SECRET not configured; allowing unverified webhook")
        
        # Parse payload
        try:
            payload = json.loads(body_str)
        except json.JSONDecodeError:
            logger.error("Invalid JSON in Etsy webhook payload")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON payload"
            )
        
        # Extract event metadata
        event_type = payload.get("type")  # e.g., "listing.updated", "receipt.created"
        event_id = payload.get("event_id")
        external_id = str(event_id).strip() if event_id is not None else ""
        shop_id_etsy = payload.get("shop_id")

        if not event_type or not shop_id_etsy or not external_id:
            logger.error(
                "Missing required fields in webhook (event_type=%s, shop_id=%s, external_id=%s)",
                event_type,
                shop_id_etsy,
                external_id,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required fields"
            )

        audit_service.log_action(
            action="webhook_received",
            status=signature_status,
            actor_ip=request.client.host if request.client else None,
            target_type="webhook",
            target_id=external_id,
            http_method=request.method,
            http_path=str(request.url.path),
            http_status=status.HTTP_202_ACCEPTED,
            request_metadata={"event_type": event_type},
        )

        # Check if we've already processed this event (idempotency)
        existing_event = db.query(WebhookEvent).filter(
            WebhookEvent.external_id == external_id
        ).first()

        if existing_event:
            logger.info(f"Webhook event {external_id} already processed, skipping")
            return {"status": "duplicate", "event_id": external_id}

        # Find the shop
        shop = db.query(Shop).filter(
            Shop.etsy_shop_id == str(shop_id_etsy)
        ).first()

        if not shop:
            logger.warning(f"Shop {shop_id_etsy} not found for webhook event {external_id}")
            # Store as skipped
            webhook_event = WebhookEvent(
                provider="etsy",
                external_id=external_id,
                payload=payload,
                status="skipped"
            )
            db.add(webhook_event)
            db.commit()
            
            return {"status": "skipped", "reason": "shop_not_found"}
        
        # Store webhook event
        webhook_event = WebhookEvent(
            provider="etsy",
            external_id=external_id,
            payload=payload,
            status="pending"
        )
        db.add(webhook_event)
        db.commit()
        db.refresh(webhook_event)
        
        logger.info(f"Received Etsy webhook: {event_type} for shop {shop_id_etsy} (event {external_id})")
        
        # Process asynchronously via Celery
        process_webhook_event.delay(webhook_event.id, shop.id)
        
        return {"status": "accepted", "event_id": external_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error processing Etsy webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/health", tags=["Webhooks"])
async def webhook_health():
    """
    Health check endpoint for webhook service.
    Etsy may ping this to verify webhook endpoint is alive.
    """
    return {"status": "ok", "service": "webhooks"}

