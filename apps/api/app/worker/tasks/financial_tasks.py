"""
Celery Tasks for Financial Data Synchronization
Handles syncing ledger entries and payment details from Etsy
"""
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.orders import Order
from app.models.financials import (
    LedgerEntry,
    LedgerEntryTypeRegistry,
    PaymentDetail,
    FinancialSyncStatus,
    ShopFinancialState,
)
from app.models.tenancy import Shop, OAuthToken
from app.services.etsy_client import EtsyClient, EtsyAPIError
from app.services.notification_service import notify_tenant_admins
from app.models.notifications import NotificationType
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

# --- Ledger sync helpers (no classification during sync; registry handles mapping) ---


def _normalize_etsy_money(obj: Any) -> int:
    """
    Normalize Etsy money value to cents for storage.
    - Dict with amount and divisor -> int(round(amount * 100 / divisor))
    - Dict with amount only -> default divisor 100
    - Raw int -> unchanged (assumed cents)
    - None -> 0
    """
    if obj is None:
        return 0
    if isinstance(obj, (int, float)):
        return int(obj)
    if isinstance(obj, dict):
        amount = obj.get("amount", 0) or 0
        divisor = obj.get("divisor") or 100
        if divisor <= 0:
            divisor = 100
        return int(round(float(amount) * 100 / float(divisor)))
    return 0


def _serialize_raw_payload(raw: dict) -> dict:
    """Ensure raw payload is JSON-serializable for JSONB storage."""
    try:
        return json.loads(json.dumps(raw, default=str))
    except (TypeError, ValueError):
        return {k: str(v) for k, v in raw.items()}


def _extract_entry_type(raw: dict) -> str:
    """Extract raw entry_type from Etsy: ledger_type if present, else description (truncated)."""
    ledger_type = raw.get("ledger_type")
    if ledger_type:
        return str(ledger_type)[:255]
    desc = raw.get("description", "") or ""
    return (str(desc)[:255]) or "unknown"


# Pre-populated Etsy ledger_type -> category mappings (from Etsy API docs / community findings)
LEDGER_TYPE_SEED: Dict[str, str] = {
    # Sales (revenue credits)
    "transaction":                   "sales",
    "shipping_transaction":          "sales",
    "sale":                          "sales",
    "Sale":                          "sales",
    "SALE":                          "sales",
    "gift_wrap_fees":                "sales",
    "Transaction":                   "sales",
    "PAYMENT_GROSS":                 "sales",

    # Fees (debits — subtracted from profit)
    "transaction_quantity":          "fees",
    "transaction_fee":               "fees",
    "processing_fee":                "fees",
    "listing":                       "fees",
    "listing_private":               "fees",
    "renew_sold":                    "fees",
    "renew_sold_auto":               "fees",
    "renew_expired":                 "fees",
    "auto_renew_expired":            "fees",
    "PAYMENT_PROCESSING_FEE":        "fees",
    "payment_processing_fee":        "fees",
    "shipping_labels":               "fees",
    "seller_onboarding_fee":         "fees",
    "seller_onboarding_fee_payment": "fees",
    "vat_tax_ep":                    "fees",
    "vat_seller_services":           "fees",
    "DEPOSIT_FEE":                   "fees",
    "Fee":                           "fees",
    "FEE":                           "fees",

    # Marketing / advertising (debited from profit)
    "offsite_ads_fee":               "marketing",
    "prolist":                       "marketing",
    "Etsy Ads":                      "marketing",
    "etsy_ads":                      "marketing",
    "EtsyAds":                       "marketing",
    "OffsiteAds":                    "marketing",
    "ShippingLabel":                 "marketing",
    "Marketing":                     "marketing",

    # Refunds
    "REFUND":                        "refunds",
    "REFUND_GROSS":                  "refunds",
    "REFUND_PROCESSING_FEE":         "refunds",
    "transaction_refund":            "refunds",
    "shipping_transaction_refund":   "refunds",
    "transaction_quantity_refund":   "refunds",
    "offsite_ads_fee_refund":        "refunds",
    "listing_refund":                "refunds",
    "listing_private_refund":        "refunds",
    "renew_sold_auto_refund":        "refunds",
    "shipping_label_refund":         "refunds",
    "refund":                        "refunds",
    "Refund":                        "refunds",
    "VAT_REFUND_EP":                 "refunds",

    # Adjustments — excluded from profit calculation entirely
    "DISBURSE":                      "adjustments",
    "DISBURSE2":                     "adjustments",
    "sales_tax":                     "adjustments",
    "Tax":                           "adjustments",
    "Adjustment":                    "adjustments",
    "RECOUP":                        "adjustments",
    "payout":                        "adjustments",
    "Payment":                       "adjustments",
    "Deposit":                       "adjustments",
    "reserve":                       "adjustments",
    "Reserve":                       "adjustments",
    "Reserve_release":               "adjustments",
    "billing_payment":               "adjustments",
    "seller_credit":                 "adjustments",
}


