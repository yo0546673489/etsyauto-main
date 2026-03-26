"""
Orders API Endpoints
Manage Etsy orders and synchronization
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, and_, nullslast
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
import json
import logging

from app.api.dependencies import get_user_context, UserContext, require_permission, require_any_permission
from app.core.database import get_db
from app.core.rbac import Permission
from app.core.query_helpers import filter_by_tenant, ensure_shop_access, ensure_tenant_access
from app.models.orders import Order, ShipmentEvent
from app.models.audit import AuditLog
from app.models.user_preferences import UserPreference
from app.services.exchange_rate_service import convert_amount, SUPPORTED_CURRENCIES
from app.models.tenancy import Shop, Membership, User
from app.services.order_utils import build_shipping_address, derive_payment_status, derive_lifecycle_status
from app.services.etsy_client import EtsyClient, EtsyAPIError, EtsyRateLimitError

logger = logging.getLogger(__name__)

router = APIRouter()


class AssignSupplierRequest(BaseModel):
    supplier_user_id: int


class FulfillmentRequest(BaseModel):
    tracking_code: str
    carrier_name: Optional[str] = None
    ship_date: Optional[str] = None  # ISO-8601 date/time
    note: Optional[str] = None
    send_bcc: bool = False


class ManualTrackingRequest(BaseModel):
    tracking_code: str
    carrier_name: Optional[str] = None
    ship_date: Optional[str] = None  # ISO-8601 date/time
    note: Optional[str] = None


@router.get("/stats", tags=["Orders"])
async def get_order_stats(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = None,
    context: UserContext = Depends(require_permission(Permission.READ_ORDER)),
    db: Session = Depends(get_db)
):
    """
    Get order statistics for dashboard cards
    Requires: READ_ORDER permission (all roles)
    Supports: shop_id (single) or shop_ids (comma-separated) for multi-shop filtering

    Returns:
        Statistics about order counts by payment and delivery status
    """
    # Filter by tenant
    base_query = filter_by_tenant(db.query(Order), context.tenant_id, Order.tenant_id)
    if shop_ids:
        ids = [int(x) for x in shop_ids.split(',') if x.strip().isdigit()]
        for sid in ids:
            ensure_shop_access(sid, context, db)
        if ids:
            base_query = base_query.filter(Order.shop_id.in_(ids))
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        base_query = base_query.filter(Order.shop_id == shop_id)
    if context.role.lower() == "supplier":
        base_query = base_query.filter(Order.supplier_user_id == context.user_id)

    # Get total order count
    total_orders = base_query.count()

    processing_filter = or_(
        Order.lifecycle_status == "processing",
        and_(
            Order.lifecycle_status.is_(None),
            or_(
                Order.etsy_status.is_(None),
                ~Order.etsy_status.in_(["completed", "canceled", "cancelled", "refunded", "fully refunded"]),
            ),
            or_(Order.fulfillment_status.is_(None), Order.fulfillment_status == "unshipped"),
        ),
    )
    in_transit_filter = or_(
        Order.lifecycle_status == "in_transit",
        and_(Order.lifecycle_status.is_(None), Order.fulfillment_status == "shipped"),
    )
    completed_filter = or_(
        Order.lifecycle_status == "completed",
        and_(
            Order.lifecycle_status.is_(None),
            or_(Order.fulfillment_status == "delivered", Order.etsy_status == "completed"),
        ),
    )
    cancelled_filter = or_(
        Order.lifecycle_status == "cancelled",
        and_(Order.lifecycle_status.is_(None), Order.etsy_status.in_(["canceled", "cancelled"])),
    )
    refunded_filter = or_(
        Order.lifecycle_status == "refunded",
        and_(Order.lifecycle_status.is_(None), Order.etsy_status.in_(["refunded", "fully refunded"])),
    )

    paid_filter = or_(
        Order.payment_status == "paid",
        and_(Order.payment_status.is_(None), Order.etsy_status.in_(["paid", "completed"])),
    )
    unpaid_filter = or_(
        Order.payment_status == "unpaid",
        and_(
            Order.payment_status.is_(None),
            or_(Order.etsy_status.is_(None), ~Order.etsy_status.in_(["paid", "completed"])),
        ),
    )

    return {
        "order_status": {
            "processing": base_query.filter(processing_filter).count(),
            "in_transit": base_query.filter(in_transit_filter).count(),
            "completed": base_query.filter(completed_filter).count(),
            "cancelled": base_query.filter(cancelled_filter).count(),
            "refunded": base_query.filter(refunded_filter).count(),
        },
        "payment_status": {
            "paid": base_query.filter(paid_filter).count(),
            "unpaid": base_query.filter(unpaid_filter).count(),
        },
        "total": total_orders,
    }


def _get_target_currency(context: UserContext, target_param: Optional[str], db: Session) -> Optional[str]:
    """Get target currency from query param or user preference."""
    if target_param and target_param.upper().strip() in SUPPORTED_CURRENCIES:
        return target_param.upper().strip()
    pref = db.query(UserPreference).filter(UserPreference.user_id == context.user_id).first()
    if pref and pref.preferred_currency_code in SUPPORTED_CURRENCIES:
        return pref.preferred_currency_code
    return None


@router.get("/", tags=["Orders"])
async def list_orders(
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = None,
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_permission(Permission.READ_ORDER)),
    db: Session = Depends(get_db)
):
    """
    List all orders for current tenant
    Requires: READ_ORDER permission (all roles)
    Supports: shop_id (single) or shop_ids (comma-separated) for multi-shop filtering

    Args:
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return
        status: Filter by order status (optional)
        payment_status: Filter by payment status (optional)

    Returns:
        List of orders with pagination info
    """
    # Filter by tenant
    query = filter_by_tenant(db.query(Order), context.tenant_id, Order.tenant_id)

    if shop_ids:
        ids = [int(x) for x in shop_ids.split(',') if x.strip().isdigit()]
        for sid in ids:
            ensure_shop_access(sid, context, db)
        if ids:
            query = query.filter(Order.shop_id.in_(ids))
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        query = query.filter(Order.shop_id == shop_id)

    if context.role.lower() == "supplier":
        query = query.filter(Order.supplier_user_id == context.user_id)

    # Apply filters
    if status:
        normalized = status.lower()
        if normalized == "completed":
            query = query.filter(
                or_(
                    Order.lifecycle_status == "completed",
                    and_(Order.lifecycle_status.is_(None), Order.etsy_status == "completed"),
                    and_(Order.lifecycle_status.is_(None), Order.fulfillment_status == "delivered"),
                )
            )
        elif normalized == "in_transit":
            query = query.filter(
                or_(
                    Order.lifecycle_status == "in_transit",
                    and_(Order.lifecycle_status.is_(None), Order.fulfillment_status == "shipped"),
                )
            )
        elif normalized == "processing":
            query = query.filter(
                or_(
                    Order.lifecycle_status == "processing",
                    and_(
                        Order.lifecycle_status.is_(None),
                        or_(
                            Order.etsy_status.is_(None),
                            ~Order.etsy_status.in_(["completed", "canceled", "cancelled", "refunded", "fully refunded"]),
                        ),
                        or_(Order.fulfillment_status.is_(None), Order.fulfillment_status == "unshipped"),
                    ),
                )
            )
        elif normalized == "refunded":
            query = query.filter(
                or_(
                    Order.lifecycle_status == "refunded",
                    Order.etsy_status.in_(["refunded", "fully refunded"]),
                )
            )
        elif normalized == "cancelled":
            query = query.filter(
                or_(
                    Order.lifecycle_status == "cancelled",
                    Order.etsy_status.in_(["canceled", "cancelled"]),
                )
            )
        else:
            query = query.filter(Order.lifecycle_status == normalized)
    if payment_status:
        normalized = payment_status.lower()
        if normalized == "paid":
            query = query.filter(
                or_(
                    Order.payment_status == "paid",
                    and_(Order.payment_status.is_(None), Order.etsy_status.in_(["paid", "completed"])),
                )
            )
        elif normalized == "unpaid":
            query = query.filter(
                or_(
                    Order.payment_status == "unpaid",
                    and_(
                        Order.payment_status.is_(None),
                        or_(Order.etsy_status.is_(None), ~Order.etsy_status.in_(["paid", "completed"])),
                    ),
                )
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid payment_status filter value")

    # Get total count before pagination
    total = query.count()

    # Apply pagination and ordering
    orders = (
        query.order_by(
            nullslast(Order.etsy_created_at.desc()),
            Order.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    target_ccy = _get_target_currency(context, target_currency, db)

    # Pre-fetch supplier names for all orders in one query
    supplier_ids = list({o.supplier_user_id for o in orders if o.supplier_user_id})
    supplier_map: dict = {}
    if supplier_ids:
        supplier_users = db.query(User).filter(User.id.in_(supplier_ids)).all()
        supplier_map = {u.id: u for u in supplier_users}

    # Format orders for response
    formatted_orders = []
    for order in orders:
        first_item = None
        if order.line_items:
            for item in order.line_items:
                if not first_item:
                    first_item = item
                if isinstance(item, dict) and item.get("image"):
                    first_item = item
                    break

        item_image = None
        item_title = None
        if isinstance(first_item, dict):
            item_image = first_item.get("image")
            item_title = first_item.get("title") or first_item.get("product_name")

        is_supplier = context.role.lower() == "supplier"
        supplier_user = supplier_map.get(order.supplier_user_id) if order.supplier_user_id else None

        # Extract latest tracking code from shipments JSONB
        tracking_code = None
        if order.shipments and isinstance(order.shipments, list):
            for shipment in reversed(order.shipments):
                if isinstance(shipment, dict) and shipment.get("tracking_code"):
                    tracking_code = shipment["tracking_code"]
                    break

        item = {
            "id": order.id,
            "order_id": order.etsy_receipt_id or f"#{order.id}",
            "etsy_receipt_id": order.etsy_receipt_id,
            "shop_id": order.shop_id,
            "supplier_user_id": order.supplier_user_id,
            "supplier_name": supplier_user.name if supplier_user else None,
            "supplier_email": supplier_user.email if supplier_user else None,
            "buyer_name": order.buyer_name,
            "buyer_email": order.buyer_email,
            "total_price": None if is_supplier else float(order.total_price or 0) / 100,
            "currency": order.currency or "USD",
            "status": derive_lifecycle_status(order),
            "lifecycle_status": derive_lifecycle_status(order),
            "payment_status": order.payment_status or derive_payment_status(order),
            "fulfillment_status": order.fulfillment_status or "unshipped",
            "tracking_code": tracking_code,
            "item_image": item_image,
            "item_title": item_title,
            "created_at": (
                (order.etsy_created_at or order.created_at).isoformat()
                if (order.etsy_created_at or order.created_at)
                else None
            ),
            "updated_at": (
                (order.etsy_updated_at or order.updated_at).isoformat()
                if (order.etsy_updated_at or order.updated_at)
                else None
            ),
        }
        if not is_supplier and target_ccy and target_ccy != (order.currency or "USD") and order.total_price:
            try:
                conv_cents, rate, retrieved, stale = convert_amount(
                    order.total_price, order.currency or "USD", target_ccy,
                    order.etsy_created_at if order.etsy_created_at else None,
                    db,
                )
                item["converted_total_price"] = conv_cents / 100
                item["converted_currency"] = target_ccy
                item["conversion_rate_stale"] = stale
            except (ValueError, Exception):
                pass
        formatted_orders.append(item)

    result = {"orders": formatted_orders, "total": total, "skip": skip, "limit": limit}
    if target_ccy:
        result["target_currency"] = target_ccy
    return result


@router.get("/{order_id}", tags=["Orders"])
async def get_order(
    order_id: int,
    context: UserContext = Depends(require_permission(Permission.READ_ORDER)),
    db: Session = Depends(get_db)
):
    """
    Get single order details
    Requires: READ_ORDER permission (all roles)

    Args:
        order_id: Order ID

    Returns:
        Order details
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.tenant_id == context.tenant_id
    ).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ensure_tenant_access(order.tenant_id, context)

    is_supplier = context.role.lower() == "supplier"
    if is_supplier and order.supplier_user_id != context.user_id:
        raise HTTPException(status_code=403, detail="Order not assigned to supplier")

    items = order.line_items or []
    if is_supplier:
        sanitized_items = []
        for item in items:
            if isinstance(item, dict):
                redacted = {k: v for k, v in item.items() if k not in ("price", "currency", "product_data")}
                sanitized_items.append(redacted)
            else:
                sanitized_items.append(item)
        items = sanitized_items

    # Get shipments (tracking information)
    shipments = order.shipments or []
    if isinstance(shipments, str):
        import json
        try:
            shipments = json.loads(shipments)
        except:
            shipments = []
    
    # Look up supplier info
    supplier_user = None
    if order.supplier_user_id:
        supplier_user = db.query(User).filter(User.id == order.supplier_user_id).first()

    return {
        "id": order.id,
        "etsy_receipt_id": order.etsy_receipt_id,
        "shop_id": order.shop_id,
        "supplier_user_id": order.supplier_user_id,
        "supplier_name": supplier_user.name if supplier_user else None,
        "supplier_email": supplier_user.email if supplier_user else None,
        "buyer_name": order.buyer_name,
        "buyer_email": order.buyer_email,
        "total_price": None if is_supplier else float(order.total_price or 0) / 100,
        "currency": order.currency or "USD",
        "status": derive_lifecycle_status(order),
        "lifecycle_status": derive_lifecycle_status(order),
        "payment_status": order.payment_status or derive_payment_status(order),
        "fulfillment_status": order.fulfillment_status or "unshipped",
        "shipping_address": build_shipping_address(order),
        "items": items,
        "shipments": shipments,
        "created_at": (
            (order.etsy_created_at or order.created_at).isoformat()
            if (order.etsy_created_at or order.created_at)
            else None
        ),
        "updated_at": (
            (order.etsy_updated_at or order.updated_at).isoformat()
            if (order.etsy_updated_at or order.updated_at)
            else None
        ),
        "synced_at": order.synced_at.isoformat() if order.synced_at else None,
    }


