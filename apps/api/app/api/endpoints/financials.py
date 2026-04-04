"""
Financial Analytics API Endpoints
Owner/Admin-only access to P&L, payout estimates, fee breakdowns,
order profitability, revenue timeline, and raw ledger entries.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_user_context, UserContext, require_revenue_access
from app.core.database import get_db
from app.core.query_helpers import ensure_shop_access
from app.services.financial_service import FinancialService
from app.services.currency_conversion import enrich_financial_response
from app.models.tenancy import OAuthToken, Shop
from app.models.user_preferences import UserPreference
from app.models.financials import FinancialSyncStatus, LedgerEntryTypeRegistry
from app.worker.tasks.financial_tasks import sync_ledger_entries, sync_payment_details

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Scope check ──

@router.get("/scope-status", tags=["Financials"])
async def get_billing_scope_status(
    shop_id: Optional[int] = None,
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Check whether the active shop's OAuth token includes ``billing_r``.

    Returns ``{ has_billing_scope: bool, reconnect_url: str | null }``.
    The frontend uses this to show a graceful banner when the scope
    hasn't been granted yet, without blocking order-based analytics.
    """
    if shop_id:
        ensure_shop_access(shop_id, context, db)

    # Find the shop's Etsy OAuth token (billing_r or transactions_r for financial data)
    query = db.query(OAuthToken).filter(
        OAuthToken.provider == "etsy",
    )
    if shop_id:
        query = query.filter(OAuthToken.shop_id == shop_id)
    else:
        # Get any token for the tenant
        shop_ids = [
            s.id for s in db.query(Shop.id).filter(Shop.tenant_id == context.tenant_id).all()
        ]
        query = query.filter(OAuthToken.shop_id.in_(shop_ids))

    token = query.first()
    has_scope = False
    if token and token.scopes:
        has_scope = "billing_r" in token.scopes or "transactions_r" in token.scopes

    return {
        "has_billing_scope": has_scope,
        "reconnect_url": "/settings?tab=shops" if not has_scope else None,
    }


# ── Helpers ──

def _parse_shop_ids(
    shop_ids_str: Optional[str],
    shop_id: Optional[int],
    context: "UserContext",
    db: "Session",
) -> Optional[list]:
    """Parse comma-separated shop_ids and verify access for each."""
    if not shop_ids_str:
        if shop_id:
            ensure_shop_access(shop_id, context, db)
        return None
    try:
        ids = [int(s.strip()) for s in shop_ids_str.split(",") if s.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="shop_ids must be comma-separated integers")
    for sid in ids:
        ensure_shop_access(sid, context, db)
    return ids


def _get_target_currency(
    context: UserContext,
    target_currency_param: Optional[str],
    db: Session,
) -> Optional[str]:
    """Get target currency from query param or user preference."""
    if target_currency_param:
        return target_currency_param.upper().strip()
    pref = db.query(UserPreference).filter(UserPreference.user_id == context.user_id).first()
    if pref and pref.preferred_currency_code != "USD":
        return pref.preferred_currency_code
    return None


def _parse_date(value: Optional[str], default: datetime) -> datetime:
    """Parse an ISO date string into a timezone-aware datetime, or return default."""
    if not value:
        return default
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {value}")


# ── 0. Full Financial Summary (ordered blocks) ──

