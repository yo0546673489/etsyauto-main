# Cursor Prompt: Fix Financial Data Accuracy — 4 Bugs

## Context

This is a FastAPI + Celery + PostgreSQL backend for an Etsy automation platform.
There are 4 confirmed bugs causing incorrect financial data. Fix all 4 exactly as
described. Do not touch anything outside the specified files and functions.

**The Alembic migration chain is broken** — `alembic_version` shows only
`20260220_membership_created` as the current head, but financial tables already
exist in the database (created outside Alembic). This means any new migration
must use `down_revision = '20260220_membership_created'` as its parent.

---

## Bug 1 — `DISBURSE2` mapped as `sales` inflates net profit

**File:** `apps/api/app/worker/tasks/financial_tasks.py`

**Problem:** In `LEDGER_TYPE_SEED`, `DISBURSE2` is mapped to `"sales"`.
`DISBURSE2` is a bank payout — not revenue. This causes net profit to be
inflated by the total of all historical payouts.

Several other types are also miscategorized or missing entirely.

**Fix:** Replace the entire `LEDGER_TYPE_SEED` dict with this:

```python
LEDGER_TYPE_SEED: Dict[str, str] = {
    # Sales (revenue credits)
    "transaction":                   "sales",
    "shipping_transaction":          "sales",
    "sale":                          "sales",
    "Sale":                          "sales",
    "SALE":                          "sales",
    "gift_wrap_fees":                "sales",
    "Transaction":                   "sales",

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
    "seller_onboarding_fee_payment": "fees",
    "vat_tax_ep":                    "fees",
    "vat_seller_services":           "fees",
    "DEPOSIT_FEE":                   "fees",
    "Fee":                           "fees",
    "FEE":                           "fees",

    # Marketing / advertising (debits — subtracted from profit)
    "offsite_ads_fee":               "marketing",
    "prolist":                       "marketing",
    "Etsy Ads":                      "marketing",
    "etsy_ads":                      "marketing",
    "EtsyAds":                       "marketing",
    "OffsiteAds":                    "marketing",
    "ShippingLabel":                 "marketing",
    "Marketing":                     "marketing",

    # Refunds (debits — subtracted from profit)
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

    # Adjustments — EXCLUDED from profit calculation entirely
    # These are balance movements, pass-throughs, and tax collection
    # that Etsy handles on the seller's behalf
    "DISBURSE":                      "adjustments",
    "DISBURSE2":                     "adjustments",  # bank payout — NOT revenue
    "PAYMENT_GROSS":                 "adjustments",
    "sales_tax":                     "adjustments",  # Etsy collects/remits, not seller income
    "Tax":                           "adjustments",
    "Adjustment":                    "adjustments",
    "RECOUP":                        "adjustments",
    "payout":                        "adjustments",
    "Payment":                       "adjustments",
    "Deposit":                       "adjustments",
    "reserve":                       "adjustments",
    "Reserve":                       "adjustments",
    "Reserve_release":               "adjustments",
}
```

---

## Bug 2 — `shop_financial_state` insert silently fails (no `tenant_id` column)

**Files:**
- `apps/api/app/worker/tasks/financial_tasks.py`
- New migration: `apps/api/alembic/versions/20260225_add_financial_state_columns.py`

**Problem:** The `shop_financial_state` table is missing `tenant_id` and
`reserve_amount` columns (confirmed via `\d shop_financial_state`). The
`_sync_shop_payment_account` function passes `tenant_id=shop.tenant_id` and
`reserve_amount=reserve` to the `ShopFinancialState()` constructor — this
causes every insert to fail silently because those columns don't exist.
Result: `shop_financial_state` table is always empty, so `get_payout_estimate`
falls back to the ledger running balance (-₪130.42) instead of the real
available payout (₪0.00).

### Step 2a — Create the migration

Create file `apps/api/alembic/versions/20260225_add_financial_state_columns.py`:

```python
"""Add tenant_id and reserve_amount to shop_financial_state

Revision ID: 20260225_financial_state_cols
Revises: 20260220_membership_created
Create Date: 2026-02-25
"""
from alembic import op
import sqlalchemy as sa

revision = '20260225_financial_state_cols'
down_revision = '20260220_membership_created'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tenant_id column (NOT NULL with default 1 for existing rows)
    op.execute("""
        ALTER TABLE shop_financial_state
        ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 1
    """)

    # Add reserve_amount column (nullable integer, cents)
    op.execute("""
        ALTER TABLE shop_financial_state
        ADD COLUMN IF NOT EXISTS reserve_amount INTEGER NULL
    """)

    # Add updated_at column if missing
    op.execute("""
        ALTER TABLE shop_financial_state
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NULL
    """)

    # Backfill tenant_id from shops table for any existing rows
    op.execute("""
        UPDATE shop_financial_state sfs
        SET tenant_id = s.tenant_id
        FROM shops s
        WHERE s.id = sfs.shop_id
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE shop_financial_state DROP COLUMN IF EXISTS tenant_id")
    op.execute("ALTER TABLE shop_financial_state DROP COLUMN IF EXISTS reserve_amount")
    op.execute("ALTER TABLE shop_financial_state DROP COLUMN IF EXISTS updated_at")
```

### Step 2b — Fix `_sync_shop_payment_account` in `financial_tasks.py`

Replace the entire `_sync_shop_payment_account` function with:

```python
async def _sync_shop_payment_account(
    db, etsy_client: EtsyClient, shop: Shop
) -> bool:
    """
    Fetch payment-account from Etsy and upsert shop_financial_state.
    Returns True if updated, False if endpoint unavailable or error.
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
```

---

