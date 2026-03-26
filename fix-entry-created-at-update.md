# Cursor Prompt: Fix `entry_created_at` Not Updated on Re-sync

## Problem

In `apps/api/app/worker/tasks/financial_tasks.py`, inside `_sync_shop_ledger`,
when a ledger entry already exists in the database, the code updates most fields
but does NOT update `entry_created_at`. This means a `force_full_sync` never
corrects the wrong dates on existing entries.

All 294 existing ledger entries have `entry_created_at = 2026-02-25` (the sync
date) instead of their real Etsy transaction dates. The re-sync cannot fix them
because the update block is missing `entry_created_at = entry_dt`.

## Confirmed from code inspection

The INSERT branch correctly has:
```python
entry_created_at=entry_dt,
```

But the UPDATE branch for existing entries is missing it entirely.

## Fix

In `apps/api/app/worker/tasks/financial_tasks.py`, find the existing entry
update block inside `_sync_shop_ledger`. It looks like this:

```python
if existing:
    existing.amount = amount_cents
    existing.description = description
    existing.entry_type = entry_type_raw
    existing.balance = balance_cents
    existing.created_timestamp = created_ts
    existing.raw_payload = _serialize_raw_payload(raw)
    existing.synced_at = now_utc
    updated += 1
```

Add `existing.entry_created_at = entry_dt` to this block:

```python
if existing:
    existing.amount = amount_cents
    existing.description = description
    existing.entry_type = entry_type_raw
    existing.balance = balance_cents
    existing.created_timestamp = created_ts
    existing.entry_created_at = entry_dt  # ← ADD THIS LINE
    existing.raw_payload = _serialize_raw_payload(raw)
    existing.synced_at = now_utc
    updated += 1
```

## Do NOT touch anything else.

## After the fix, run these commands:

```powershell
# 1. Restart worker
docker compose restart worker

# 2. Trigger full re-sync
docker compose exec api python -c "
from app.worker.tasks.financial_tasks import sync_ledger_entries
sync_ledger_entries.delay(shop_id=1, force_full_sync=True)
print('done')
"

# 3. Wait 3 minutes then verify dates are correct
docker compose exec db psql -U postgres -d etsy_platform -c "SELECT MIN(entry_created_at), MAX(entry_created_at) FROM ledger_entries WHERE shop_id = 1;"

# 4. Clear Redis cache
docker compose exec redis redis-cli FLUSHDB
```

## Expected result after fix

min should be around 2025-08-xx and max around 2026-02-xx,
instead of both being 2026-02-25.
