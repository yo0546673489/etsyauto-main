# Cursor Prompt: Add `currency` to Existing Entry Update Block

## Problem

In `apps/api/app/worker/tasks/financial_tasks.py`, inside `_sync_shop_ledger`,
the `existing` entry update block is missing `existing.currency = currency`.

This means a `force_full_sync` correctly extracts ILS from the raw payload
but never writes it to existing entries — they stay as USD forever.

## Fix

Find this block in `_sync_shop_ledger`:

```python
if existing:
    existing.amount = amount_cents
    existing.description = description
    existing.entry_type = entry_type_raw
    existing.balance = balance_cents
    existing.created_timestamp = created_ts
    existing.entry_created_at = entry_dt
    existing.raw_payload = _serialize_raw_payload(raw)
    existing.synced_at = now_utc
    updated += 1
```

Replace with:

```python
if existing:
    existing.amount = amount_cents
    existing.description = description
    existing.entry_type = entry_type_raw
    existing.balance = balance_cents
    existing.currency = currency          # ← ADD THIS LINE
    existing.created_timestamp = created_ts
    existing.entry_created_at = entry_dt
    existing.raw_payload = _serialize_raw_payload(raw)
    existing.synced_at = now_utc
    updated += 1
```

## Do NOT touch anything else.

## After the fix:

```powershell
# 1. Restart worker
docker compose restart worker

# 2. Trigger full re-sync
docker compose exec api python -c "
from app.worker.tasks.financial_tasks import sync_ledger_entries
sync_ledger_entries.delay(shop_id=1, force_full_sync=True)
print('done')
"

# 3. Wait 3 minutes then verify
docker compose exec db psql -U postgres -d etsy_platform -c "SELECT DISTINCT currency, COUNT(*) FROM ledger_entries WHERE shop_id = 1 GROUP BY currency;"

# 4. Clear Redis
docker compose exec redis redis-cli FLUSHDB
```

## Expected result
```
currency | count
---------+-------
ILS      |   294
```
