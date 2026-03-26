# Cursor Prompt: Fix Currency Extraction in Ledger Sync

## Problem

In `apps/api/app/worker/tasks/financial_tasks.py`, inside `_sync_shop_ledger`,
the currency is being stored as "USD" for all ledger entries even though Etsy
returns "ILS" (or other currencies) in the raw payload.

**Confirmed from database:**
```
entry_type | amount | currency | raw_currency
-----------+--------+----------+-------------
listing    |    -71 | USD      | ILS
prolist    |   -135 | USD      | ILS
```

The `raw_payload->>'currency'` is ILS but the stored `currency` column is USD.

## Root Cause

The raw Etsy ledger entry looks like this:
```json
{
  "amount": -321,
  "balance": 2995,
  "currency": "ILS",
  "entry_id": 27294756643,
  "ledger_type": "prolist",
  "created_timestamp": 1766380721
}
```

`amount` is a plain integer, NOT a dict. The current code only extracts
currency from dict-type amount/balance objects:

```python
# CURRENT BROKEN CODE:
if isinstance(amount_obj, dict):
    currency = amount_obj.get("currency_code", "USD") or "USD"
elif isinstance(balance_obj, dict):
    currency = balance_obj.get("currency_code", "USD") or "USD"
```

Since `amount_obj` is an integer, neither branch runs, and currency defaults
to "USD". The actual currency sits at `raw.get("currency")` — the top level
of the payload.

## Fix

In `apps/api/app/worker/tasks/financial_tasks.py`, inside `_sync_shop_ledger`,
find this currency extraction block:

```python
currency = "USD"
if isinstance(amount_obj, dict):
    currency = amount_obj.get("currency_code", "USD") or "USD"
elif isinstance(balance_obj, dict):
    currency = balance_obj.get("currency_code", "USD") or "USD"
```

Replace with:

```python
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
```

## Do NOT touch anything else.

## After the fix, run these commands:

```powershell
# 1. Restart worker
docker compose restart worker

# 2. Trigger full re-sync to fix currency on all existing entries
docker compose exec api python -c "
from app.worker.tasks.financial_tasks import sync_ledger_entries
sync_ledger_entries.delay(shop_id=1, force_full_sync=True)
print('done')
"

# 3. Wait 3 minutes, then verify currency is now ILS
docker compose exec db psql -U postgres -d etsy_platform -c "
SELECT DISTINCT currency, COUNT(*)
FROM ledger_entries
WHERE shop_id = 1
GROUP BY currency;
"

# 4. Clear Redis cache
docker compose exec redis redis-cli FLUSHDB
```

## Expected result

```
currency | count
---------+-------
ILS      |   294
```

All entries should now show ILS instead of USD. The frontend currency
conversion will then correctly skip conversion (source = target = ILS)
and show the raw ILS amounts directly, matching Etsy's dashboard.
