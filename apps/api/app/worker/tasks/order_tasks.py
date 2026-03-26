"""
Celery Tasks for Order Synchronization
Handles syncing orders from Etsy to local database
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.orders import Order
from app.models.audit import AuditLog
from app.models.tenancy import Shop
from app.services.etsy_client import EtsyClient, EtsyAPIError
from app.services.notification_service import notify_tenant_admins
from app.models.notifications import NotificationType

logger = logging.getLogger(__name__)


@celery_app.task(name="app.worker.tasks.order_tasks.sync_orders", max_retries=3)
def sync_orders(
    shop_id: int = None,
    tenant_id: Optional[int] = None,
    force_full_sync: bool = False
) -> Dict[str, Any]:
    """
    Sync orders from Etsy for one or all shops.

    Args:
        shop_id: Optional specific shop ID, or None for all shops
        tenant_id: Optional tenant scope to limit shops
        force_full_sync: If true, ignore incremental filters and fetch all

    Returns:
        dict: Summary of sync operation
    """
    db = SessionLocal()

    try:
        # Get shops to sync
        if shop_id:
            shop_query = db.query(Shop).filter(Shop.id == shop_id)
            if tenant_id is not None:
                shop_query = shop_query.filter(Shop.tenant_id == tenant_id)
            shop = shop_query.first()
            if not shop:
                return {"success": False, "error": "Shop not found"}
            if shop.status != "connected":
                return {"success": False, "error": "Shop is not connected"}
            shops = [shop]
        else:
            shops_query = db.query(Shop).filter(Shop.status == "connected")
            if tenant_id is not None:
                shops_query = shops_query.filter(Shop.tenant_id == tenant_id)
            shops = shops_query.all()

        results = {
            "shops_processed": 0,
            "orders_synced": 0,
            "orders_updated": 0,
            "orders_created": 0,
            "errors": []
        }

        logger.info(f"Syncing orders for {len(shops)} shops")

        # Initialize Etsy client
        etsy_client = EtsyClient(db)

        for shop in shops:
            try:
                shop_result = asyncio.run(
                    _sync_shop_orders(
                        db,
                        etsy_client,
                        shop,
                        force_full_sync=force_full_sync,
                    )
                )

                results["shops_processed"] += 1
                results["orders_synced"] += shop_result["orders_synced"]
                results["orders_updated"] += shop_result["orders_updated"]
                results["orders_created"] += shop_result["orders_created"]

            except Exception as e:
                logger.exception(f"Error syncing orders for shop {shop.id}: {e}")
                results["errors"].append({
                    "shop_id": shop.id,
                    "error": str(e)
                })
                try:
                    shop_name = shop.display_name or f"Shop {shop.id}"
                    notify_tenant_admins(
                        db=db,
                        tenant_id=shop.tenant_id,
                        notification_type=NotificationType.ERROR,
                        title="Order sync failed",
                        message=f"Failed to sync orders for {shop_name}: {e}",
                        action_url="/orders",
                        action_label="View orders",
                    )
                except Exception:
                    pass

        logger.info(
            f"Order sync complete: {results['shops_processed']} shops, "
            f"{results['orders_synced']} orders synced "
            f"({results['orders_created']} new, {results['orders_updated']} updated)"
        )

        return results

    finally:
        db.close()


async def _sync_shop_orders(
    db,
    etsy_client: EtsyClient,
    shop: Shop,
    force_full_sync: bool = False
) -> Dict[str, Any]:
    """
    Sync orders for a specific shop.

    Args:
        db: Database session
        etsy_client: Etsy API client
        shop: Shop instance

    Returns:
        dict: Sync summary
    """
    result = {
        "orders_synced": 0,
        "orders_created": 0,
        "orders_updated": 0
    }

    try:
        # Get last sync time for incremental sync
        last_order = (
            db.query(Order)
            .filter(Order.shop_id == shop.id)
            .order_by(Order.synced_at.desc())
            .first()
        )
        
        # Use incremental sync if we have a last sync time (fetch orders modified since then)
        min_last_modified = None
        if not force_full_sync and last_order and last_order.synced_at and last_order.etsy_receipt_id:
            # Subtract 5 minutes for safety (avoid missing updates)
            from datetime import timedelta
            sync_from = last_order.synced_at - timedelta(minutes=5)
            min_last_modified = int(sync_from.timestamp())
            logger.info(f"Incremental sync for shop {shop.id} from {sync_from}")
        else:
            logger.info(f"Full sync for shop {shop.id} (no previous sync)")
        
        # Paginate through all results (Etsy limit: 100 per page)
        all_receipts = []
        offset = 0
        limit = 100
        
        async def _fetch_receipts(min_modified: Optional[int]) -> List[Dict[str, Any]]:
            receipts_collected: List[Dict[str, Any]] = []
            current_offset = 0
            while True:
                receipts_response = await etsy_client.get_shop_receipts(
                    shop_id=shop.id,
                    etsy_shop_id=shop.etsy_shop_id,
                    limit=limit,
                    offset=current_offset,
                    min_last_modified=min_modified
                )

                receipts = receipts_response.get("results", [])
                count = receipts_response.get("count", 0)

                if not receipts:
                    break

                receipts_collected.extend(receipts)
                logger.debug(
                    f"Fetched {len(receipts)} receipts at offset {current_offset} "
                    f"(total: {count})"
                )

                # Check if there are more pages
                if len(receipts) < limit or current_offset + len(receipts) >= count:
                    break

                current_offset += limit

            return receipts_collected

        receipts = await _fetch_receipts(min_last_modified)

        # If incremental sync yields nothing, retry once with full sync
        if not receipts and min_last_modified is not None:
            logger.info(f"No receipts with incremental sync for shop {shop.id}. Retrying full sync.")
            receipts = await _fetch_receipts(None)
        
        logger.info(f"Fetched {len(receipts)} total receipts for shop {shop.id}")

        for receipt in receipts:
            try:
                receipt_id = str(receipt.get("receipt_id"))
                
                # Check if order exists
                existing_order = (
                    db.query(Order)
                    .filter(
                        Order.etsy_receipt_id == receipt_id,
                        Order.shop_id == shop.id
                    )
                    .first()
                )

                # Extract comprehensive order data
                order_data = await _extract_order_data(
                    receipt,
                    shop.id,
                    shop.tenant_id,
                    shop.etsy_shop_id,
                    etsy_client,
                )

                if existing_order:
                    if (
                        existing_order.etsy_updated_at
                        and order_data.get("etsy_updated_at")
                        and order_data["etsy_updated_at"] < existing_order.etsy_updated_at
                    ):
                        logger.info(
                            f"Skipping stale update for receipt {receipt_id} "
                            f"(etsy_updated_at {order_data['etsy_updated_at']} < {existing_order.etsy_updated_at})"
                        )
                        continue

                    _log_order_mismatch(db, existing_order, order_data)

                    # Track previous fulfillment status for event creation
                    previous_fulfillment_status = existing_order.fulfillment_status
                    
                    # Update existing order with all fields except shipments (merge those)
                    for key, value in order_data.items():
                        if key == "shipments":
                            # Merge shipments: combine Etsy shipments with platform-only shipments
                            existing_shipments = existing_order.shipments or []
                            etsy_shipments = value or []
                            
                            # Create a map of Etsy shipments by receipt_shipping_id
                            etsy_shipment_map = {}
                            for shipment in etsy_shipments:
                                if isinstance(shipment, dict):
                                    receipt_shipping_id = shipment.get("receipt_shipping_id")
                                    if receipt_shipping_id:
                                        etsy_shipment_map[receipt_shipping_id] = shipment
                            
                            # Merge: Keep platform-only shipments + update/add Etsy shipments
                            merged_shipments = []
                            
                            # Add all Etsy shipments (these are authoritative from Etsy)
                            merged_shipments.extend(etsy_shipments)
                            
                            # Add platform-only shipments (those without receipt_shipping_id or not in Etsy)
                            for existing_shipment in existing_shipments:
                                if isinstance(existing_shipment, dict):
                                    receipt_shipping_id = existing_shipment.get("receipt_shipping_id")
                                    # Keep if it's platform-only (no receipt_shipping_id or not from Etsy)
                                    if not receipt_shipping_id or receipt_shipping_id not in etsy_shipment_map:
                                        # Mark as platform-only if not already marked
                                        if "source" not in existing_shipment:
                                            existing_shipment["source"] = "manual"
                                        merged_shipments.append(existing_shipment)
                            
                            setattr(existing_order, key, merged_shipments)
                        elif hasattr(existing_order, key):
                            setattr(existing_order, key, value)
                    
                    # Create ShipmentEvent if fulfillment status changed to delivered
                    if (
                        previous_fulfillment_status != "delivered"
                        and order_data.get("fulfillment_status") == "delivered"
                    ):
                        from app.models.orders import ShipmentEvent
                        from datetime import datetime, timezone
                        
                        # Find the delivered shipment
                        delivered_shipment = None
                        for shipment in (order_data.get("shipments") or []):
                            if isinstance(shipment, dict) and shipment.get("is_delivered"):
                                delivered_shipment = shipment
                                break
                        
                        if delivered_shipment:
                            shipment_event = ShipmentEvent(
                                order_id=existing_order.id,
                                tenant_id=existing_order.tenant_id,
                                shop_id=existing_order.shop_id,
                                state="delivered",
                                previous_state=previous_fulfillment_status,
                                tracking_code=delivered_shipment.get("tracking_code"),
                                carrier_name=delivered_shipment.get("carrier_name"),
                                tracking_url=delivered_shipment.get("tracking_url"),
                                source="etsy_sync",
                                actor_user_id=None,  # System-generated
                                actor_role="system",
                                event_timestamp=datetime.now(timezone.utc),
                                delivered_at=datetime.now(timezone.utc),
                                notes="Automatically marked as delivered via Etsy sync",
                                event_metadata={"etsy_shipment": delivered_shipment}
                            )
                            db.add(shipment_event)
                            logger.info(f"Created delivered ShipmentEvent for order {receipt_id}")
                    
                    result["orders_updated"] += 1
                    logger.debug(f"Updated order {receipt_id}")

                else:
                    # Create new order with all extracted data
                    order = Order(**order_data)
                    db.add(order)
                    db.flush()
                    result["orders_created"] += 1
                    logger.debug(f"Created new order {receipt_id}")

                result["orders_synced"] += 1

            except Exception as e:
                logger.error(f"Error processing receipt {receipt.get('receipt_id')}: {e}", exc_info=True)
                continue

        db.commit()

        logger.info(
            f"Shop {shop.id} sync: {result['orders_synced']} orders "
            f"({result['orders_created']} new, {result['orders_updated']} updated)"
        )

        if result["orders_created"] > 0:
            shop_name = shop.display_name or f"Shop {shop.id}"
            notify_tenant_admins(
                db=db,
                tenant_id=shop.tenant_id,
                notification_type=NotificationType.ORDER,
                title="New orders synced",
                message=f"{result['orders_created']} new order(s) synced for {shop_name}.",
                action_url="/orders",
                action_label="View orders",
            )

        return result

    except EtsyAPIError as e:
        logger.error(f"Etsy API error syncing shop {shop.id}: {e}")
        raise

    except Exception as e:
        logger.exception(f"Unexpected error syncing shop {shop.id}: {e}")
        raise


def _derive_payment_status(etsy_status: str, receipt: Dict[str, Any]) -> str:
    """
    Derive payment status from Etsy receipt fields.
    """
    is_paid = receipt.get("is_paid")
    was_paid = receipt.get("was_paid")
    if is_paid is True or was_paid is True or etsy_status in {"paid", "completed"}:
        return "paid"
    return "unpaid"


def _derive_fulfillment_status(receipt: Dict[str, Any]) -> str:
    """
    Derive fulfillment status from Etsy receipt fields.
    """
    shipments = receipt.get("shipments", []) or []
    if any(shipment.get("is_delivered") for shipment in shipments):
        return "delivered"
    if shipments or receipt.get("is_shipped") is True or receipt.get("was_shipped") is True:
        return "shipped"
    return "unshipped"


def _derive_lifecycle_status(etsy_status: str, payment_status: str, fulfillment_status: str) -> str:
    """
    Derive lifecycle status from Etsy receipt and fulfillment signals.
    """
    if etsy_status in {"canceled", "cancelled"}:
        return "cancelled"
    if etsy_status in {"refunded", "fully refunded"}:
        return "refunded"
    if fulfillment_status == "delivered" or etsy_status == "completed":
        return "completed"
    if fulfillment_status == "shipped":
        return "in_transit"
    return "processing"


def _legacy_status_from_lifecycle(lifecycle_status: str, fulfillment_status: str) -> str:
    """
    Map lifecycle/fulfillment statuses into legacy status field.
    """
    if lifecycle_status == "cancelled":
        return "cancelled"
    if lifecycle_status == "refunded":
        return "refunded"
    if lifecycle_status == "completed":
        return "delivered" if fulfillment_status == "delivered" else "shipped"
    if lifecycle_status == "in_transit":
        return "shipped"
    if lifecycle_status == "processing":
        return "processing"
    return "processing"


def _log_order_mismatch(db: SessionLocal, order: Order, order_data: Dict[str, Any]) -> None:
    """
    Log an order status mismatch for observability.
    """
    mismatch_fields = {}
    for key in ("etsy_status", "lifecycle_status", "payment_status", "fulfillment_status"):
        if getattr(order, key, None) != order_data.get(key):
            mismatch_fields[key] = {
                "before": getattr(order, key, None),
                "after": order_data.get(key),
            }
    if not mismatch_fields:
        return

    audit = AuditLog(
        request_id=str(uuid.uuid4()),
        actor_user_id=None,
        actor_email="system",
        actor_ip=None,
        tenant_id=order.tenant_id,
        shop_id=order.shop_id,
        action="orders.sync.mismatch",
        target_type="order",
        target_id=str(order.etsy_receipt_id or order.id),
        http_method=None,
        http_path=None,
        http_status=None,
        status="success",
        error_message=None,
        request_metadata=AuditLog.sanitize_metadata({
            "order_id": order.id,
            "etsy_receipt_id": order.etsy_receipt_id,
            "mismatch": mismatch_fields,
        }),
        response_metadata=None,
        attempt=1,
        latency_ms=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit)


async def _extract_order_data(
    receipt: Dict[str, Any],
    shop_id: int,
    tenant_id: int,
    etsy_shop_id: str,
    etsy_client: EtsyClient,
) -> Dict[str, Any]:
    """
    Extract comprehensive order data from Etsy receipt.

    Args:
        receipt: Etsy receipt/order data
        shop_id: Shop ID
        tenant_id: Tenant ID

    Returns:
        dict: Order data ready for database insertion/update
    """
    etsy_status = receipt.get("status", "").lower()
    payment_status = _derive_payment_status(etsy_status, receipt)
    fulfillment_status = _derive_fulfillment_status(receipt)
    lifecycle_status = _derive_lifecycle_status(etsy_status, payment_status, fulfillment_status)
    
    # Get buyer information
    buyer_email = receipt.get("buyer_email", "")
    buyer_user_id = str(receipt.get("buyer_user_id", "")) if receipt.get("buyer_user_id") else None
    
    # Extract shipping address
    shipping_address = receipt.get("first_line", {})  # Etsy uses nested structure
    name = receipt.get("name", "")
    
    # Get financial data (Etsy uses Money objects with amount in cents)
    grandtotal = receipt.get("grandtotal", {})
    subtotal = receipt.get("subtotal", {})
    total_shipping = receipt.get("total_shipping_cost", {})
    total_tax = receipt.get("total_tax_cost", {})
    discount = receipt.get("discount_amt", {})
    gift_wrap = receipt.get("gift_wrap_price", {})
    
    async def _get_listing_image_url(listing_id: Optional[str]) -> Optional[str]:
        if not listing_id:
            return None
        try:
            images = await etsy_client.get_listing_images(
                shop_id=shop_id,
                listing_id=str(listing_id),
                limit=1,
                offset=0,
            )
            results = images.get("results", []) if isinstance(images, dict) else []
            if not results:
                return None
            image = results[0] or {}
            return (
                image.get("url_fullxfull")
                or image.get("url_570xN")
                or image.get("url_170x135")
                or image.get("url_75x75")
                or image.get("url")
            )
        except Exception as e:
            logger.warning(f"Failed to fetch listing image for {listing_id}: {e}")
            return None

    # Extract line items (transactions)
    line_items = []
    transactions = receipt.get("transactions", [])
    if not transactions and receipt.get("receipt_id"):
        try:
            full_receipt = await etsy_client.get_receipt(
                shop_id=shop_id,
                etsy_shop_id=etsy_shop_id,
                receipt_id=str(receipt.get("receipt_id")),
            )
            if isinstance(full_receipt, dict):
                transactions = full_receipt.get("transactions", []) or transactions
        except Exception as e:
            logger.warning(f"Failed to fetch receipt details for {receipt.get('receipt_id')}: {e}")
    for txn in transactions:
        listing_id = txn.get("listing_id")
        listing_image = txn.get("listing_image") or {}
        image_url = (
            txn.get("image_url")
            or txn.get("listing_image_url")
            or listing_image.get("url_fullxfull")
            or listing_image.get("url_570xN")
            or listing_image.get("url_170x135")
            or listing_image.get("url_75x75")
            or listing_image.get("url")
        )
        if not image_url:
            image_url = await _get_listing_image_url(listing_id)

        line_item = {
            "transaction_id": str(txn.get("transaction_id")),
            "listing_id": str(listing_id) if listing_id is not None else None,
            "quantity": txn.get("quantity", 1),
            "title": txn.get("title", ""),
            "description": txn.get("description", ""),
            "sku": txn.get("sku", ""),
            "price": txn.get("price", {}).get("amount", 0),
            "currency": txn.get("price", {}).get("currency_code", "USD"),
            "variations": txn.get("variations", []),
            "product_data": txn.get("product_data", {}),
            "image": image_url,
        }
        line_items.append(line_item)
    
    # Extract shipments (can be multiple)
    shipments = []
    for shipment in receipt.get("shipments", []):
        shipment_data = {
            "receipt_shipping_id": str(shipment.get("receipt_shipping_id", "")),
            "tracking_code": shipment.get("tracking_code"),
            "tracking_url": shipment.get("tracking_url"),
            "carrier_name": shipment.get("carrier_name"),
            "shipping_date": shipment.get("mailing_date"),
            "is_delivered": shipment.get("is_delivered", False),
            "notification_date": shipment.get("notification_date")
        }
        shipments.append(shipment_data)
    
    # Parse timestamps
    created_timestamp = receipt.get("create_timestamp")
    updated_timestamp = receipt.get("update_timestamp")
    
    from datetime import datetime, timezone
    etsy_created_at = datetime.fromtimestamp(created_timestamp, tz=timezone.utc) if created_timestamp else None
    etsy_updated_at = datetime.fromtimestamp(updated_timestamp, tz=timezone.utc) if updated_timestamp else None
    
    # Build order data dictionary
    order_data = {
        "etsy_receipt_id": str(receipt.get("receipt_id")),
        "shop_id": shop_id,
        "tenant_id": tenant_id,
        "status": _legacy_status_from_lifecycle(lifecycle_status, fulfillment_status),
        "etsy_status": etsy_status,
        "lifecycle_status": lifecycle_status,
        "payment_status": payment_status,
        "fulfillment_status": fulfillment_status,
        
        # Buyer info
        "buyer_user_id": buyer_user_id,
        "buyer_email": buyer_email,
        "buyer_name": name,
        
        # Shipping address
        "shipping_name": receipt.get("name", ""),
        "shipping_first_line": receipt.get("first_line", ""),
        "shipping_second_line": receipt.get("second_line", ""),
        "shipping_city": receipt.get("city", ""),
        "shipping_state": receipt.get("state", ""),
        "shipping_zip": receipt.get("zip", ""),
        "shipping_country": receipt.get("country", ""),
        "shipping_country_iso": receipt.get("country_iso", ""),
        
        # Financials (convert from cents to integer cents for storage)
        "subtotal": subtotal.get("amount", 0) if isinstance(subtotal, dict) else 0,
        "total_price": grandtotal.get("amount", 0) if isinstance(grandtotal, dict) else 0,
        "total_shipping_cost": total_shipping.get("amount", 0) if isinstance(total_shipping, dict) else 0,
        "total_tax_cost": total_tax.get("amount", 0) if isinstance(total_tax, dict) else 0,
        "discount_amt": discount.get("amount", 0) if isinstance(discount, dict) else 0,
        "gift_wrap_price": gift_wrap.get("amount", 0) if isinstance(gift_wrap, dict) else 0,
        "currency": grandtotal.get("currency_code", "USD") if isinstance(grandtotal, dict) else "USD",
        
        # Line items and shipments
        "line_items": line_items,
        "shipments": shipments,
        
        # Gift options
        "is_gift": receipt.get("is_gift", False),
        "gift_message": receipt.get("gift_message", ""),
        "message_from_buyer": receipt.get("message_from_buyer", ""),
        
        # Timestamps
        "etsy_created_at": etsy_created_at,
        "etsy_updated_at": etsy_updated_at,
        "synced_at": datetime.now(timezone.utc)
    }
    
    return order_data


@celery_app.task(name="app.worker.tasks.order_tasks.sync_order_by_id", max_retries=3)
def sync_order_by_id(shop_id: int, receipt_id: str) -> Dict[str, Any]:
    """
    Sync a specific order by receipt ID.

    Args:
        shop_id: Shop ID
        receipt_id: Etsy receipt ID

    Returns:
        dict: Sync result
    """
    db = SessionLocal()

    try:
        shop = db.query(Shop).filter(Shop.id == shop_id).first()
        if not shop:
            return {"success": False, "error": "Shop not found"}

        # Initialize Etsy client
        etsy_client = EtsyClient(db)

        # Fetch specific receipt
        receipt = asyncio.run(etsy_client.get_receipt(
            shop_id=shop.id,
            etsy_shop_id=shop.etsy_shop_id,
            receipt_id=receipt_id
        ))

        # Check if order exists
        existing_order = (
            db.query(Order)
            .filter(
                Order.etsy_receipt_id == receipt_id,
                Order.shop_id == shop.id
            )
            .first()
        )

        # Extract comprehensive order data
        order_data = asyncio.run(
            _extract_order_data(
                receipt,
                shop.id,
                shop.tenant_id,
                shop.etsy_shop_id,
                etsy_client,
            )
        )

        if existing_order:
            if (
                existing_order.etsy_updated_at
                and order_data.get("etsy_updated_at")
                and order_data["etsy_updated_at"] < existing_order.etsy_updated_at
            ):
                return {
                    "success": True,
                    "order_id": existing_order.id,
                    "action": "skipped_stale"
                }

            _log_order_mismatch(db, existing_order, order_data)

            # Update with all extracted data
            for key, value in order_data.items():
                if hasattr(existing_order, key):
                    setattr(existing_order, key, value)
            
            db.commit()

            return {
                "success": True,
                "order_id": existing_order.id,
                "action": "updated"
            }

        else:
            # Create new order
            order = Order(**order_data)
            db.add(order)
            db.flush()
            db.commit()

            return {
                "success": True,
                "order_id": order.id,
                "action": "created"
            }

    except EtsyAPIError as e:
        logger.error(f"Etsy API error syncing order {receipt_id}: {e}")
        return {"success": False, "error": str(e)}

    except Exception as e:
        logger.exception(f"Error syncing order {receipt_id}: {e}")
        return {"success": False, "error": str(e)}

    finally:
        db.close()


@celery_app.task(name="app.worker.tasks.order_tasks.reconcile_orders", max_retries=3)
def reconcile_orders(shop_id: Optional[int] = None, days: int = 30) -> Dict[str, Any]:
    """
    Periodic task to reconcile order states with Etsy.

    Args:
        shop_id: Optional specific shop ID, or None for all shops
        days: Lookback window for orders to reconcile
    """
    db = SessionLocal()
    try:
        if shop_id:
            shops = [db.query(Shop).filter(Shop.id == shop_id).first()]
            if not shops[0]:
                return {"success": False, "error": "shop_not_found"}
        else:
            shops = db.query(Shop).filter(Shop.status == "connected").all()

        results = {
            "shops_processed": 0,
            "orders_checked": 0,
            "orders_updated": 0,
            "mismatches_logged": 0,
        }

        etsy_client = EtsyClient(db)

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        for shop in shops:
            if not shop:
                continue
            results["shops_processed"] += 1

            orders = db.query(Order).filter(
                Order.shop_id == shop.id,
                Order.etsy_receipt_id.isnot(None),
                (Order.etsy_created_at >= cutoff)
                | (Order.etsy_updated_at >= cutoff)
                | (Order.lifecycle_status.in_(["processing", "in_transit"]))
            ).all()

            for order in orders:
                try:
                    receipt = asyncio.run(etsy_client.get_receipt(
                        shop_id=shop.id,
                        etsy_shop_id=shop.etsy_shop_id,
                        receipt_id=str(order.etsy_receipt_id),
                    ))
                    order_data = asyncio.run(_extract_order_data(
                        receipt,
                        shop.id,
                        shop.tenant_id,
                        shop.etsy_shop_id,
                        etsy_client,
                    ))

                    results["orders_checked"] += 1

                    if (
                        order.etsy_updated_at
                        and order_data.get("etsy_updated_at")
                        and order_data["etsy_updated_at"] < order.etsy_updated_at
                    ):
                        continue

                    if any(
                        getattr(order, key, None) != order_data.get(key)
                        for key in ("etsy_status", "lifecycle_status", "payment_status", "fulfillment_status")
                    ):
                        _log_order_mismatch(db, order, order_data)
                        results["mismatches_logged"] += 1

                    updated = False
                    for key, value in order_data.items():
                        if hasattr(order, key) and getattr(order, key) != value:
                            setattr(order, key, value)
                            updated = True

                    if updated:
                        results["orders_updated"] += 1

                except Exception as e:
                    logger.error(f"Failed to reconcile order {order.etsy_receipt_id}: {e}", exc_info=True)
                    continue

            db.commit()

        return {"success": True, **results}

    except Exception as e:
        logger.exception(f"Order reconciliation failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        db.close()

