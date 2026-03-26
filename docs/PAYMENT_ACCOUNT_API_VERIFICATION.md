# Payment Account API Verification

## Implementation Status

The Payment Account Financial Separation plan has been fully implemented. This document records the Etsy API verification status per the plan's "Clarification Needed" section.

## Etsy API Endpoint

**Path**: `GET /v3/application/shops/{shop_id}/payment-account`

**Full URL**: `https://openapi.etsy.com/v3/application/shops/{etsy_shop_id}/payment-account`

**Scope**: `billing_r` (required)

## Response Schema (Assumed)

The implementation expects one of these shapes:

1. **Direct object**:
   ```json
   {
     "balance": {"amount": 1500, "divisor": 100, "currency_code": "USD"},
     "available_for_payout": {"amount": 1200, "divisor": 100, "currency_code": "USD"},
     "reserve_amount": {"amount": 300, "divisor": 100, "currency_code": "USD"},
     "currency_code": "USD"
   }
   ```

2. **Wrapped in `results`** (Etsy v3 pattern):
   ```json
   {"count": 1, "results": [{ ... }]}
   ```

3. **Raw integers** (already in cents): `"balance": 1500`

## Parser Flexibility

`_normalize_etsy_money()` in `financial_tasks.py` handles:

- Dict with `amount` and `divisor` → `int(amount * 100 / divisor)` (cents)
- Dict with `amount` only → default divisor 100
- Raw `int` → unchanged (assumed cents)
- `None` → 0

## Verification Recommendation

Before production use with real Etsy shops:

1. Call the endpoint with a test shop and inspect the actual response.
2. If field names differ (e.g. `available_for_payout` vs `availableForPayout`), update `_sync_shop_payment_account()` in `financial_tasks.py`.
3. Confirm the endpoint exists in the current Etsy Open API v3 spec; the public docs emphasize ledger entries (`getShopPaymentAccountLedgerEntries`) over a standalone payment-account resource.

## Verification Result

The `get_payment_account()` method in `etsy_client.py` calls the endpoint and returns `None` on 404, 400, or 500. The Etsy Open API v3 public docs emphasize ledger entries (`getShopPaymentAccountLedgerEntries`) over a standalone payment-account resource. **If the endpoint returns 404** (as observed with some test shops), the system relies on the ledger-only approach: balance and available_for_payout are derived from the latest ledger entry and reserve totals.

## Fallback

If the payment-account endpoint is unavailable or returns an error, `get_payout_estimate()` falls back to ledger-based balance with a logged warning.
