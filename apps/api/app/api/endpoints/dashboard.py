"""
Dashboard API Endpoints
Provides aggregated statistics for the dashboard
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, or_

from app.api.dependencies import get_user_context, UserContext, require_permission
from app.core.database import get_db
from app.core.rbac import Permission
from app.core.query_helpers import filter_by_tenant, ensure_shop_access
from app.models.products import Product
from app.models.orders import Order
from app.models.tenancy import Membership
from app.models.user_preferences import UserPreference
from app.services.financial_service import FinancialService
from app.services.exchange_rate_service import convert_amount, SUPPORTED_CURRENCIES
from app.services.order_utils import derive_payment_status, derive_lifecycle_status

router = APIRouter()


@router.get("/stats", tags=["Dashboard"])
async def get_dashboard_stats(
    shop_id: int | None = None,
    shop_ids: str | None = None,
    context: UserContext = Depends(get_user_context),  # Dashboard accessible to all authenticated users
    db: Session = Depends(get_db)
):
    """
    Get dashboard statistics
    Available to: all authenticated users

    Returns:
    - total_products: Total number of products
    - total_customers: Unique customers count (from orders)
    - total_orders: Total number of orders
    - active_listings: Number of active/completed listing jobs
    - recent_activity: Recent changes summary
    """
    # Parse shop_ids for multi-shop support
    parsed_shop_ids = []
    if shop_ids:
        parsed_shop_ids = [int(x) for x in shop_ids.split(',') if x.strip().isdigit()]
        for sid in parsed_shop_ids:
            ensure_shop_access(sid, context, db)
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        parsed_shop_ids = [shop_id]
    elif context.role.lower() == "supplier" and context.allowed_shop_ids:
        # Suppliers: default to their assigned shops when no filter passed
        parsed_shop_ids = context.allowed_shop_ids

    # Count products (include shop_id=null for manual/CSV imports when filtering by shop)
    products_query = filter_by_tenant(
        db.query(Product),
        context.tenant_id,
        Product.tenant_id
    )
    if parsed_shop_ids:
        products_query = products_query.filter(or_(Product.shop_id.in_(parsed_shop_ids), Product.shop_id.is_(None)))
    total_products = products_query.count()
    published_products = products_query.filter(Product.etsy_listing_id.isnot(None)).count()

    # Active listings = products that have been published to Etsy
    active_listings = published_products

    # Count total orders (filtered by tenant)
    orders_query = filter_by_tenant(
        db.query(Order),
        context.tenant_id,
        Order.tenant_id
    )
    if parsed_shop_ids:
        orders_query = orders_query.filter(Order.shop_id.in_(parsed_shop_ids))
    if context.role.lower() == "supplier":
        orders_query = orders_query.filter(Order.supplier_user_id == context.user_id)
    total_orders = orders_query.count()

    # Count unique customers (from orders, filtered by tenant)
    customers_query = db.query(
        func.count(distinct(Order.buyer_email))
    ).filter(
        Order.tenant_id == context.tenant_id,
        Order.buyer_email.isnot(None)
    )
    if parsed_shop_ids:
        customers_query = customers_query.filter(Order.shop_id.in_(parsed_shop_ids))
    if context.role.lower() == "supplier":
        customers_query = customers_query.filter(Order.supplier_user_id == context.user_id)
    total_customers = customers_query.scalar() or 0

    # Get percentage changes (mock for now, would need historical data)
    # In a real implementation, you'd compare with previous period
    product_change = 12  # +12%
    customer_change = 8   # +8%
    order_change = 15     # +15%
    listing_change = 5    # +5%

    membership = db.query(Membership).filter(
        Membership.user_id == context.user_id,
        Membership.tenant_id == context.tenant_id,
        Membership.invitation_status == 'accepted'
    ).first()
    last_viewed_at = membership.last_orders_viewed_at if membership else None

    if last_viewed_at:
        new_orders_unread = orders_query.filter(
            func.coalesce(Order.etsy_created_at, Order.created_at) > last_viewed_at
        ).count()
    else:
        new_orders_unread = orders_query.count()

    # Get available_for_payout using FinancialService (handles ledger fallback when payment-account API unavailable)
    try:
        svc = FinancialService(db)
        payout_data = svc.get_payout_estimate(
            tenant_id=context.tenant_id,
            shop_ids=parsed_shop_ids if parsed_shop_ids else None,
        )
        available_for_payout = payout_data.get("available_for_payout", 0) / 100
        payout_currency = payout_data.get("currency", "USD")
    except Exception:
        available_for_payout = 0
        payout_currency = "USD"

    return {
        "total_products": total_products,
        "published_products": published_products,
        "total_customers": total_customers,
        "total_orders": total_orders,
        "active_listings": active_listings,
        "new_orders_unread": new_orders_unread,
        "available_for_payout": available_for_payout,
        "payout_currency": payout_currency,
        "changes": {
            "products": product_change,
            "customers": customer_change,
            "orders": order_change,
            "listings": listing_change
        }
    }


def _get_target_currency(context: UserContext, target_param: Optional[str], db: Session) -> Optional[str]:
    """Get target currency from query param or user preference."""
    if target_param:
        return target_param.upper().strip() if target_param.upper().strip() in SUPPORTED_CURRENCIES else None
    pref = db.query(UserPreference).filter(UserPreference.user_id == context.user_id).first()
    if pref and pref.preferred_currency_code in SUPPORTED_CURRENCIES:
        return pref.preferred_currency_code
    return None


@router.get("/recent-orders", tags=["Dashboard"])
async def get_recent_orders(
    limit: int = 5,
    shop_id: int | None = None,
    shop_ids: str | None = None,
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_permission(Permission.READ_ORDER)),
    db: Session = Depends(get_db)
):
    """
    Get recent orders for dashboard
    Requires: READ_ORDER permission (all roles)
    Supports: shop_id (single) or shop_ids (comma-separated) for multi-shop filtering

    Args:
        limit: Number of orders to return (default 5)

    Returns:
        List of recent orders with basic info
    """
    # Get recent orders (filtered by tenant)
    orders_query = filter_by_tenant(
        db.query(Order),
        context.tenant_id,
        Order.tenant_id
    )
    if shop_ids:
        parsed_ids = [int(x) for x in shop_ids.split(',') if x.strip().isdigit()]
        for sid in parsed_ids:
            ensure_shop_access(sid, context, db)
        if parsed_ids:
            orders_query = orders_query.filter(Order.shop_id.in_(parsed_ids))
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        orders_query = orders_query.filter(Order.shop_id == shop_id)
    if context.role.lower() == "supplier":
        orders_query = orders_query.filter(Order.supplier_user_id == context.user_id)
    
    # Order by Etsy date first (most accurate), fall back to local created_at
    from sqlalchemy import nullslast
    orders = orders_query.order_by(
        nullslast(Order.etsy_created_at.desc()),
        Order.created_at.desc()
    ).limit(limit).all()

    target_ccy = _get_target_currency(context, target_currency, db)

    # Format orders for dashboard display
    formatted_orders = []
    for order in orders:
        # Prioritize Etsy-provided dates for accuracy
        order_date = order.etsy_created_at or order.created_at
        is_supplier = context.role.lower() == "supplier"
        order_currency = order.currency or "USD"

        # Get first item title if available
        item_title = "N/A"
        if order.line_items and isinstance(order.line_items, list) and len(order.line_items) > 0:
            first_item = order.line_items[0]
            if isinstance(first_item, dict):
                item_title = first_item.get('title') or first_item.get('product_title') or "N/A"

        total_price = None if is_supplier else float(order.total_price or 0) / 100
        conv_price = None
        conv_ccy = None
        if not is_supplier and target_ccy and target_ccy != order_currency and order.total_price:
            try:
                conv_cents, rate, retrieved, stale = convert_amount(
                    order.total_price, order_currency, target_ccy,
                    order.etsy_created_at if order.etsy_created_at else None,
                    db,
                )
                conv_price = conv_cents / 100
                conv_ccy = target_ccy
                amount_str = f"{conv_ccy} {conv_price:.2f}"
                item_conv_rate = float(rate)
                item_conv_stale = stale
            except (ValueError, Exception):
                amount_str = "--" if total_price is None else f"{order_currency} {total_price:.2f}"
                item_conv_rate = None
                item_conv_stale = False
        else:
            amount_str = "--" if is_supplier else (f"{order_currency} {total_price:.2f}" if total_price is not None else "--")
            item_conv_rate = None
            item_conv_stale = False

        item = {
            "id": order.id,
            "order_id": order.etsy_receipt_id or f"#{order.id}",
            "buyer_name": order.buyer_name or "Unknown Customer",
            "customer": order.buyer_name or "Unknown Customer",
            "customer_email": order.buyer_email,
            "item_title": item_title,
            "date": order_date.strftime("%Y-%m-%d") if order_date else "N/A",
            "amount": amount_str,
            "total_price": total_price,
            "currency": order_currency,
            "status": derive_lifecycle_status(order),
            "payment_status": order.payment_status or derive_payment_status(order),
        }
        if conv_price is not None and conv_ccy:
            item["converted_total_price"] = conv_price
            item["converted_currency"] = conv_ccy
            item["conversion_rate"] = item_conv_rate
            item["conversion_rate_stale"] = item_conv_stale
        formatted_orders.append(item)

    result = {"orders": formatted_orders, "total": len(formatted_orders)}
    if target_ccy:
        result["target_currency"] = target_ccy
    return result
