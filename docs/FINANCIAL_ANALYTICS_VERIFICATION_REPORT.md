# Financial Analytics and Discount Synchronization - Verification Report

## Audit Summary

### Gaps Found and Fixes Applied

| Gap | Severity | Fix Applied |
|-----|----------|-------------|
| No sync status endpoint; frontend could not show "last updated" | Medium | Added `GET /api/financials/sync-status` returning ledger/payment last sync timestamps per shop |
| No discount aggregation; Order.discount_amt not surfaced | Medium | Added `get_discount_summary()` and `GET /api/financials/discounts`; included `total_discounts` in financial summary |
| Ledger sync checked billing_r only; Etsy docs suggest transactions_r | Low | Updated to `_has_financial_scope` checking billing_r OR transactions_r |
| No FinancialSyncStatus table; sync state not queryable | Low | Added `FinancialSyncStatus` model and migration |
| Payout section not prominent; no sync status; no discounts view | Medium | Added Upcoming Payout card, sync status display, Discounts section |

## New Models Added

- **FinancialSyncStatus** (`financial_sync_status` table)
  - `id`, `tenant_id`, `shop_id`, `ledger_last_sync_at`, `payment_last_sync_at`, `ledger_last_error`, `payment_last_error`, `created_at`, `updated_at`
  - Unique constraint on `shop_id`
  - Migration: `20260220_add_financial_sync_status.py`

## New Endpoints Implemented

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/financials/sync-status` | Last sync timestamps per shop (ledger, payment) and any errors |
| GET | `/api/financials/discounts` | Aggregated discounts from Order.discount_amt |

## UI Changes

1. **Upcoming Payout** – Prominent card above Activity Summary showing available-for-payout amount
2. **Financial Trends** – Existing revenue timeline bar chart (reuses timeline data)
3. **Sync Status** – "Last synced: X min ago" next to Sync button; error banner when sync fails
4. **Discounts Section** – Collapsible card in Activity Summary when discount data exists

## Required Etsy Scopes

- `billing_r` – Read billing/fees data
- `transactions_r` – Read payments, ledger entries (per Etsy Payments Tutorial)

Both are requested in OAuth flow. Ledger sync accepts either scope.

## Known Limitations

1. **Etsy Coupon API** – No confirmed read/list endpoint for shop coupons. Discounts are derived from `Order.discount_amt` only.
2. **Scope verification** – Ledger endpoint scope (billing_r vs transactions_r) may need live verification with Etsy.
3. **Sync status** – Populated only after sync tasks run; no status until first sync completes.

## Next Steps

1. Run migration: `alembic upgrade head`
2. Monitor Etsy Coupon API for future read support
3. Verify ledger scope with live Etsy API if sync fails with billing_r