@router.post("/sync", tags=["Orders"])
async def sync_orders(
    force_full_sync: bool = False,
    shop_id: Optional[int] = None,
    context: UserContext = Depends(require_permission(Permission.SYNC_ORDER)),
    db: Session = Depends(get_db)
):
    """
    Trigger order synchronization from Etsy
    Requires: SYNC_ORDER permission (Owner, Admin only)

    This endpoint will:
    1. Fetch latest orders from Etsy API
    2. Update existing orders
    3. Create new orders
    4. Return sync summary
    """
    from app.worker.tasks.order_tasks import sync_orders as sync_orders_task
    
    # Get connected shops for this tenant (optionally scoped)
    shops_query = db.query(Shop).filter(
        Shop.tenant_id == context.tenant_id,
        Shop.status == 'connected'
    )
    if shop_id:
        ensure_shop_access(shop_id, context, db)
        shops_query = shops_query.filter(Shop.id == shop_id)
    shops = shops_query.all()
    
    if not shops:
        raise HTTPException(
            status_code=400,
            detail="No connected shops found. Please connect an Etsy shop first."
        )
    
    try:
        task = sync_orders_task.delay(
            tenant_id=context.tenant_id,
            shop_id=shop_id,
            force_full_sync=force_full_sync,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue order sync: {str(e)}")

    return {
        "message": "Order sync queued",
        "task_id": task.id,
        "shops_queued": len(shops),
        "status": "queued",
        "force_full_sync": force_full_sync,
        "shop_id": shop_id,
    }


@router.post("/mark-viewed", tags=["Orders"])
async def mark_orders_viewed(
    context: UserContext = Depends(require_permission(Permission.READ_ORDER)),
    db: Session = Depends(get_db),
):
    """
    Record the user's latest order view timestamp for unread counts.
    """
    membership = db.query(Membership).filter(
        Membership.user_id == context.user_id,
        Membership.tenant_id == context.tenant_id,
        Membership.invitation_status == "accepted",
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Membership not found")

    membership.last_orders_viewed_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Orders marked as viewed"}


@router.post("/{order_id}/assign-supplier", tags=["Orders"])
async def assign_supplier(
    order_id: int,
    request: AssignSupplierRequest,
    context: UserContext = Depends(require_permission(Permission.ASSIGN_ORDER)),
    db: Session = Depends(get_db),
):
    """
    Assign a supplier to a specific order.
    Requires: ASSIGN_ORDER permission (Owner, Admin)
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.tenant_id == context.tenant_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ensure_shop_access(order.shop_id, context, db)

    supplier_membership = db.query(Membership).filter(
        Membership.user_id == request.supplier_user_id,
        Membership.tenant_id == context.tenant_id,
        Membership.role == "supplier",
        Membership.invitation_status == "accepted",
    ).first()
    if not supplier_membership:
        raise HTTPException(status_code=400, detail="Supplier membership not found")

    supplier_user = db.query(User).filter(User.id == request.supplier_user_id).first()
    if not supplier_user:
        raise HTTPException(status_code=404, detail="Supplier user not found")

    order.supplier_user_id = request.supplier_user_id
    order.supplier_assigned_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "message": "Supplier assigned",
        "order_id": order.id,
        "supplier_user_id": request.supplier_user_id,
        "supplier_email": supplier_user.email,
    }


@router.post("/{order_id}/fulfill", tags=["Orders"])
async def fulfill_order(
    order_id: int,
    request: FulfillmentRequest,
    context: UserContext = Depends(require_permission(Permission.UPDATE_FULFILLMENT)),
    db: Session = Depends(get_db),
):
    """
    Submit fulfillment tracking details for an order and sync to Etsy.
    Requires: UPDATE_FULFILLMENT permission (Owner/Admin/Supplier)
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.tenant_id == context.tenant_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ensure_shop_access(order.shop_id, context, db)

    # Suppliers can only fulfill orders assigned to them
    if context.role.lower() == "supplier" and order.supplier_user_id != context.user_id:
        raise HTTPException(status_code=403, detail="Order not assigned to supplier")

    if not order.etsy_receipt_id:
        raise HTTPException(
            status_code=400,
            detail="Order has no Etsy receipt ID — cannot sync tracking to Etsy.",
        )

    # Normalize existing shipments to a list
    existing_shipments = order.shipments or []
    if isinstance(existing_shipments, str):
        try:
            existing_shipments = json.loads(existing_shipments)
        except Exception:
            existing_shipments = []
    if not isinstance(existing_shipments, list):
        existing_shipments = []

    for shipment in existing_shipments:
        if (
            shipment.get("tracking_code") == request.tracking_code
            and (shipment.get("carrier_name") or "").lower() == (request.carrier_name or "").lower()
        ):
            return {"message": "Tracking already submitted", "status": "already_synced"}

    ship_date_ts = None
    ship_date_dt: Optional[datetime] = None
    if request.ship_date:
        try:
            normalized = request.ship_date.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            ship_date_ts = int(parsed.timestamp())
            ship_date_dt = parsed
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid ship_date format")

    shop = db.query(Shop).filter(Shop.id == order.shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    etsy_client = EtsyClient(db)

    try:
        etsy_response = await etsy_client.create_receipt_shipment(
            shop_id=order.shop_id,
            etsy_shop_id=shop.etsy_shop_id,
            receipt_id=str(order.etsy_receipt_id),
            tracking_code=request.tracking_code,
            carrier_name=request.carrier_name,
            ship_date=ship_date_ts,
            note=request.note,
            send_bcc=request.send_bcc,
        )
    except EtsyRateLimitError:
        raise HTTPException(
            status_code=429,
            detail="Etsy rate limit hit — please try again shortly.",
        )
    except EtsyAPIError as e:
        # Log full Etsy error context for debugging (status, response body, message)
        logger.error(
            "Etsy API error in fulfill_order: status=%s response=%s message=%s",
            getattr(e, "status_code", None),
            getattr(e, "response", None),
            getattr(e, "message", None),
        )

        status_code = e.status_code or 500

        # Duplicate tracking — treat as success, tracking is already on Etsy
        if status_code == 400 and getattr(e, "response", None) and "already in use" in str(e.response):
            return {"message": "Tracking already recorded on Etsy", "status": "already_synced"}

        if status_code == 401:
            raise HTTPException(
                status_code=502,
                detail="Etsy shop connection expired — please reconnect your shop.",
            )
        if status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="Etsy receipt not found — order may have been cancelled.",
            )

        if status_code == 400:
            # Surface the actual Etsy validation message cleanly
            etsy_msg = e.response.get("error", str(e)) if isinstance(e.response, dict) else str(e)
            raise HTTPException(
                status_code=422,
                detail=f"Etsy rejected this update: {etsy_msg}",
            )

        raise HTTPException(
            status_code=502,
            detail=f"Etsy error: {e.message}",
        )

    # Look up actor name for metadata
    actor_user = db.query(User).filter(User.id == context.user_id).first()

    shipment_entry = {
        "tracking_code": request.tracking_code,
        "carrier_name": request.carrier_name,
        "shipping_date": request.ship_date,
        "tracking_url": etsy_response.get("tracking_url") if isinstance(etsy_response, dict) else None,
        "notification_date": datetime.now(timezone.utc).isoformat(),
        "source": "etsy_sync",
        "recorded_by_user_id": context.user_id,
        "recorded_by_name": actor_user.name if actor_user else None,
        "recorded_by_role": context.role,
    }
    existing_shipments.append(shipment_entry)

    # Record canonical shipment state transition
    previous_state = order.lifecycle_status
    order.shipments = existing_shipments
    order.fulfillment_status = "shipped"
    if order.lifecycle_status not in ("completed", "cancelled", "refunded"):
        order.lifecycle_status = "in_transit"
    order.status = order.status if order.status in ("cancelled", "refunded") else "shipped"
    order.synced_at = datetime.now(timezone.utc)
    
    # Create shipment event for analytics
    shipment_event = ShipmentEvent(
        order_id=order.id,
        tenant_id=order.tenant_id,
        shop_id=order.shop_id,
        state="shipped",
        previous_state=previous_state,
        tracking_code=request.tracking_code,
        carrier_name=request.carrier_name,
        tracking_url=etsy_response.get("tracking_url") if isinstance(etsy_response, dict) else None,
        source="etsy_sync",
        actor_user_id=context.user_id,
        actor_role=context.role,
        event_timestamp=datetime.now(timezone.utc),
        shipped_at=ship_date_dt or datetime.now(timezone.utc),
        notes=request.note,
        event_metadata={"etsy_response": etsy_response if isinstance(etsy_response, dict) else None},
    )
    db.add(shipment_event)

    audit = AuditLog(
        request_id=str(uuid.uuid4()),
        actor_user_id=context.user_id,
        actor_email=context.email,
        actor_ip=None,
        tenant_id=order.tenant_id,
        shop_id=order.shop_id,
        action="orders.fulfillment.update",
        target_type="order",
        target_id=str(order.etsy_receipt_id or order.id),
        http_method="POST",
        http_path=f"/api/orders/{order.id}/fulfill",
        http_status=200,
        status="success",
        error_message=None,
        request_metadata=AuditLog.sanitize_metadata({
            "tracking_code": request.tracking_code,
            "carrier_name": request.carrier_name,
            "ship_date": request.ship_date,
        }),
        response_metadata=None,
        attempt=1,
        latency_ms=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit)

    db.commit()

    return {"message": "Fulfillment synced", "status": "ok"}


@router.post("/{order_id}/tracking", tags=["Orders"])
async def record_manual_tracking(
    order_id: int,
    request: ManualTrackingRequest,
    context: UserContext = Depends(require_permission(Permission.UPDATE_FULFILLMENT)),
    db: Session = Depends(get_db),
):
    """
    Record manual tracking details for an order (no Etsy sync).
    Requires: UPDATE_FULFILLMENT permission (Owner/Admin/Supplier)
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.tenant_id == context.tenant_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ensure_shop_access(order.shop_id, context, db)

    if context.role.lower() == "supplier" and order.supplier_user_id != context.user_id:
        raise HTTPException(status_code=403, detail="Order not assigned to supplier")

    # Normalize existing shipments to a list
    existing_shipments = order.shipments or []
    if isinstance(existing_shipments, str):
        try:
            existing_shipments = json.loads(existing_shipments)
        except Exception:
            existing_shipments = []
    if not isinstance(existing_shipments, list):
        existing_shipments = []

    for shipment in existing_shipments:
        if (
            shipment.get("tracking_code") == request.tracking_code
            and (shipment.get("carrier_name") or "").lower() == (request.carrier_name or "").lower()
        ):
            return {"message": "Tracking already submitted", "status": "already_recorded"}

    ship_date_ts = None
    ship_date_dt: Optional[datetime] = None
    if request.ship_date:
        try:
            normalized = request.ship_date.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            ship_date_ts = int(parsed.timestamp())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid ship_date format")

    # Look up actor name for metadata
    actor_user = db.query(User).filter(User.id == context.user_id).first()

    shipment_entry = {
        "tracking_code": request.tracking_code,
        "carrier_name": request.carrier_name,
        "shipping_date": request.ship_date,
        "shipping_date_ts": ship_date_ts,
        "note": request.note,
        "source": "manual",
        "recorded_by_user_id": context.user_id,
        "recorded_by_name": actor_user.name if actor_user else None,
        "recorded_by_role": context.role,
        "notification_date": datetime.now(timezone.utc).isoformat(),
    }
    existing_shipments.append(shipment_entry)

    # Record canonical shipment state transition
    previous_state = order.lifecycle_status
    order.shipments = existing_shipments
    order.fulfillment_status = "shipped"
    if order.lifecycle_status not in ("completed", "cancelled", "refunded"):
        order.lifecycle_status = "in_transit"
    order.status = order.status if order.status in ("cancelled", "refunded") else "shipped"
    order.synced_at = datetime.now(timezone.utc)
    
    # Create shipment event for analytics
    shipment_event = ShipmentEvent(
        order_id=order.id,
        tenant_id=order.tenant_id,
        shop_id=order.shop_id,
        state="shipped",
        previous_state=previous_state,
        tracking_code=request.tracking_code,
        carrier_name=request.carrier_name,
        tracking_url=None,
        source="manual",
        actor_user_id=context.user_id,
        actor_role=context.role,
        event_timestamp=datetime.now(timezone.utc),
        shipped_at=ship_date_dt or datetime.now(timezone.utc),
        notes=request.note,
        event_metadata=None,
    )
    db.add(shipment_event)

    audit = AuditLog(
        request_id=str(uuid.uuid4()),
        actor_user_id=context.user_id,
        actor_email=context.email,
        actor_ip=None,
        tenant_id=order.tenant_id,
        shop_id=order.shop_id,
        action="orders.tracking.manual",
        target_type="order",
        target_id=str(order.etsy_receipt_id or order.id),
        http_method="POST",
        http_path=f"/api/orders/{order.id}/tracking",
        http_status=200,
        status="success",
        error_message=None,
        request_metadata=AuditLog.sanitize_metadata({
            "tracking_code": request.tracking_code,
            "carrier_name": request.carrier_name,
            "ship_date": request.ship_date,
        }),
        response_metadata=None,
        attempt=1,
        latency_ms=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit)
    db.commit()

    return {"message": "Tracking recorded", "status": "ok"}