def _seed_ledger_type_registry(db) -> int:
    """Pre-populate ledger_entry_type_registry with common Etsy types. Returns count updated."""
    now = datetime.now(timezone.utc)
    updated = 0
    for entry_type, category in LEDGER_TYPE_SEED.items():
        reg = db.query(LedgerEntryTypeRegistry).filter(
            LedgerEntryTypeRegistry.entry_type == entry_type
        ).first()
        if reg:
            if reg.category is None or not reg.mapped:
                reg.category = category
                reg.mapped = True
                reg.last_seen_at = now
                updated += 1
        else:
            reg = LedgerEntryTypeRegistry(
                entry_type=entry_type,
                category=category,
                first_seen_at=now,
                last_seen_at=now,
                mapped=True,
            )
            db.add(reg)
            updated += 1
    # Update existing unmapped rows that match our mapping (e.g. types discovered during sync)
    unmapped = db.query(LedgerEntryTypeRegistry).filter(
        LedgerEntryTypeRegistry.mapped.is_(False)
    ).all()
    for reg in unmapped:
        if reg.entry_type in LEDGER_TYPE_SEED:
            reg.category = LEDGER_TYPE_SEED[reg.entry_type]
        else:
            # Map truly unknown types as "other" so they don't trigger warnings
            reg.category = reg.category or "other"
        reg.mapped = True
        reg.last_seen_at = now
        updated += 1
    if updated:
        db.commit()
    return updated


def _upsert_registry(db, entry_type: str, now: datetime) -> None:
    """Register or update entry_type in ledger_entry_type_registry.
    If the type is known in LEDGER_TYPE_SEED, map it immediately."""
    known_category = LEDGER_TYPE_SEED.get(entry_type)
    reg = (
        db.query(LedgerEntryTypeRegistry)
        .filter(LedgerEntryTypeRegistry.entry_type == entry_type)
        .first()
    )
    if reg:
        reg.last_seen_at = now
        # If it was unmapped but we now know the category, fix it
        if not reg.mapped and known_category:
            reg.category = known_category
            reg.mapped = True
    else:
        # Unknown types are mapped as "other" so they don't trigger unmapped warnings
        resolved_category = known_category or "other"
        reg = LedgerEntryTypeRegistry(
            entry_type=entry_type,
            category=resolved_category,
            first_seen_at=now,
            last_seen_at=now,
            mapped=True,
        )
        db.add(reg)


def _has_financial_scope(db, shop: Shop) -> bool:
    """Check whether the shop's OAuth token includes billing_r or transactions_r.
    Ledger endpoint may use either; payments require transactions_r."""
    token = (
        db.query(OAuthToken)
        .filter(OAuthToken.shop_id == shop.id, OAuthToken.provider == "etsy")
        .first()
    )
    if not token or not token.scopes:
        return False
    return "billing_r" in token.scopes or "transactions_r" in token.scopes


def _is_auth_error(error_msg: Optional[str]) -> bool:
    """Detect if error indicates auth failure (401, token refresh, reconnect)."""
    if not error_msg:
        return False
    msg_lower = error_msg.lower()
    return (
        "401" in error_msg
        or "token" in msg_lower
        or "refresh" in msg_lower
        or "reconnect" in msg_lower
        or "oauth" in msg_lower
        or "unauthorized" in msg_lower
    )


def _upsert_ledger_sync_status(db, shop: Shop, success: bool, error_msg: Optional[str] = None) -> None:
    """Update FinancialSyncStatus with ledger sync result."""
    now = datetime.now(timezone.utc)
    st = db.query(FinancialSyncStatus).filter(FinancialSyncStatus.shop_id == shop.id).first()
    if st:
        st.ledger_last_sync_at = now if success else st.ledger_last_sync_at
        st.ledger_last_error = None if success else (error_msg or st.ledger_last_error)
        if success:
            st.has_auth_error = _is_auth_error(st.payment_last_error)
        else:
            st.has_auth_error = _is_auth_error(error_msg or st.ledger_last_error)
        st.updated_at = now
    else:
        st = FinancialSyncStatus(
            tenant_id=shop.tenant_id,
            shop_id=shop.id,
            ledger_last_sync_at=now if success else None,
            ledger_last_error=None if success else error_msg,
            has_auth_error=False if success else _is_auth_error(error_msg),
        )
        db.add(st)
    db.commit()


