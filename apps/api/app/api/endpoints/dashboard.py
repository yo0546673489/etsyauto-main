"""
Dashboard API Endpoints
Provides aggregated statistics for the dashboard
"""

from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import date, datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, or_, and_

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


def _parse_date_range(start_date: Optional[date], end_date: Optional[date]):
    """Convert date params to aware datetimes (UTC start-of-day / end-of-day)."""
    dt_start = datetime(start_date.year, start_date.month, start_date.day,
                        0, 0, 0, tzinfo=timezone.utc) if start_date else None
    dt_end = datetime(end_date.year, end_date.month, end_date.day,
                      23, 59, 59, tzinfo=timezone.utc) if end_date else None
    return dt_start, dt_end


@router.get("/stats", tags=["Dashboard"])
async def get_dashboard_stats(
    shop_id: int | None = None,
    shop_ids: str | None = None,
    start_date: Optional[date] = Query(None, description="Filter start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Filter end date (YYYY-MM-DD)"),
    display_currency: Optional[str] = Query(None, description="Target currency for balance conversion (e.g. ILS, USD)"),
    context: UserContext = Depends(get_user_context),
    db: Session = Depends(get_db)
):
    """
    Get dashboard statistics — filterable by date range.
    Available to: all authenticated users
    """
    # ── Shop filtering ──────────────────────────────────────────────────
    parsed_shop_ids = []
    if shop_ids:
        parsed_shop_ids = [int(x) for x in shop_ids.split(',') if x.strip().isdigit()]
        for sid in parsed_shop_ids:
            ensure_shop_access(sid, context, db)
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        parsed_shop_ids = [shop_id]
    elif context.role.lower() == "supplier" and context.allowed_shop_ids:
        parsed_shop_ids = context.allowed_shop_ids

    # ── Date range ──────────────────────────────────────────────────────
    dt_start, dt_end = _parse_date_range(start_date, end_date)
    date_filtered = dt_start is not None or dt_end is not None

    # ── Products (cumulative — not date-filtered) ───────────────────────
    products_query = filter_by_tenant(
        db.query(Product), context.tenant_id, Product.tenant_id
    )
    if parsed_shop_ids:
        products_query = products_query.filter(
            or_(Product.shop_id.in_(parsed_shop_ids), Product.shop_id.is_(None))
        )
    total_products = products_query.count()
    published_products = products_query.filter(Product.etsy_listing_id.isnot(None)).count()
    active_listings = published_products

    # ── Total shop views (cumulative Etsy listing views) ───────────────
    total_views = 0
    try:
        total_views = int(
            products_query.filter(Product.etsy_listing_id.isnot(None))
            .with_entities(func.coalesce(func.sum(Product.views), 0))
            .scalar() or 0
        )
    except Exception:
        total_views = 0

    # ── Today's shop visits from Etsy stats API ─────────────────────────
    today_visits = 0
    if parsed_shop_ids:
        from app.models.tenancy import Shop
        from app.services.etsy_client import EtsyClient
        etsy_client = EtsyClient(db)
        for sid in parsed_shop_ids[:1]:
            try:
                shop_obj = db.query(Shop).filter(Shop.id == sid).first()
                if shop_obj and shop_obj.etsy_shop_id and shop_obj.status == "connected":
                    today_start = int(datetime.now(timezone.utc).replace(
                        hour=0, minute=0, second=0, microsecond=0).timestamp())
                    today_end = int(datetime.now(timezone.utc).timestamp())
                    stats_data = await etsy_client.get_shop_stats(
                        shop_id=sid,
                        etsy_shop_id=shop_obj.etsy_shop_id,
                        start_date=today_start,
                        end_date=today_end,
                        granularity="day",
                    )
                    visits = stats_data.get("visit_count") or stats_data.get("visits") or 0
                    today_visits = sum(v.get("value", 0) for v in visits) \
                        if isinstance(visits, list) else int(visits)
            except Exception:
                pass

    # ── Orders (date-filterable) ────────────────────────────────────────
    orders_query = filter_by_tenant(
        db.query(Order), context.tenant_id, Order.tenant_id
    )
    if parsed_shop_ids:
        orders_query = orders_query.filter(Order.shop_id.in_(parsed_shop_ids))
    if context.role.lower() == "supplier":
        orders_query = orders_query.filter(Order.supplier_user_id == context.user_id)

    # Apply date filter using Etsy date (most accurate) falling back to created_at
    order_date_col = func.coalesce(Order.etsy_created_at, Order.created_at)
    if dt_start:
        orders_query = orders_query.filter(order_date_col >= dt_start)
    if dt_end:
        orders_query = orders_query.filter(order_date_col <= dt_end)

    total_orders = orders_query.count()

    # ── Unique customers (date-filterable) ─────────────────────────────
    customers_base = db.query(func.count(distinct(Order.buyer_email))).filter(
        Order.tenant_id == context.tenant_id,
        Order.buyer_email.isnot(None)
    )
    if parsed_shop_ids:
        customers_base = customers_base.filter(Order.shop_id.in_(parsed_shop_ids))
    if context.role.lower() == "supplier":
        customers_base = customers_base.filter(Order.supplier_user_id == context.user_id)
    if dt_start:
        customers_base = customers_base.filter(order_date_col >= dt_start)
    if dt_end:
        customers_base = customers_base.filter(order_date_col <= dt_end)
    total_customers = customers_base.scalar() or 0

    # ── New/unread orders ───────────────────────────────────────────────
    membership = db.query(Membership).filter(
        Membership.user_id == context.user_id,
        Membership.tenant_id == context.tenant_id,
        Membership.invitation_status == 'accepted'
    ).first()
    last_viewed_at = membership.last_orders_viewed_at if membership else None
    if last_viewed_at:
        new_orders_unread = orders_query.filter(order_date_col > last_viewed_at).count()
    else:
        new_orders_unread = total_orders

    # ── Current balance + available for deposit ─────────────────────────
    available_for_payout = 0
    available_for_deposit = None   # None = unknown (show —)
    payout_currency = "ILS"
    payout_label = "יתרה נוכחית"

    # 1st attempt: pull balance directly from Etsy's payment-account API (real-time)
    etsy_balance_fetched = False
    if parsed_shop_ids and len(parsed_shop_ids) == 1:
        try:
            from app.models.tenancy import Shop
            from app.services.etsy_client import EtsyClient
            _etsy = EtsyClient(db)
            _shop = db.query(Shop).filter(Shop.id == parsed_shop_ids[0]).first()
            if _shop and _shop.etsy_shop_id and _shop.status == "connected":
                acct = await _etsy.get_payment_account(
                    shop_id=parsed_shop_ids[0],
                    etsy_shop_id=_shop.etsy_shop_id,
                )
                import logging as _log
                _log.getLogger(__name__).warning(f"[BALANCE DEBUG] payment_account raw={acct!r}")
                if acct and isinstance(acct, dict):
                    def _extract_amount(field_name: str):
                        obj = acct.get(field_name)
                        if obj is None:
                            return None, None
                        if isinstance(obj, dict):
                            amount = obj.get("amount")
                            divisor = obj.get("divisor") or 100
                            ccy = obj.get("currency_code", "ILS")
                            if amount is not None:
                                return float(amount) / float(divisor), ccy
                        elif isinstance(obj, (int, float)):
                            return float(obj), acct.get("currency_code", "ILS")
                        return None, None

                    val, ccy = _extract_amount("available_funds")
                    if val is None:
                        val, ccy = _extract_amount("available_amount")
                    if val is None:
                        val, ccy = _extract_amount("balance")

                    # available for deposit (what can be withdrawn to bank)
                    dep_val, _ = _extract_amount("available_for_deposit")
                    if dep_val is None:
                        dep_val, _ = _extract_amount("pending_funds")

                    _log.getLogger(__name__).warning(f"[BALANCE DEBUG] extracted val={val} ccy={ccy} deposit={dep_val}")
                    if val is not None:
                        available_for_payout = val
                        payout_currency = ccy or "ILS"
                        etsy_balance_fetched = True
                    if dep_val is not None:
                        available_for_deposit = dep_val
        except Exception as _e:
            import logging as _log2
            _log2.getLogger(__name__).warning(f"[BALANCE DEBUG] exception: {_e!r}")

    # 2nd attempt (fallback): compute from locally-synced ledger entries
    if not etsy_balance_fetched:
        try:
            svc = FinancialService(db)
            payout_data = svc.get_payout_estimate(
                tenant_id=context.tenant_id,
                shop_ids=parsed_shop_ids if parsed_shop_ids else None,
            )
            # current_balance = SUM(all ledger amounts) = true account balance
            available_for_payout = payout_data.get("current_balance", 0) / 100
            payout_currency = payout_data.get("currency", "ILS")
            # available_for_deposit: balance minus in-clearing net amount
            available_for_deposit = payout_data.get("available_for_deposit", 0) / 100
        except Exception:
            available_for_payout = 0
            payout_currency = "ILS"

    # ── Monthly net profit ──────────────────────────────────────────────
    monthly_net_profit = None
    try:
        now_utc = datetime.now(timezone.utc)
        month_start = datetime(now_utc.year, now_utc.month, 1, tzinfo=timezone.utc)
        svc = FinancialService(db)
        pnl = svc.get_profit_and_loss(
            tenant_id=context.tenant_id,
            shop_ids=parsed_shop_ids if parsed_shop_ids else None,
            start_date=month_start,
            end_date=now_utc,
        )
        monthly_net_profit = pnl.get("net_profit", 0) / 100
    except Exception:
        pass

    # ── Currency conversion for display ────────────────────────────────
    display_amount = None
    display_deposit_amount = None
    display_monthly_net_profit = None
    display_currency_out = None
    if display_currency:
        target_ccy = display_currency.upper().strip()
        if target_ccy in SUPPORTED_CURRENCIES and target_ccy != payout_currency:
            try:
                if available_for_payout is not None:
                    amount_cents = int(round(available_for_payout * 100))
                    converted_cents, _rate, _retrieved, _stale = convert_amount(
                        amount_cents, payout_currency, target_ccy, db=db
                    )
                    display_amount = converted_cents / 100
                    display_currency_out = target_ccy
                if available_for_deposit is not None:
                    dep_cents = int(round(available_for_deposit * 100))
                    conv_dep, _, _, _ = convert_amount(dep_cents, payout_currency, target_ccy, db=db)
                    display_deposit_amount = conv_dep / 100
                if monthly_net_profit is not None:
                    mnp_cents = int(round(monthly_net_profit * 100))
                    conv_mnp, _, _, _ = convert_amount(mnp_cents, payout_currency, target_ccy, db=db)
                    display_monthly_net_profit = conv_mnp / 100
            except Exception:
                pass

    return {
        "total_products": total_products,
        "published_products": published_products,
        "total_views": total_views,
        "today_visits": today_visits,
        "total_customers": total_customers,
        "total_orders": total_orders,
        "active_listings": active_listings,
        "new_orders_unread": new_orders_unread,
        "available_for_payout": available_for_payout,
        "available_for_deposit": available_for_deposit,
        "monthly_net_profit": monthly_net_profit,
        "display_monthly_net_profit": display_monthly_net_profit,
        "payout_currency": payout_currency,
        "payout_label": payout_label,
        "display_amount": display_amount,
        "display_deposit_amount": display_deposit_amount,
        "display_currency": display_currency_out,
        "date_filtered": date_filtered,
        "changes": {
            "products": 12,
            "customers": 8,
            "orders": 15,
            "listings": 5,
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
    start_date: Optional[date] = Query(None, description="Filter start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Filter end date (YYYY-MM-DD)"),
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_permission(Permission.READ_ORDER)),
    db: Session = Depends(get_db)
):
    """
    Get recent orders for dashboard — filterable by date range.
    """
    dt_start, dt_end = _parse_date_range(start_date, end_date)
    order_date_col = func.coalesce(Order.etsy_created_at, Order.created_at)

    orders_query = filter_by_tenant(
        db.query(Order), context.tenant_id, Order.tenant_id
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

    if dt_start:
        orders_query = orders_query.filter(order_date_col >= dt_start)
    if dt_end:
        orders_query = orders_query.filter(order_date_col <= dt_end)

    from sqlalchemy import nullslast
    orders = orders_query.order_by(
        nullslast(Order.etsy_created_at.desc()),
        Order.created_at.desc()
    ).limit(limit).all()

    target_ccy = _get_target_currency(context, target_currency, db)

    formatted_orders = []
    for order in orders:
        order_date = order.etsy_created_at or order.created_at
        is_supplier = context.role.lower() == "supplier"
        order_currency = order.currency or "USD"

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
                    order.etsy_created_at if order.etsy_created_at else None, db,
                )
                conv_price = conv_cents / 100
                conv_ccy = target_ccy
                amount_str = f"{conv_ccy} {conv_price:.2f}"
                item_conv_rate = float(rate)
                item_conv_stale = stale
            except Exception:
                amount_str = "--" if total_price is None else f"{order_currency} {total_price:.2f}"
                item_conv_rate = None
                item_conv_stale = False
        else:
            amount_str = "--" if is_supplier else (
                f"{order_currency} {total_price:.2f}" if total_price is not None else "--"
            )
            item_conv_rate = None
            item_conv_stale = False

        item = {
            "id": order.id,
            "order_id": order.etsy_receipt_id or f"#{order.id}",
            "shop_id": order.shop_id,
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
