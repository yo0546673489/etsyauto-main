# Financial Sync Flow – Critical Audit Report

**Date:** 2026-02-20  
**Updated:** 2026-02-25 (root cause confirmed and fixed)  
**Status:** ~~Data not syncing at all~~ **Fixed – UniqueViolation in ledger_entry_type_registry**  
**Log evidence:** `apps/api/debug-704a40.log`, `docker compose logs worker`

---

## Executive Summary

The financial sync flow has multiple entry points and several potential failure modes. Log analysis shows sync tasks **start** but there is **no evidence of successful completion** in the debug log.

**Root cause (confirmed 2026-02-25):** The sync was **crashing** with a `UniqueViolation` on `ledger_entry_type_registry`. The code called `_upsert_registry()` for every ledger entry; when many entries shared the same `entry_type` (e.g. `prolist`), it attempted to insert duplicate rows in the same transaction. The DB query in `_upsert_registry` does not see pending (unflushed) objects, so multiple adds for the same type caused a unique constraint violation.

**Fix applied:** Deduplicate entry types per batch – only call `_upsert_registry()` once per unique `entry_type` using a `seen_entry_types` set.

**Scopes verified:** OAuth token has both `billing_r` and `transactions_r` – Cause #2 (missing scopes) was ruled out.

---

## 1. Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRIGGERS                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Sync button (Financials page)     → triggerSync(shopId?, forceFull)        │
│ • Refresh Connection (Financials)   → refreshConnection() + triggerSync()   │
│ • OAuth callback (reconnect shop)   → sync_ledger + sync_payment .delay()   │
│ • Celery Beat (scheduled)           → sync every 6h/3h, NO args             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ API: POST /api/financials/sync                                                │
│ • shop_id: optional (from query param)                                       │
│ • tenant_id: from auth context                                               │
│ • Dispatches: sync_ledger_entries.delay() + sync_payment_details.delay()     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CELERY WORKER                                                                 │
│ • sync_ledger_entries(shop_id, tenant_id, force_full_sync)                  │
│ • sync_payment_details(shop_id, tenant_id)                                    │
│ • _get_shops() → Shop.status == "connected", filter by shop_id/tenant_id     │
│ • _has_financial_scope() → billing_r or transactions_r in OAuth scopes       │
│ • For each shop: EtsyClient → Etsy API (ledger, payments)                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Log Evidence

**File:** `apps/api/debug-704a40.log`

| Observation | Count |
|-------------|-------|
| `sync_ledger started` | 13 |
| `sync_ledger finished` | **0** |

**Worker logs (2026-02-25):** `sync_ledger_entries` tasks are received and run, but crash with:
```
UniqueViolation: duplicate key value violates unique constraint "ledger_entry_type_registry_pkey"
DETAIL: Key (entry_type)=(prolist) already exists.
```
Traceback points to `financial_tasks.py` line 471 (`db.commit()`) in `_sync_shop_ledger`, triggered by bulk insert of `LedgerEntryTypeRegistry` rows with duplicate `entry_type` values.

**Implication:** Tasks are queued and start, but crash before completion due to the registry duplicate-key bug.

---

## 3. Identified Issues

### 3.1 Token / Auth Failure (Primary)

**Symptom:** "Reconnect your Etsy shop to restore access" / "Token retrieval failed"

**Cause:** Refresh token expired or revoked. Etsy requires re-authorization.

**Flow:**
1. `EtsyClient._get_access_token()` → `TokenManager.get_token()` → `refresh_token()`
2. `etsy_oauth.refresh_access_token()` fails (invalid_grant, etc.)
3. `TokenRefreshError` raised → `EtsyAPIError("Reconnect your Etsy shop...")`
4. Ledger sync catches exception → `_upsert_ledger_sync_status(success=False, error_msg=...)`
5. No ledger entries written; sync status shows error

**Fix:** User must go to **Settings → Shops** and **reconnect** the Etsy shop.

---

### 3.2 Scheduled Tasks Run Without tenant_id

**Code:** `celery_app.conf.beat_schedule` calls:
```python
"sync-ledger-entries-every-6-hours": {
    "task": "app.worker.tasks.financial_tasks.sync_ledger_entries",
    "schedule": 21600.0,
},
```

No `args` or `kwargs` → `shop_id=None`, `tenant_id=None`.

**Effect:** `_get_shops(db, None, None)` returns **all** connected shops across **all** tenants. This is likely intended for a multi-tenant worker but can be surprising.

---

### 3.3 Scope Check Can Skip All Shops

**Code:** `_has_financial_scope()` requires `billing_r` or `transactions_r` in OAuth token scopes.

If the shop was connected before `billing_r` was added to `EtsyOAuthService.SCOPES`, the token may lack it. Those shops are skipped (`skipped_no_scope += 1`).

**Fix:** Reconnect the shop so the new scopes are granted.

---

### 3.4 Frontend shop_id Logic

**Code:** `handleSync`:
```javascript
const targetShopId = shopIds && shopIds.length > 1 ? undefined : (shopIds?.[0] ?? shopId);
```

- Multiple shops selected → `undefined` (tenant-wide sync)
- Single shop → `shopIds[0]` or `shopId`
- No shop selected → `undefined`

When `undefined`, API receives no `shop_id` → worker syncs all connected shops for the tenant. This is correct.

---

### 3.5 Debug Instrumentation Left in Code

**Locations:**
- `apps/api/app/api/endpoints/shops.py` (OAuth callback)
- `apps/api/app/worker/tasks/financial_tasks.py` (sync_ledger start/finish)

Writes to `debug-704a40.log` with a relative path. In Docker, the worker may write to a different directory or fail silently.

---

## 4. Failure Point Checklist

| Check | Status |
|-------|--------|
| Celery worker running | ✅ (tasks start) |
| Redis broker reachable | ✅ (tasks queued) |
| API receives sync request | ✅ |
| Worker receives task | ✅ |
| Shops found by _get_shops | ⚠️ Unknown |
| billing_r / transactions_r scope | ⚠️ Likely missing or token expired |
| Token refresh | ❌ Failing (user-reported) |
| Etsy API reachable from worker | ⚠️ Unknown (timeout was increased) |
| Ledger entries written | ❌ No data |

---

## 5. Recommendations

### Immediate

1. **Reconnect Etsy shop**  
   Settings → Shops → Reconnect. This refreshes the token and re-grants scopes.

2. **Confirm worker logs**  
   Run: `docker compose logs worker` (or equivalent) and look for:
   - `Ledger sync failed for shop X`
   - `Token refresh failed`
   - `skipped_no_scope`
   - Any Python tracebacks

3. **Remove debug instrumentation**  
   Delete the `#region agent log` blocks from `shops.py` and `financial_tasks.py`.

### Short-term

4. **Add structured logging**  
   Log task start, shops found, scope check result, and task end (with success/failure) to stdout so Docker captures it.

5. **Validate OAuth scopes**  
   After connect, log or verify that `billing_r` is present in the stored token scopes.

6. **Scheduled task args**  
   If Beat should run per-tenant, pass `tenant_id` via task args (e.g. from a config or DB query).

---

## 6. How to Verify Fix

1. Reconnect shop in Settings → Shops.
2. Click **Sync** on the Financials page.
3. Wait ~30 seconds.
4. Check:
   - "Last synced X min ago" updates
   - No sync error banner
   - Ledger table and summary cards show data
5. Inspect `docker compose logs worker` for successful sync completion.
