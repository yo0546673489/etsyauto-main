# Cursor Prompt: Fix Ledger Entry Dates — Wrong Timestamp Field

## Background

The financial analytics page shows incorrect net profit because all ledger
entries have the wrong date. Instead of the actual Etsy transaction date,
every entry has the date it was synced (February 25, 2026).

This means date range filters (Last 7 days, Last 3 months, etc.) return
wrong results — either everything or nothing, depending on the period selected.

## Root Cause — Confirmed

In `apps/api/app/worker/tasks/financial_tasks.py`, inside `_sync_shop_ledger`,
there is a typo on this line:

```python
ts = raw.get("create_timestamp")  # WRONG — field doesn't exist in Etsy response
```

The actual field name in Etsy's raw ledger entry payload is `"created_timestamp"`
(with a 'd'). Because the field name is wrong, `ts` is always `None`, so the
code falls back to `now_utc` (the sync time) for every single entry.

**Confirmed from raw_payload in database:**
```json
{
  "created_timestamp": 1766380721,
  "create_date": 1766380721,
  "ledger_type": "prolist",
  "amount": -321
}
```

`created_timestamp` exists and contains the correct Unix timestamp.
`create_timestamp` (without 'd') does not exist — always returns None.

## Fix Required

### File: `apps/api/app/worker/tasks/financial_tasks.py`

Inside the `_sync_shop_ledger` function, find this block:

```python
ts = raw.get("create_timestamp")
created_ts = int(ts) if ts is not None else None
entry_dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else now_utc
```

Replace with:

```python
ts = raw.get("created_timestamp") or raw.get("create_timestamp") or raw.get("create_date")
created_ts = int(ts) if ts is not None else None
entry_dt = datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else now_utc
```

**Why three fallbacks:**
- `created_timestamp` — correct field, present in all observed payloads
- `create_timestamp` — old typo fallback, keeps backward compatibility
- `create_date` — also present in raw payload as a secondary fallback

### Do NOT touch anything else in this file.

---

## After Making the Code Change

Run these commands in order:

```powershell
# 1. Restart worker to load the fixed code
docker compose restart worker

# 2. Trigger a full re-sync to rewrite all entry dates
docker compose exec api python -c "
from app.worker.tasks.financial_tasks import sync_ledger_entries
sync_ledger_entries.delay(shop_id=1, force_full_sync=True)
print('Full sync triggered')
"

# 3. Wait 2-3 minutes, then verify dates are now correct
docker compose exec db psql -U postgres -d etsy_platform -c "
SELECT 
    entry_type, 
    amount, 
    entry_created_at,
    created_timestamp
FROM ledger_entries 
WHERE shop_id = 1 
ORDER BY entry_created_at ASC 
LIMIT 5;
"
```

**Expected result:** `entry_created_at` should now show dates spread across
2025–2026 instead of all being `2026-02-25`.

```powershell
# 4. Clear Redis cache after sync completes
docker compose exec redis redis-cli FLUSHDB
```

---

## Verification

After the sync and cache flush, go to the Finances page and set the period
to "Last 3 months". Compare with Etsy's dashboard set to the same period.

The numbers should now be close to matching because:
1. Date range filters will correctly include/exclude entries by their real dates
2. The period "Last 3 months" will only sum entries from Nov–Jan, not all-time