def _upsert_payment_sync_status(db, shop: Shop, success: bool, error_msg: Optional[str] = None) -> None:
    """Update FinancialSyncStatus with payment sync result."""
    now = datetime.now(timezone.utc)
    st = db.query(FinancialSyncStatus).filter(FinancialSyncStatus.shop_id == shop.id).first()
    if st:
        st.payment_last_sync_at = now if success else st.payment_last_sync_at
        st.payment_last_error = None if success else (error_msg or st.payment_last_error)
        if success:
            st.has_auth_error = _is_auth_error(st.ledger_last_error)
        else:
            st.has_auth_error = _is_auth_error(error_msg or st.payment_last_error)
        st.updated_at = now
    else:
        st = FinancialSyncStatus(
            tenant_id=shop.tenant_id,
            shop_id=shop.id,
            payment_last_sync_at=now if success else None,
            payment_last_error=None if success else error_msg,
            has_auth_error=False if success else _is_auth_error(error_msg),
        )
        db.add(st)
    db.commit()


async def _sync_shop_payment_account(
    db, etsy_client: EtsyClient, shop: Shop
) -> bool:
    """
    Try to fetch payment-account from Etsy and upsert shop_financial_state.
    Returns True if updated, False if endpoint unavailable or error.

    NOTE: As of 2026, Etsy's payment-account endpoint is not available for
    all shops. When unavailable, get_payout_estimate() falls back to the
    most recent ledger entry's running balance field, which is accurate.
    """
    try:
        data = await etsy_client.get_payment_account(
            shop_id=shop.id,
            etsy_shop_id=shop.etsy_shop_id,
        )
        if not data:
            logger.warning(
                f"Payment account returned no data for shop {shop.id} "
                f"(etsy_shop_id={shop.etsy_shop_id})"
            )
            return False

        balance = _normalize_etsy_money(data.get("balance"))
        available = _normalize_etsy_money(data.get("available_for_payout"))
        reserve = _normalize_etsy_money(data.get("reserve_amount"))

        # Extract currency from the balance object (Etsy money dict)
        currency = (
            (data.get("balance") or {}).get("currency_code")
            or data.get("currency_code")
            or "USD"
        )
        if isinstance(currency, dict):
            currency = currency.get("currency_code", "USD")
        currency = str(currency)[:3] if currency else "USD"

        logger.info(
            f"Payment account for shop {shop.id}: "
            f"balance={balance} available={available} "
            f"reserve={reserve} currency={currency}"
        )

        now = datetime.now(timezone.utc)
        state = (
            db.query(ShopFinancialState)
            .filter(ShopFinancialState.shop_id == shop.id)
            .first()
        )
        if state:
            state.balance = balance
            state.available_for_payout = available
            state.reserve_amount = reserve if reserve else None
            state.currency_code = currency
            state.updated_at = now
        else:
            state = ShopFinancialState(
                shop_id=shop.id,
                tenant_id=shop.tenant_id,
                balance=balance,
                available_for_payout=available,
                reserve_amount=reserve if reserve else None,
                currency_code=currency,
                updated_at=now,
            )
            db.add(state)

        db.commit()
        logger.info(f"Saved shop_financial_state for shop {shop.id}")
        return True

    except EtsyAPIError as exc:
        logger.warning(
            f"EtsyAPIError fetching payment account for shop {shop.id}: {exc}"
        )
        return False
    except Exception as exc:
        logger.warning(
            f"Payment account sync failed for shop {shop.id}: {exc}"
        )
        return False


# ============================================================
#  Ledger sync
# ============================================================

