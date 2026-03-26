"""
Financial Analytics Service
Provides P&L summary, payout estimates, fee breakdowns, order profitability,
and timeline data — all with 5-minute Redis caching.
"""

import json
import logging
from datetime import datetime, timedelta, timezone, date
from typing import Optional, Dict, Any, List

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case, extract

from app.models.products import Product
from app.models.orders import Order
from app.models.financials import (
    LedgerEntry,
    LedgerEntryTypeRegistry,
    PaymentDetail,
    ExpenseInvoice,
    ShopFinancialState,
)
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)


class FinancialService:
    """
    Financial analytics with Redis caching.

    All monetary values are stored / returned in **cents** and converted to
    dollars on the frontend.  The service reads from the locally-synced
    ``ledger_entries`` and ``payment_details`` tables — *never* from the
    Etsy API directly.
    """

    CACHE_TTL = 300  # 5 minutes

    # Maps raw Etsy entry_type values to normalized frontend category names
    FEE_CATEGORY_MAP: dict = {
        # Transaction fees
        "transaction":                   "transaction_fee",
        "transaction_quantity":          "transaction_fee",
        "transaction_fee":                "transaction_fee",
        # Processing fees
        "PAYMENT_PROCESSING_FEE":        "processing_fee",
        "payment_processing_fee":        "processing_fee",
        "processing_fee":                "processing_fee",
        # Listing renewal fees
        "listing":                       "listing_renewal",
        "listing_private":               "listing_renewal",
        "renew_sold":                    "listing_renewal",
        "renew_sold_auto":               "listing_renewal",
        "renew_expired":                 "listing_renewal",
        "auto_renew_expired":            "listing_renewal",
        # Deposit / other fees
        "DEPOSIT_FEE":                   "deposit_fee",
        "seller_onboarding_fee":         "subscription",
        "seller_onboarding_fee_payment": "subscription",
        "vat_tax_ep":                    "vat_fee",
        "vat_seller_services":           "vat_fee",
        "shipping_labels":               "shipping_label",
    }

    def __init__(self, db: Session):
        self.db = db
        self.redis = get_redis_client()

    # ------------------------------------------------------------------
    #  Caching helpers (same pattern as AnalyticsService)
    # ------------------------------------------------------------------

    def _cache_key(self, tenant_id: int, shop_id: Optional[int], metric: str, shop_ids: Optional[List[int]] = None) -> str:
        if shop_ids:
            ids_str = ",".join(str(s) for s in sorted(shop_ids))
            return f"financials:tenant_{tenant_id}:shops_{ids_str}:{metric}"
        shop_suffix = f":shop_{shop_id}" if shop_id else ""
        return f"financials:tenant_{tenant_id}{shop_suffix}:{metric}"

    def _get_cached(self, key: str) -> Optional[Dict[str, Any]]:
        if not self.redis:
            return None
        try:
            data = self.redis.get(key)
            if data:
                return json.loads(data)
        except Exception:
            pass
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        if not self.redis:
            return
        try:
            self.redis.setex(key, self.CACHE_TTL, json.dumps(data, default=str))
        except Exception:
            pass

    # ------------------------------------------------------------------
    #  1. Profit & Loss summary
    # ------------------------------------------------------------------

    @staticmethod
    def _apply_shop_filter(filters: list, model_col, shop_id: Optional[int], shop_ids: Optional[List[int]] = None):
        """Append a shop filter — single id, multi ids, or none (tenant-wide)."""
        if shop_ids:
            filters.append(model_col.in_(shop_ids))
        elif shop_id:
            filters.append(model_col == shop_id)

    def _get_unmapped_ledger_types(self) -> tuple[int, List[str]]:
        """Return (count, list of unmapped entry_type values)."""
        rows = (
            self.db.query(LedgerEntryTypeRegistry.entry_type)
            .filter(LedgerEntryTypeRegistry.mapped == False)
            .all()
        )
        types = [r[0] for r in rows if r[0]]
        return len(types), types

    def get_profit_and_loss(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Aggregate P&L from ledger entries by category (registry join).
        Net Profit = sales + fees + marketing + refunds (fees/marketing already negative).
        """
        start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
        end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
        ck = self._cache_key(tenant_id, shop_id, f"pnl:{start_key}:{end_key}", shop_ids)
        cached = self._get_cached(ck)
        if cached:
            return cached

        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        filters = [
            LedgerEntry.tenant_id == tenant_id,
            LedgerEntry.entry_created_at >= start_date,
            LedgerEntry.entry_created_at <= end_date,
        ]
        self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)

        # Category-based aggregation via registry join
        cat_col = LedgerEntryTypeRegistry.category
        row = (
            self.db.query(
                func.sum(case((cat_col == "sales", LedgerEntry.amount), else_=0)).label("sales"),
                func.sum(case((cat_col == "fees", LedgerEntry.amount), else_=0)).label("fees"),
                func.sum(case((cat_col == "marketing", LedgerEntry.amount), else_=0)).label("marketing"),
                func.sum(case((cat_col == "refunds", LedgerEntry.amount), else_=0)).label("refunds"),
                func.sum(case((cat_col == "adjustments", LedgerEntry.amount), else_=0)).label("adjustments"),
                func.sum(case((cat_col == "other", LedgerEntry.amount), else_=0)).label("other"),
                func.sum(case((cat_col.is_(None), LedgerEntry.amount), else_=0)).label("unmapped"),
            )
            .outerjoin(LedgerEntryTypeRegistry, LedgerEntry.entry_type == LedgerEntryTypeRegistry.entry_type)
            .filter(and_(*filters))
            .first()
        )

        sales = row[0] or 0
        fees = row[1] or 0
        marketing = row[2] or 0
        refunds = row[3] or 0
        adjustments = row[4] or 0
        other = row[5] or 0
        unmapped_sum = row[6] or 0

        # Net = sales + fees + marketing + refunds (fees/marketing already negative)
        net_profit = sales + fees + marketing + refunds

        # Currency from latest ledger entry in period
        currency_row = (
            self.db.query(LedgerEntry.currency)
            .filter(and_(*filters))
            .order_by(LedgerEntry.entry_created_at.desc())
            .first()
        )
        currency = (currency_row[0] if currency_row and currency_row[0] else "USD") or "USD"

        unmapped_count, unmapped_types = self._get_unmapped_ledger_types()
        result = {
            "total_revenue": sales,
            "total_fees": abs(fees),
            "total_refunds": abs(refunds),
            "total_shipping_labels": 0,  # Included in marketing category
            "total_advertising": abs(marketing),
            "total_tax": abs(adjustments),
            "net_profit": net_profit,
            "currency": currency,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }
        if unmapped_count > 0:
            result["warning"] = "Unmapped ledger types detected. Profit may not match Etsy."
            result["unmapped_count"] = unmapped_count
            result["unmapped_types"] = unmapped_types
        self._set_cached(ck, result)
        return result

    # ------------------------------------------------------------------
    #  2. Payout estimate
    # ------------------------------------------------------------------

    def get_payout_estimate(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Return balance and available_for_payout.
        Prefers shop_financial_state when present; falls back to ledger.
        """
        ck = self._cache_key(tenant_id, shop_id, "payout_estimate", shop_ids)
        cached = self._get_cached(ck)
        if cached:
            return cached

        # Prefer shop_financial_state when available (from payment-account endpoint)
        target_shops = shop_ids or ([shop_id] if shop_id else None)
        if target_shops and len(target_shops) == 1:
            state = (
                self.db.query(ShopFinancialState)
                .filter(ShopFinancialState.shop_id == target_shops[0])
                .first()
            )
            if state:
                recent_payouts = (
                    self.db.query(LedgerEntry.amount, LedgerEntry.entry_created_at)
                    .filter(
                        LedgerEntry.tenant_id == tenant_id,
                        LedgerEntry.shop_id == target_shops[0],
                        LedgerEntry.entry_type.in_(["payout", "Payment", "Deposit"]),
                        LedgerEntry.entry_created_at >= datetime.now(timezone.utc) - timedelta(days=30),
                    )
                    .order_by(LedgerEntry.entry_created_at.desc())
                    .limit(10)
                    .all()
                )
                result = {
                    "current_balance": state.balance,
                    "reserve_held": abs(state.reserve_amount or 0),
                    "available_for_payout": max(0, state.available_for_payout),
                    "currency": state.currency_code,
                    "recent_payouts": [
                        {"amount": abs(p[0]), "date": p[1].isoformat() if p[1] else None}
                        for p in recent_payouts
                    ],
                    "as_of": datetime.now(timezone.utc).isoformat(),
                }
                self._set_cached(ck, result)
                return result

        # Fallback: derive balance from most recent ledger entry's running balance.
        # This is the primary code path since Etsy's payment-account API endpoint
        # is not available for all shops. The ledger's running `balance` field
        # is updated with every transaction and accurately reflects the current
        # account balance.
        filters = [LedgerEntry.tenant_id == tenant_id]
        self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)

        latest = (
            self.db.query(LedgerEntry.balance, LedgerEntry.currency, LedgerEntry.entry_created_at)
            .filter(and_(*filters))
            .order_by(LedgerEntry.entry_created_at.desc(), LedgerEntry.id.desc())
            .first()
        )
        current_balance = latest[0] if latest else 0
        currency = latest[1] if latest else "USD"

        payout_filters = filters + [
            LedgerEntry.entry_type.in_(["payout", "Payment", "Deposit"]),
            LedgerEntry.entry_created_at >= datetime.now(timezone.utc) - timedelta(days=30),
        ]
        recent_payouts = (
            self.db.query(LedgerEntry.amount, LedgerEntry.entry_created_at)
            .filter(and_(*payout_filters))
            .order_by(LedgerEntry.entry_created_at.desc())
            .limit(10)
            .all()
        )

        reserve_filters = filters + [
            LedgerEntry.entry_type.in_(["reserve", "Reserve"]),
        ]
        reserve_total = (
            self.db.query(func.sum(LedgerEntry.amount))
            .filter(and_(*reserve_filters))
            .scalar()
        ) or 0

        result = {
            "current_balance": current_balance,
            "reserve_held": abs(reserve_total),
            "available_for_payout": max(0, current_balance - abs(reserve_total)),
            "currency": currency,
            "recent_payouts": [
                {"amount": abs(p[0]), "date": p[1].isoformat() if p[1] else None}
                for p in recent_payouts
            ],
            "as_of": datetime.now(timezone.utc).isoformat(),
        }
        self._set_cached(ck, result)
        return result

    # ------------------------------------------------------------------
    #  3. Fee breakdown
    # ------------------------------------------------------------------

    def get_fee_breakdown(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Break down fees by category for the given period.

        Categories: transaction_fee, processing_fee, listing_renewal,
        advertising, shipping_label, subscription, other.
        """
        start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
        end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
        ck = self._cache_key(tenant_id, shop_id, f"fees:{start_key}:{end_key}", shop_ids)
        cached = self._get_cached(ck)
        if cached:
            return cached

        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        filters = [
            LedgerEntry.tenant_id == tenant_id,
            LedgerEntry.entry_created_at >= start_date,
            LedgerEntry.entry_created_at <= end_date,
            LedgerEntry.amount < 0,
            LedgerEntryTypeRegistry.category == "fees",  # Only real fee entries
        ]
        self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)

        rows = (
            self.db.query(
                LedgerEntry.entry_type,
                func.sum(LedgerEntry.amount).label("total"),
                func.count(LedgerEntry.id).label("count"),
            )
            .join(
                LedgerEntryTypeRegistry,
                LedgerEntry.entry_type == LedgerEntryTypeRegistry.entry_type,
            )
            .filter(and_(*filters))
            .group_by(LedgerEntry.entry_type)
            .all()
        )

        # Aggregate by normalized category name
        category_totals: dict = {}
        total_fees = 0
        for entry_type, total, count in rows:
            abs_total = abs(total or 0)
            total_fees += abs_total
            normalized = self.FEE_CATEGORY_MAP.get(entry_type, "other")
            if normalized in category_totals:
                category_totals[normalized]["amount"] += abs_total
                category_totals[normalized]["count"] += count
            else:
                category_totals[normalized] = {
                    "category": normalized,
                    "amount": abs_total,
                    "count": count,
                }
        categories = sorted(
            category_totals.values(),
            key=lambda c: c["amount"],
            reverse=True,
        )

        # Get currency from ledger entries for this period
        fee_currency_row = (
            self.db.query(LedgerEntry.currency)
            .join(
                LedgerEntryTypeRegistry,
                LedgerEntry.entry_type == LedgerEntryTypeRegistry.entry_type,
            )
            .filter(and_(*filters))
            .order_by(LedgerEntry.entry_created_at.desc())
            .first()
        )
        fee_currency = (fee_currency_row[0] if fee_currency_row and fee_currency_row[0] else "ILS") or "ILS"

        # Optional augmentation: sum PaymentDetail.amount_fees for cross-check
        pd_filters = [
            PaymentDetail.tenant_id == tenant_id,
            PaymentDetail.posted_at >= start_date,
            PaymentDetail.posted_at <= end_date,
        ]
        self._apply_shop_filter(pd_filters, PaymentDetail.shop_id, shop_id, shop_ids)
        payment_detail_fees = (
            self.db.query(func.sum(PaymentDetail.amount_fees))
            .filter(and_(*pd_filters))
            .scalar()
        ) or 0

        result = {
            "total_fees": total_fees,
            "categories": sorted(categories, key=lambda c: c["amount"], reverse=True),
            "currency": fee_currency,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }
        if payment_detail_fees > 0:
            result["payment_detail_total_fees"] = payment_detail_fees
        self._set_cached(ck, result)
        return result

    # ------------------------------------------------------------------
    #  4. Order profitability
    # ------------------------------------------------------------------

    def get_order_profitability(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        limit: int = 20,
        offset: int = 0,
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Return per-order profitability using PaymentDetail records.

        Each record contains gross, fees, net, and adjusted values.
        """
        ck = self._cache_key(tenant_id, shop_id, f"order_profit:{limit}:{offset}", shop_ids)
        cached = self._get_cached(ck)
        if cached:
            return cached

        filters = [PaymentDetail.tenant_id == tenant_id]
        self._apply_shop_filter(filters, PaymentDetail.shop_id, shop_id, shop_ids)

        total_count = (
            self.db.query(func.count(PaymentDetail.id))
            .filter(and_(*filters))
            .scalar()
        ) or 0

        rows = (
            self.db.query(PaymentDetail, Order)
            .outerjoin(Order, PaymentDetail.order_id == Order.id)
            .filter(and_(*filters))
            .order_by(PaymentDetail.posted_at.desc().nullslast())
            .offset(offset)
            .limit(limit)
            .all()
        )

        orders = []
        for pd, order in rows:
            final_net = pd.adjusted_net if pd.adjusted_net is not None else pd.amount_net
            orders.append({
                "payment_id": pd.id,
                "etsy_receipt_id": pd.etsy_receipt_id,
                "buyer_name": order.buyer_name if order else None,
                "order_total": order.total_price if order else None,
                "amount_gross": pd.amount_gross,
                "amount_fees": pd.amount_fees,
                "amount_net": pd.amount_net,
                "adjusted_net": pd.adjusted_net,
                "final_net": final_net,
                "currency": pd.currency,
                "posted_at": pd.posted_at.isoformat() if pd.posted_at else None,
            })

        result = {
            "orders": orders,
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
        }
        self._set_cached(ck, result)
        return result

    # ------------------------------------------------------------------
    #  5. Revenue timeline (daily / weekly / monthly)
    # ------------------------------------------------------------------

    def get_revenue_timeline(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        granularity: str = "daily",
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Aggregate revenue and fees over time buckets.

        ``granularity`` is one of ``daily``, ``weekly``, ``monthly``.
        """
        start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
        end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
        ck = self._cache_key(
            tenant_id, shop_id,
            f"timeline:{granularity}:{start_key}:{end_key}",
            shop_ids,
        )
        cached = self._get_cached(ck)
        if cached:
            return cached

        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        filters = [
            LedgerEntry.tenant_id == tenant_id,
            LedgerEntry.entry_created_at >= start_date,
            LedgerEntry.entry_created_at <= end_date,
        ]
        self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)

        # Choose grouping expression
        if granularity == "monthly":
            date_trunc = func.date_trunc("month", LedgerEntry.entry_created_at)
        elif granularity == "weekly":
            date_trunc = func.date_trunc("week", LedgerEntry.entry_created_at)
        else:
            date_trunc = func.date_trunc("day", LedgerEntry.entry_created_at)

        cat_col = LedgerEntryTypeRegistry.category
        rows = (
            self.db.query(
                date_trunc.label("bucket"),
                func.sum(
                    case(
                        (cat_col == "sales", LedgerEntry.amount),
                        else_=0,
                    )
                ).label("revenue"),
                func.sum(
                    case(
                        (LedgerEntry.amount < 0, LedgerEntry.amount),
                        else_=0,
                    )
                ).label("expenses"),
            )
            .outerjoin(LedgerEntryTypeRegistry, LedgerEntry.entry_type == LedgerEntryTypeRegistry.entry_type)
            .filter(and_(*filters))
            .group_by("bucket")
            .order_by("bucket")
            .all()
        )

        timeline = []
        for bucket, revenue, expenses in rows:
            timeline.append({
                "date": bucket.isoformat() if bucket else None,
                "revenue": revenue or 0,
                "expenses": abs(expenses or 0),
                "net": (revenue or 0) - abs(expenses or 0),
            })

        result = {
            "timeline": timeline,
            "granularity": granularity,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }
        self._set_cached(ck, result)
        return result

    # ------------------------------------------------------------------
    #  6. Ledger entries (paginated raw list)
    # ------------------------------------------------------------------

    def get_ledger_entries(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        entry_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Paginated ledger entries with optional type filter."""
        filters = [LedgerEntry.tenant_id == tenant_id]
        self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)
        if entry_type:
            filters.append(LedgerEntry.entry_type == entry_type)
        if start_date:
            filters.append(LedgerEntry.entry_created_at >= start_date)
        if end_date:
            filters.append(LedgerEntry.entry_created_at <= end_date)

        total = (
            self.db.query(func.count(LedgerEntry.id))
            .filter(and_(*filters))
            .scalar()
        ) or 0

        entries = (
            self.db.query(LedgerEntry)
            .filter(and_(*filters))
            .order_by(LedgerEntry.entry_created_at.desc())
            .offset(offset)
            .limit(min(limit, 100))
            .all()
        )

        result = {
            "entries": [
                {
                    "id": e.id,
                    "entry_type": e.entry_type,
                    "description": e.description,
                    "amount": e.amount,
                    "balance": e.balance,
                    "currency": e.currency,
                    "etsy_receipt_id": e.etsy_receipt_id,
                    "entry_created_at": e.entry_created_at.isoformat() if e.entry_created_at else None,
                }
                for e in entries
            ],
            "total_count": total,
            "limit": limit,
            "offset": offset,
        }
        return result

    # ------------------------------------------------------------------
    #  Helper: product cost calculation
    # ------------------------------------------------------------------

    def _calc_product_costs(
        self,
        tenant_id: int,
        shop_id: Optional[int],
        shop_ids: Optional[List[int]],
        start_date: datetime,
        end_date: datetime,
    ) -> int:
        """
        Calculate total product costs for orders in the period.

        Orders store line_items as JSONB with listing_id and quantity.
        We join that with products.cost_usd_cents to get total cost.
        Falls back to counting each order's product once if JSONB parsing
        is not possible at the SQL level.
        """
        try:
            order_date_col = func.coalesce(Order.etsy_created_at, Order.created_at)
            order_filters = [
                Order.tenant_id == tenant_id,
                order_date_col >= start_date,
                order_date_col <= end_date,
            ]
            self._apply_shop_filter(order_filters, Order.shop_id, shop_id, shop_ids)

            orders_with_items = (
                self.db.query(Order.line_items)
                .filter(and_(*order_filters))
                .filter(Order.line_items.isnot(None))
                .all()
            )

            # Build listing_id -> quantity map from all orders
            listing_qty: Dict[str, int] = {}
            for (items_json,) in orders_with_items:
                if not isinstance(items_json, list):
                    continue
                for item in items_json:
                    lid = str(item.get("listing_id", item.get("etsy_listing_id", "")))
                    qty = int(item.get("quantity", 1))
                    if lid:
                        listing_qty[lid] = listing_qty.get(lid, 0) + qty

            if not listing_qty:
                return 0

            products = (
                self.db.query(Product.etsy_listing_id, Product.cost_usd_cents)
                .filter(
                    Product.tenant_id == tenant_id,
                    Product.etsy_listing_id.in_(list(listing_qty.keys())),
                    Product.cost_usd_cents > 0,
                )
                .all()
            )

            total = 0
            for lid, cost in products:
                total += cost * listing_qty.get(str(lid), 0)
            return total

        except Exception:
            logger.exception("Failed to calculate product costs")
            return 0

    # ------------------------------------------------------------------
    #  Helper: discount aggregation from Order.discount_amt
    # ------------------------------------------------------------------

    def _calc_total_discounts(
        self,
        tenant_id: int,
        shop_id: Optional[int],
        shop_ids: Optional[List[int]],
        start_date: datetime,
        end_date: datetime,
    ) -> int:
        """Sum Order.discount_amt for orders in the period (derived from Etsy receipts)."""
        order_date_col = func.coalesce(Order.etsy_created_at, Order.created_at)
        filters = [
            Order.tenant_id == tenant_id,
            order_date_col >= start_date,
            order_date_col <= end_date,
            Order.discount_amt > 0,
        ]
        self._apply_shop_filter(filters, Order.shop_id, shop_id, shop_ids)
        total = (
            self.db.query(func.sum(Order.discount_amt))
            .filter(and_(*filters))
            .scalar()
        ) or 0
        return total

    def get_discount_summary(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        shop_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Aggregate discounts from Order.discount_amt (derived from Etsy receipts).
        Etsy does not expose coupon/promotion list via API; this is the available source.
        """
        ck = self._cache_key(
            tenant_id, shop_id,
            f"discounts:{start_date}:{end_date}",
            shop_ids,
        )
        cached = self._get_cached(ck)
        if cached:
            return cached

        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        total_discounts = self._calc_total_discounts(
            tenant_id, shop_id, shop_ids, start_date, end_date
        )

        # Count orders with discounts
        order_date_col = func.coalesce(Order.etsy_created_at, Order.created_at)
        filters = [
            Order.tenant_id == tenant_id,
            order_date_col >= start_date,
            order_date_col <= end_date,
            Order.discount_amt > 0,
        ]
        self._apply_shop_filter(filters, Order.shop_id, shop_id, shop_ids)
        order_count = (
            self.db.query(func.count(Order.id))
            .filter(and_(*filters))
            .scalar()
        ) or 0

        result = {
            "total_discounts": total_discounts,
            "order_count_with_discounts": order_count,
            "currency": "USD",
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }
        self._set_cached(ck, result)
        return result

    # ------------------------------------------------------------------
    #  7. Full financial summary (ordered blocks)
    # ------------------------------------------------------------------

    def get_financial_summary(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        shop_ids: Optional[List[int]] = None,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """
        Return the complete financial summary in the user-requested order:
        1. Revenue
        2. Etsy Fees (transaction + processing + listing renewal + subscription)
        3. Paid Advertising Expenses (Etsy Ads)
        4. Product Costs (from product cost_usd_cents × sold quantity)
        5. Invoice Expenses (uploaded, approved invoices)
        6. Total Expenses
        7. Net Profit after all expenses
        All monetary values in cents.
        """
        start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
        end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
        ck = self._cache_key(
            tenant_id, shop_id,
            f"full_summary:{start_key}:{end_key}",
            shop_ids,
        )
        if not force_refresh:
            cached = self._get_cached(ck)
            if cached:
                return cached

        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)

        # ── Ledger aggregation by category (registry join) ──
        ledger_filters = [
            LedgerEntry.tenant_id == tenant_id,
            LedgerEntry.entry_created_at >= start_date,
            LedgerEntry.entry_created_at <= end_date,
        ]
        self._apply_shop_filter(ledger_filters, LedgerEntry.shop_id, shop_id, shop_ids)

        cat_col = LedgerEntryTypeRegistry.category
        row = (
            self.db.query(
                func.sum(case((cat_col == "sales", LedgerEntry.amount), else_=0)).label("sales"),
                func.sum(case((cat_col == "fees", LedgerEntry.amount), else_=0)).label("fees"),
                func.sum(case((cat_col == "marketing", LedgerEntry.amount), else_=0)).label("marketing"),
                func.sum(case((cat_col == "refunds", LedgerEntry.amount), else_=0)).label("refunds"),
                func.sum(case((cat_col == "adjustments", LedgerEntry.amount), else_=0)).label("adjustments"),
                func.sum(case((cat_col == "other", LedgerEntry.amount), else_=0)).label("other"),
                func.sum(case((cat_col.is_(None), LedgerEntry.amount), else_=0)).label("unmapped"),
            )
            .outerjoin(LedgerEntryTypeRegistry, LedgerEntry.entry_type == LedgerEntryTypeRegistry.entry_type)
            .filter(and_(*ledger_filters))
            .first()
        )

        revenue = row[0] or 0
        etsy_fees = abs(row[1] or 0)
        advertising = abs(row[2] or 0)
        refunds = abs(row[3] or 0)
        shipping_labels = 0  # Included in marketing category

        # Currency from latest ledger entry in period
        currency_row = (
            self.db.query(LedgerEntry.currency)
            .filter(and_(*ledger_filters))
            .order_by(LedgerEntry.entry_created_at.desc())
            .first()
        )
        currency = (currency_row[0] if currency_row and currency_row[0] else "USD") or "USD"

        # ── Product costs ──
        # Products have cost_usd_cents; orders store line_items as JSONB.
        # Sum all product costs for orders in the period. For orders without
        # line-item granularity we fall back to one unit per order.
        product_cost_total = self._calc_product_costs(
            tenant_id, shop_id, shop_ids, start_date, end_date
        )

        # ── Invoice expenses (approved) ──
        inv_filters = [
            ExpenseInvoice.tenant_id == tenant_id,
            ExpenseInvoice.status == "approved",
        ]
        if start_date:
            inv_filters.append(ExpenseInvoice.invoice_date >= start_date)
        if end_date:
            inv_filters.append(ExpenseInvoice.invoice_date <= end_date)
        self._apply_shop_filter(inv_filters, ExpenseInvoice.shop_id, shop_id, shop_ids)

        invoice_expense_total = (
            self.db.query(func.sum(ExpenseInvoice.total_amount))
            .filter(and_(*inv_filters))
            .scalar()
        ) or 0

        # ── Discounts (from Order.discount_amt) ──
        total_discounts = self._calc_total_discounts(
            tenant_id, shop_id, shop_ids, start_date, end_date
        )

        # Net from ledger: sales + fees + marketing + refunds (fees/marketing already negative)
        ledger_net = revenue + (row[1] or 0) + (row[2] or 0) + (row[3] or 0)
        total_expenses = etsy_fees + advertising + product_cost_total + invoice_expense_total + shipping_labels
        net_profit = ledger_net - product_cost_total - invoice_expense_total

        unmapped_count, unmapped_types = self._get_unmapped_ledger_types()
        result = {
            "revenue": revenue,
            "etsy_fees": etsy_fees,
            "advertising_expenses": advertising,
            "product_costs": product_cost_total,
            "invoice_expenses": invoice_expense_total,
            "shipping_labels": shipping_labels,
            "refunds": refunds,
            "total_discounts": total_discounts,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "currency": currency,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
        }
        if unmapped_count > 0:
            result["warning"] = "Unmapped ledger types detected. Profit may not match Etsy."
            result["unmapped_count"] = unmapped_count
            result["unmapped_types"] = unmapped_types
        self._set_cached(ck, result)
        return result