## Bug 3 — Redis cache key uses microseconds, causing stale data on date range change

**File:** `apps/api/app/services/financial_service.py`

**Problem:** Cache keys include full `datetime` objects (with microseconds).
Every page load generates a slightly different key, so the cache never hits
consistently — but more importantly, changing the date range selector (e.g.
"Last 7 days" → "Last 30 days") sometimes returns the same cached result
because the microseconds differ but the logical date is the same.

**Fix:** In `financial_service.py`, update the cache key line in each of
these 5 functions to use date-only strings:

### `get_financial_summary`
```python
# FIND this line:
ck = self._cache_key(tenant_id, shop_id, f"full_summary:{start_date}:{end_date}", shop_ids)

# REPLACE with:
start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
ck = self._cache_key(tenant_id, shop_id, f"full_summary:{start_key}:{end_key}", shop_ids)
```

### `get_profit_and_loss`
```python
# FIND this line:
ck = self._cache_key(tenant_id, shop_id, f"pnl:{start_date}:{end_date}", shop_ids)

# REPLACE with:
start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
ck = self._cache_key(tenant_id, shop_id, f"pnl:{start_key}:{end_key}", shop_ids)
```

### `get_fee_breakdown`
```python
# FIND this line:
ck = self._cache_key(tenant_id, shop_id, f"fees:{start_date}:{end_date}", shop_ids)

# REPLACE with:
start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
ck = self._cache_key(tenant_id, shop_id, f"fees:{start_key}:{end_key}", shop_ids)
```

### `get_revenue_timeline`
```python
# FIND this line:
ck = self._cache_key(tenant_id, shop_id, f"timeline:{granularity}:{start_date}:{end_date}", shop_ids)

# REPLACE with:
start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
ck = self._cache_key(tenant_id, shop_id, f"timeline:{granularity}:{start_key}:{end_key}", shop_ids)
```

### `get_discount_summary`
```python
# FIND this line:
ck = self._cache_key(tenant_id, shop_id, f"discounts:{start_date}:{end_date}", shop_ids)

# REPLACE with:
start_key = start_date.strftime("%Y-%m-%d") if start_date else "none"
end_key = end_date.strftime("%Y-%m-%d") if end_date else "none"
ck = self._cache_key(tenant_id, shop_id, f"discounts:{start_key}:{end_key}", shop_ids)
```

---

## Bug 4 — New entry types discovered during sync are registered as `mapped=False`

**File:** `apps/api/app/worker/tasks/financial_tasks.py`

**Problem:** `_upsert_registry()` always sets `mapped=False` and `category=None`
for new entry types it hasn't seen before. When a new Etsy type appears that IS
in `LEDGER_TYPE_SEED`, it gets registered as unmapped first, then only fixed on
the next `_seed_ledger_type_registry()` call (which only runs at task startup).
This causes the unmapped warning banner to reappear after syncs.

**Fix:** Replace the `_upsert_registry` function with:

```python
def _upsert_registry(db, entry_type: str, now: datetime) -> None:
    """Register or update entry_type in ledger_entry_type_registry.
    If the type is known in LEDGER_TYPE_SEED, map it immediately.
    """
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
        reg = LedgerEntryTypeRegistry(
            entry_type=entry_type,
            category=known_category,        # map immediately if known
            first_seen_at=now,
            last_seen_at=now,
            mapped=known_category is not None,  # True if known, False if truly new
        )
        db.add(reg)
```

---

## Files to modify (summary)

| File | Change |
|---|---|
| `apps/api/app/worker/tasks/financial_tasks.py` | Replace `LEDGER_TYPE_SEED`, replace `_sync_shop_payment_account`, replace `_upsert_registry` |
| `apps/api/app/services/financial_service.py` | Fix cache keys in 5 functions |
| `apps/api/alembic/versions/20260225_add_financial_state_columns.py` | Create new file |

## Do NOT touch

- Any other file not listed above
- The `sync_ledger_entries` task logic
- The `sync_payment_details` task logic
- Any frontend files
- Any other migration files
- The `FinancialService` query logic (date filters are already correct)
- The `financials.py` endpoint file

---

## After making all code changes, run these commands in order

```bash
# 1. Apply the migration
docker compose exec api alembic upgrade 20260225_financial_state_cols

# 2. Clear stale Redis cache
docker compose exec redis redis-cli FLUSHDB

# 3. Restart worker to pick up LEDGER_TYPE_SEED changes
docker compose restart worker

# 4. Trigger a full re-sync to re-classify all ledger entries
docker compose exec api python -c "
from app.worker.tasks.financial_tasks import sync_ledger_entries
sync_ledger_entries.delay(shop_id=1, force_full_sync=True)
print('Full sync triggered')
"

# 5. Verify shop_financial_state is populated (run ~60 seconds after step 4)
docker compose exec db psql -U postgres -d etsy_platform -c \
  "SELECT shop_id, balance, available_for_payout, reserve_amount, currency_code FROM shop_financial_state;"

# 6. Verify no unmapped types remain
docker compose exec db psql -U postgres -d etsy_platform -c \
  "SELECT entry_type, category, mapped FROM ledger_entry_type_registry WHERE mapped = false;"
```

## Expected results after fix

- `shop_financial_state` table has a row for shop 1 with real balance values
- `ledger_entry_type_registry` shows 0 rows with `mapped = false`
- Upcoming Payout card shows ₪0.00 (matching Etsy dashboard)
- Current Balance card shows ₪0.00 (matching Etsy dashboard)
- Net Profit for "Last 7 days" shows a value close to -₪42.75 (matching Etsy)
- The unmapped types warning banner disappears