@celery_app.task(name="app.worker.tasks.financial_tasks.sync_ledger_entries", max_retries=3)
def sync_ledger_entries(
    shop_id: int = None,
    tenant_id: Optional[int] = None,
    force_full_sync: bool = False,
) -> Dict[str, Any]:
    """
    Sync shop payment-account ledger entries from Etsy.

    Incremental by default — fetches entries newer than the most recent
    synced entry (minus 5 min buffer).  Requires ``billing_r`` or ``transactions_r`` scope.
    """
    db = SessionLocal()
    try:
        # Seed ledger type registry with common Etsy types (idempotent)
        _seed_ledger_type_registry(db)

        shops = _get_shops(db, shop_id, tenant_id)
        logger.info(f"sync_ledger_entries: shop_id={shop_id} tenant_id={tenant_id} shops_found={len(shops)}")
        results = {
            "shops_processed": 0,
            "entries_created": 0,
            "entries_updated": 0,
            "skipped_no_scope": 0,
            "errors": [],
        }

        redis_client = get_redis_client()
        etsy_client = EtsyClient(db)

        for shop in shops:
            has_scope = _has_financial_scope(db, shop)
            if not has_scope:
                logger.warning(f"sync_ledger: shop {shop.id} skipped (no billing_r/transactions_r scope)")
                results["skipped_no_scope"] += 1
                continue

            try:
                created, updated = asyncio.run(
                    _sync_shop_ledger(db, etsy_client, shop, force_full_sync)
                )
                results["entries_created"] += created
                results["entries_updated"] += updated
                results["shops_processed"] += 1
                _upsert_ledger_sync_status(db, shop, success=True)
                # Try payment-account sync (may not exist in Etsy API)
                asyncio.run(_sync_shop_payment_account(db, etsy_client, shop))
            except Exception as exc:
                logger.exception(f"Ledger sync failed for shop {shop.id}: {exc}")
                results["errors"].append({"shop_id": shop.id, "error": str(exc)})
                _upsert_ledger_sync_status(db, shop, success=False, error_msg=str(exc))
                try:
                    shop_name = shop.display_name or f"Shop {shop.id}"
                    notify_tenant_admins(
                        db=db,
                        tenant_id=shop.tenant_id,
                        notification_type=NotificationType.ERROR,
                        title="Financial sync failed",
                        message=f"Ledger sync failed for {shop_name}: {exc}",
                        action_url="/financials",
                        action_label="View financials",
                    )
                except Exception:
                    pass

        # Invalidate financial cache so UI shows fresh data after sync
        if redis_client and results["shops_processed"] > 0:
            try:
                keys = redis_client.keys("financials:*")
                if keys:
                    redis_client.delete(*keys)
            except Exception:
                pass

        logger.info(f"sync_ledger_entries complete: {results}")
        return results
    finally:
        db.close()


async def _sync_shop_ledger(
    db, etsy_client: EtsyClient, shop: Shop, force_full: bool
) -> tuple[int, int]:
    """Paginate through ledger entries for a single shop."""
    min_created = None
    if not force_full:
        latest = (
            db.query(LedgerEntry.entry_created_at)
            .filter(LedgerEntry.shop_id == shop.id)
            .order_by(LedgerEntry.entry_created_at.desc())
            .first()
        )
        if latest and latest[0]:
            min_created = int((latest[0] - timedelta(minutes=5)).timestamp())
    # Etsy API requires both min_created and max_created; time window must be <= 31 days
    WINDOW_SECONDS = 30 * 24 * 3600  # 30 days
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if min_created is None:
        # Full sync: go back 5 years to capture all historical data
        min_created = int((datetime.now(timezone.utc) - timedelta(days=365 * 5)).timestamp())
    range_end = now_ts

    created = updated = 0
    chunk_start = min_created
    seen_entry_types: set[str] = set()
    while chunk_start < range_end:
        chunk_end = min(chunk_start + WINDOW_SECONDS, range_end)
        offset = 0
        while True:
            data = await etsy_client.get_shop_ledger_entries(
                shop_id=shop.id,
                etsy_shop_id=shop.etsy_shop_id,
                limit=100,
                offset=offset,
                min_created=chunk_start,
                max_created=chunk_end,
            )
            entries = data.get("results", [])
            if not entries:
                break

            now_utc = datetime.now(timezone.utc)
            for raw in entries:
                etsy_id = raw.get("entry_id")
                if not etsy_id:
                    continue

                entry_type_raw = _extract_entry_type(raw)
                if entry_type_raw not in seen_entry_types:
                    seen_entry_types.add(entry_type_raw)
                    _upsert_registry(db, entry_type_raw, now_utc)

                existing = (
                    db.query(LedgerEntry)
                    .filter(LedgerEntry.etsy_entry_id == etsy_id)
                    .first()
                )
                description = raw.get("description", "")
                amount_obj = raw.get("amount")
                balance_obj = raw.get("balance")
                amount_cents = _normalize_etsy_money(amount_obj)
                balance_cents = _normalize_etsy_money(balance_obj)
                # Try top-level currency first (most Etsy ledger entries use this)
                currency = raw.get("currency") or raw.get("currency_code")
                # Fall back to nested dict formats
                if not currency:
                    if isinstance(amount_obj, dict):
                        currency = amount_obj.get("currency_code") or amount_obj.get("currency")
                    elif isinstance(balance_obj, dict):
                        currency = balance_obj.get("currency_code") or balance_obj.get("currency")
                # Final fallback
                if not currency:
                    currency = "USD"
                currency = str(currency).upper()[:3]
                ts = raw.get("created_timestamp") or raw.get("create_timestamp") or raw.get("create_date")
                created_ts = int(ts) if ts is not None else None
                entry_dt = datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else now_utc

                if existing:
                    existing.amount = amount_cents
                    existing.description = description
                    existing.entry_type = entry_type_raw
                    existing.balance = balance_cents
                    existing.currency = currency
                    existing.created_timestamp = created_ts
                    existing.entry_created_at = entry_dt
                    existing.raw_payload = _serialize_raw_payload(raw)
                    existing.synced_at = now_utc
                    updated += 1
                else:
                    entry = LedgerEntry(
                        tenant_id=shop.tenant_id,
                        shop_id=shop.id,
                        etsy_entry_id=etsy_id,
                        etsy_ledger_id=raw.get("ledger_id", 0),
                        entry_type=entry_type_raw,
                        category=None,
                        description=description,
                        amount=amount_cents,
                        balance=balance_cents,
                        currency=currency,
                        entry_created_at=entry_dt,
                        created_timestamp=created_ts,
                        raw_payload=_serialize_raw_payload(raw),
                        synced_at=now_utc,
                    )
                    db.add(entry)
                    created += 1

            db.commit()

            if len(entries) < 100:
                break
            offset += 100

        chunk_start = chunk_end

    return created, updated