@router.get("/summary", tags=["Financials"])
async def get_financial_summary(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    force_refresh: bool = Query(False, description="Bypass cache and fetch fresh data"),
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Full financial summary in ordered blocks:
    Revenue → Etsy Fees → Advertising → Product Costs → Invoice Expenses → Total Expenses → Net Profit.
    Supports multi-store via shop_ids parameter.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    result = svc.get_financial_summary(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        start_date=_parse_date(start_date, datetime.now(timezone.utc) - timedelta(days=30)),
        end_date=_parse_date(end_date, datetime.now(timezone.utc)),
        shop_ids=parsed_shop_ids,
        force_refresh=force_refresh,
    )
    target = _get_target_currency(context, target_currency, db)
    if target:
        result = enrich_financial_response(result, target, db)
    return result


# ── 1. Profit & Loss ──

@router.get("/profit-and-loss", tags=["Financials"])
async def get_profit_and_loss(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get profit & loss summary for the selected period.
    Requires Owner/Admin/Viewer role.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    result = svc.get_profit_and_loss(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        start_date=_parse_date(start_date, datetime.now(timezone.utc) - timedelta(days=30)),
        end_date=_parse_date(end_date, datetime.now(timezone.utc)),
        shop_ids=parsed_shop_ids,
    )
    target = _get_target_currency(context, target_currency, db)
    if target:
        result = enrich_financial_response(result, target, db)
    return result


# ── 2. Payout estimate ──

@router.get("/payout-estimate", tags=["Financials"])
async def get_payout_estimate(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get estimated next payout amount and recent payout history.
    Requires Owner/Admin/Viewer role.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    # Reject tenant-wide payout when multiple shops exist (ambiguous)
    if not parsed_shop_ids and not shop_id:
        shop_count = db.query(Shop).filter(Shop.tenant_id == context.tenant_id).count()
        if shop_count > 1:
            raise HTTPException(
                status_code=400,
                detail="Multiple shops exist. Specify shop_id or shop_ids to get payout estimate.",
            )

    svc = FinancialService(db)
    result = svc.get_payout_estimate(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        shop_ids=parsed_shop_ids,
    )
    target = _get_target_currency(context, target_currency, db)
    if target:
        result = enrich_financial_response(result, target, db)
    return result


# ── 3. Fee breakdown ──

@router.get("/fee-breakdown", tags=["Financials"])
async def get_fee_breakdown(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get fee breakdown by category (transaction, processing, listing, ads, etc.).
    Requires Owner/Admin/Viewer role.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    result = svc.get_fee_breakdown(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        start_date=_parse_date(start_date, datetime.now(timezone.utc) - timedelta(days=30)),
        end_date=_parse_date(end_date, datetime.now(timezone.utc)),
        shop_ids=parsed_shop_ids,
    )
    target = _get_target_currency(context, target_currency, db)
    if target:
        result = enrich_financial_response(result, target, db)
    return result


# ── 4. Order profitability ──

@router.get("/order-profitability", tags=["Financials"])
async def get_order_profitability(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get per-order profitability (gross, fees, net) from payment details.
    Requires Owner/Admin/Viewer role.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    return svc.get_order_profitability(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        limit=limit,
        offset=offset,
        shop_ids=parsed_shop_ids,
    )


# ── 5. Revenue timeline ──

@router.get("/timeline", tags=["Financials"])
async def get_revenue_timeline(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    granularity: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get revenue/expenses timeline aggregated by day/week/month.
    Requires Owner/Admin/Viewer role.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    return svc.get_revenue_timeline(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        start_date=_parse_date(start_date, datetime.now(timezone.utc) - timedelta(days=30)),
        end_date=_parse_date(end_date, datetime.now(timezone.utc)),
        granularity=granularity,
        shop_ids=parsed_shop_ids,
    )


# ── 6. Raw ledger entries (paginated) ──

@router.get("/ledger", tags=["Financials"])
async def get_ledger_entries(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    entry_type: Optional[str] = Query(None, description="Filter by entry type"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Browse raw ledger entries with optional filters.
    Requires Owner/Admin/Viewer role.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    return svc.get_ledger_entries(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        entry_type=entry_type,
        limit=limit,
        offset=offset,
        start_date=_parse_date(start_date, None) if start_date else None,
        end_date=_parse_date(end_date, None) if end_date else None,
        shop_ids=parsed_shop_ids,
    )


# ── 7. Entry type registry (discovery + manual mapping) ──

@router.get("/entry-types", tags=["Financials"])
async def get_entry_types(
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    List all ledger entry types in the registry with mapped status.
    Unmapped types trigger the dashboard warning.
    """
    rows = (
        db.query(LedgerEntryTypeRegistry)
        .order_by(LedgerEntryTypeRegistry.entry_type)
        .all()
    )
    unmapped_count = sum(1 for r in rows if not r.mapped)
    return {
        "entry_types": [
            {
                "entry_type": r.entry_type,
                "category": r.category,
                "mapped": r.mapped,
                "first_seen_at": r.first_seen_at.isoformat() if r.first_seen_at else None,
                "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
            }
            for r in rows
        ],
        "unmapped_count": unmapped_count,
        "unmapped_types": [r.entry_type for r in rows if not r.mapped],
    }


@router.patch("/entry-types/map", tags=["Financials"])
async def update_entry_type_mapping(
    entry_type: str = Query(..., description="Entry type to map (URL-encoded if needed)"),
    category: str = Query(..., pattern="^(sales|fees|marketing|refunds|adjustments|other)$"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Set category and mark entry_type as mapped.
    Requires Owner/Admin role.
    """
    if context.role.lower() not in ("owner", "admin", "employee"):
        raise HTTPException(status_code=403, detail="Only owners and admins can update entry type mappings")

    reg = db.query(LedgerEntryTypeRegistry).filter(
        LedgerEntryTypeRegistry.entry_type == entry_type
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail=f"Entry type '{entry_type}' not found in registry")

    reg.category = category
    reg.mapped = True
    db.commit()
    return {
        "entry_type": entry_type,
        "category": category,
        "mapped": True,
    }


# ── 8. Sync status ──

@router.get("/sync-status", tags=["Financials"])
async def get_sync_status(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get last sync timestamps for ledger and payment data per shop.
    Returns ledger_last_sync_at, payment_last_sync_at, and any last errors.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)
    if parsed_shop_ids:
        target_shops = parsed_shop_ids
    elif shop_id:
        target_shops = [shop_id]
    else:
        target_shops = [
            s.id for s in db.query(Shop.id).filter(Shop.tenant_id == context.tenant_id).all()
        ]

    query = db.query(FinancialSyncStatus).filter(FinancialSyncStatus.tenant_id == context.tenant_id)
    if target_shops:
        query = query.filter(FinancialSyncStatus.shop_id.in_(target_shops))
    statuses = query.all()

    unmapped = (
        db.query(LedgerEntryTypeRegistry.entry_type)
        .filter(LedgerEntryTypeRegistry.mapped == False)
        .all()
    )
    unmapped_types = [r[0] for r in unmapped if r[0]]

    result = {}
    for st in statuses:
        result[str(st.shop_id)] = {
            "ledger_last_sync_at": st.ledger_last_sync_at.isoformat() if st.ledger_last_sync_at else None,
            "payment_last_sync_at": st.payment_last_sync_at.isoformat() if st.payment_last_sync_at else None,
            "ledger_last_error": st.ledger_last_error,
            "payment_last_error": st.payment_last_error,
            "has_auth_error": bool(st.has_auth_error) if st.has_auth_error is not None else False,
        }
    return {
        "shops": result,
        "unmapped_ledger_types": len(unmapped_types) > 0,
        "unmapped_count": len(unmapped_types),
        "unmapped_types": unmapped_types,
    }


# ── 8. Discounts (derived from Order.discount_amt) ──

@router.get("/discounts", tags=["Financials"])
async def get_discounts(
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = Query(None, description="Comma-separated shop IDs"),
    start_date: Optional[str] = Query(None, description="ISO start date"),
    end_date: Optional[str] = Query(None, description="ISO end date"),
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get aggregated discounts from orders (Order.discount_amt from Etsy receipts).
    Etsy does not expose coupon/promotion list via API; this is the available source.
    """
    parsed_shop_ids = _parse_shop_ids(shop_ids, shop_id, context, db)

    svc = FinancialService(db)
    result = svc.get_discount_summary(
        tenant_id=context.tenant_id,
        shop_id=shop_id if not parsed_shop_ids else None,
        start_date=_parse_date(start_date, datetime.now(timezone.utc) - timedelta(days=30)),
        end_date=_parse_date(end_date, datetime.now(timezone.utc)),
        shop_ids=parsed_shop_ids,
    )
    target = _get_target_currency(context, target_currency, db)
    if target:
        result = enrich_financial_response(result, target, db)
    return result


# ── 9. Manual sync trigger ──

@router.get("/comparison", tags=["Financials"])
async def get_financial_comparison(
    shop_ids: str = Query(..., description="Comma-separated shop IDs to compare"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    target_currency: Optional[str] = Query(None, description="Target currency for conversion"),
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Get per-shop financial summary breakdown for comparison.
    Returns individual financial summaries for each shop.
    """
    parsed = _parse_shop_ids(shop_ids, None, context, db)
    if not parsed or len(parsed) < 1:
        raise HTTPException(status_code=400, detail="At least one shop_id is required")

    svc = FinancialService(db)
    target = _get_target_currency(context, target_currency, db)
    start_dt = _parse_date(start_date, datetime.now(timezone.utc) - timedelta(days=30)) if start_date else datetime.now(timezone.utc) - timedelta(days=30)
    end_dt = _parse_date(end_date, datetime.now(timezone.utc)) if end_date else datetime.now(timezone.utc)
    per_shop = {}
    for sid in parsed:
        summary = svc.get_financial_summary(
            tenant_id=context.tenant_id,
            shop_ids=[sid],
            start_date=start_dt,
            end_date=end_dt,
        )
        if target:
            summary = enrich_financial_response(summary, target, db)
        per_shop[str(sid)] = summary

    return {
        "shops": per_shop,
        "shop_ids": parsed,
    }


@router.post("/sync", tags=["Financials"])
async def trigger_financial_sync(
    shop_id: Optional[int] = None,
    force_full_sync: bool = False,
    context: UserContext = Depends(require_revenue_access()),
    db: Session = Depends(get_db),
):
    """
    Trigger an immediate financial data sync.
    Dispatches Celery tasks for ledger and payment sync.
    Requires Owner/Admin role.
    force_full_sync: If true, re-fetches all ledger entries (fixes misclassified data).
    """
    if context.role.lower() not in ("owner", "admin", "employee"):
        raise HTTPException(status_code=403, detail="Only owners and admins can trigger syncs")

    if shop_id:
        ensure_shop_access(shop_id, context, db)

    logger.info("trigger_financial_sync: shop_id=%s tenant_id=%s force_full=%s", shop_id, context.tenant_id, force_full_sync)
    sync_ledger_entries.delay(
        shop_id=shop_id,
        tenant_id=context.tenant_id,
        force_full_sync=force_full_sync,
    )
    sync_payment_details.delay(shop_id=shop_id, tenant_id=context.tenant_id)

    return {"status": "sync_triggered", "shop_id": shop_id}