# ============================================================
#  Payment detail sync
# ============================================================

@celery_app.task(name="app.worker.tasks.financial_tasks.sync_payment_details", max_retries=3)
def sync_payment_details(
    shop_id: int = None,
    tenant_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Sync payment breakdowns for shipped/delivered orders that are
    missing a PaymentDetail record.  Uses ``transactions_r`` scope.
    """
    db = SessionLocal()
    try:
        shops = _get_shops(db, shop_id, tenant_id)
        logger.info(f"sync_payment_details: shop_id={shop_id} tenant_id={tenant_id} shops_found={len(shops)}")
        results = {
            "shops_processed": 0,
            "payments_created": 0,
            "errors": [],
        }

        redis_client = get_redis_client()
        etsy_client = EtsyClient(db)

        for shop in shops:
            try:
                count = asyncio.run(
                    _sync_shop_payments(db, etsy_client, shop)
                )
                results["payments_created"] += count
                results["shops_processed"] += 1
                _upsert_payment_sync_status(db, shop, success=True)
            except Exception as exc:
                logger.exception(f"Payment sync failed for shop {shop.id}")
                results["errors"].append({"shop_id": shop.id, "error": str(exc)})
                _upsert_payment_sync_status(db, shop, success=False, error_msg=str(exc))
                try:
                    shop_name = shop.display_name or f"Shop {shop.id}"
                    notify_tenant_admins(
                        db=db,
                        tenant_id=shop.tenant_id,
                        notification_type=NotificationType.ERROR,
                        title="Payment sync failed",
                        message=f"Payment detail sync failed for {shop_name}: {exc}",
                        action_url="/financials",
                        action_label="View financials",
                    )
                except Exception:
                    pass

        logger.info(f"sync_payment_details complete: {results}")
        return results
    finally:
        db.close()


def _upsert_payment_from_raw(
    db, shop: Shop, raw: dict, order_id: Optional[int] = None
) -> bool:
    """Create PaymentDetail from Etsy raw payment if not exists. Returns True if created."""
    payment_id = raw.get("payment_id") or raw.get("id")
    receipt_id = raw.get("receipt_id")
    if not payment_id or not receipt_id:
        return False
    exists = db.query(PaymentDetail.id).filter(
        PaymentDetail.etsy_payment_id == payment_id
    ).first()
    if exists:
        return False
    if order_id is None:
        order = db.query(Order).filter(
            Order.shop_id == shop.id, Order.etsy_receipt_id == str(receipt_id)
        ).first()
        order_id = order.id if order else None
    detail = PaymentDetail(
        tenant_id=shop.tenant_id,
        shop_id=shop.id,
        order_id=order_id,
        etsy_payment_id=payment_id,
        etsy_receipt_id=str(receipt_id),
        amount_gross=_normalize_etsy_money(raw.get("amount_gross")),
        amount_fees=_normalize_etsy_money(raw.get("amount_fees")),
        amount_net=_normalize_etsy_money(raw.get("amount_net")),
        posted_gross=_normalize_etsy_money(raw.get("posted_gross")),
        adjusted_gross=_normalize_etsy_money(raw.get("adjusted_gross")),
        adjusted_fees=_normalize_etsy_money(raw.get("adjusted_fees")),
        adjusted_net=_normalize_etsy_money(raw.get("adjusted_net")),
        currency=raw.get("currency", raw.get("shop_currency", "USD")),
        posted_at=_ts(raw.get("create_timestamp") or raw.get("created_timestamp")),
        synced_at=datetime.now(timezone.utc),
    )
    db.add(detail)
    return True


async def _sync_shop_payments(
    db, etsy_client: EtsyClient, shop: Shop
) -> int:
    """Fetch payment details via ledger-driven batch + receipt fallback."""
    created = 0

    # 1. Ledger-driven: get ledger entries, batch fetch payments via getPaymentAccountLedgerEntryPayments
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    ledger_entry_ids = (
        db.query(LedgerEntry.etsy_entry_id)
        .filter(LedgerEntry.shop_id == shop.id, LedgerEntry.entry_created_at >= cutoff)
        .order_by(LedgerEntry.entry_created_at.desc())
        .limit(100)
        .all()
    )
    entry_ids = [r[0] for r in ledger_entry_ids if r[0]]
    if entry_ids:
        try:
            for i in range(0, len(entry_ids), 25):
                batch = entry_ids[i : i + 25]
                data = await etsy_client.get_ledger_entry_payments(
                    shop_id=shop.id,
                    etsy_shop_id=shop.etsy_shop_id,
                    ledger_entry_ids=batch,
                )
                payments = data.get("results", [])
                for raw in payments:
                    if _upsert_payment_from_raw(db, shop, raw):
                        created += 1
                db.commit()
        except EtsyAPIError as exc:
            logger.warning(f"Ledger entry payments fetch failed for shop {shop.id}: {exc}")
        except Exception as exc:
            logger.warning(f"Ledger entry payments error for shop {shop.id}: {exc}")

    # 2. Receipt fallback: orders with no PaymentDetail yet
    orders_needing_payments = (
        db.query(Order)
        .outerjoin(PaymentDetail, PaymentDetail.order_id == Order.id)
        .filter(
            Order.shop_id == shop.id,
            Order.fulfillment_status.in_(["shipped", "delivered"]),
            PaymentDetail.id.is_(None),
        )
        .limit(50)
        .all()
    )

    for order in orders_needing_payments:
        try:
            data = await etsy_client.get_payment_by_receipt(
                shop_id=shop.id,
                etsy_shop_id=shop.etsy_shop_id,
                receipt_id=order.etsy_receipt_id,
            )
            payments = data if isinstance(data, list) else data.get("results", [data])
            for raw in payments:
                if _upsert_payment_from_raw(db, shop, raw, order_id=order.id):
                    created += 1
            db.commit()
        except EtsyAPIError as exc:
            if exc.status_code == 404:
                logger.debug(f"No payment data yet for receipt {order.etsy_receipt_id}")
            else:
                logger.warning(f"Payment fetch failed for receipt {order.etsy_receipt_id}: {exc}")
        except Exception as exc:
            logger.warning(f"Payment sync error for receipt {order.etsy_receipt_id}: {exc}")

    return created


# ============================================================
#  Helpers
# ============================================================

def _get_shops(db, shop_id: Optional[int], tenant_id: Optional[int]):
    """Return a list of connected shops matching the filter criteria."""
    query = db.query(Shop).filter(Shop.status == "connected")
    if shop_id:
        query = query.filter(Shop.id == shop_id)
    if tenant_id is not None:
        query = query.filter(Shop.tenant_id == tenant_id)
    return query.all()


def _ts(epoch) -> Optional[datetime]:
    """Convert an epoch timestamp to a timezone-aware datetime, or None."""
    if epoch:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc)
    return None
