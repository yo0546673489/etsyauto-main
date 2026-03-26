# Cursor Prompt: Financial Code Cleanup

## Context

This cleanup follows a series of bug fixes to the financial sync system.
The code works correctly now. This prompt removes redundancy and improves
clarity without changing any behavior.

## Do NOT touch these files:
- Any migration files in `apps/api/alembic/versions/`
- `apps/api/app/api/endpoints/financials.py` (clean, no changes needed)
- Any frontend files
- Any test files

---

## File 1: `apps/api/app/worker/tasks/financial_tasks.py`

### Cleanup 1a — Remove duplicate/conflicting entries from `LEDGER_TYPE_SEED`

The following entries in `LEDGER_TYPE_SEED` are either wrong or redundant
with the database registry. Clean up the dict:

**Remove these wrong mappings** (these were bugs we fixed via DB updates,
but the seed dict still has the old wrong values that will overwrite correct
DB values on next worker restart):

```python
# REMOVE these entries from LEDGER_TYPE_SEED — they are wrong:
"PAYMENT_GROSS": "adjustments",   # Wrong — should be "sales", fixed in DB
"shipping_transaction": "fees",   # Wrong — should be "sales", fixed in DB  
"sales_tax": "adjustments",       # Correct in DB but seed will re-overwrite
"Marketing": "adjustments",       # Wrong — should be "marketing"
```

**Correct final `LEDGER_TYPE_SEED`** — replace the entire dict with:

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
```

### Cleanup 1b — Simplify `_sync_shop_payment_account`

The Etsy API endpoint `/application/shops/{id}/payment-account` returns
404/None for this shop. The function is kept as a no-op fallback but
should have a clear comment explaining why it always returns False,
so future developers don't waste time debugging it.

Find `_sync_shop_payment_account` and add this comment at the top of the
function body:

```python
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
    # ... rest of function unchanged
```

### Cleanup 1c — Remove unused import if present

Check if `from app.core.redis import get_redis_client` is imported at the
top of `financial_tasks.py`. If it is imported but only used inside
`sync_ledger_entries` (not at module level), it is fine to keep.
Do not remove it.

---

## File 2: `apps/api/app/services/financial_service.py`

### Cleanup 2a — Remove redundant `ShopFinancialState` fallback comment

In `get_payout_estimate`, the code checks `shop_financial_state` first
then falls back to ledger. Add a clear comment explaining the fallback
is the primary path since the Etsy API doesn't expose balance data:

Find the fallback section (after the `if state:` block) and add:

```python
# Fallback: derive balance from most recent ledger entry's running balance.
# This is the primary code path since Etsy's payment-account API endpoint
# is not available for all shops. The ledger's running `balance` field
# is updated with every transaction and accurately reflects the current
# account balance.
```

### Cleanup 2b — Fix `total_fees` in `get_fee_breakdown`

The `total_fees` in the result currently sums ALL negative ledger entries
including marketing and adjustments. After the registry filter fix,
`total_fees` should only sum actual fee entries. Verify the result dict
uses the correctly filtered `total_fees` variable (which it does after
the registry join fix). No code change needed if already correct.

### Cleanup 2c — Remove dead `currency` hardcode

In `get_fee_breakdown`, find this line in the result dict:

```python
"currency": "USD",
```

Replace with dynamic currency from ledger entries (same pattern as other methods):

```python
# Get currency from ledger entries for this period
fee_currency_row = (
    self.db.query(LedgerEntry.currency)
    .filter(and_(*filters))
    .order_by(LedgerEntry.entry_created_at.desc())
    .first()
)
fee_currency = (fee_currency_row[0] if fee_currency_row and fee_currency_row[0] else "ILS") or "ILS"
```

Then in the result dict change:
```python
"currency": "USD",  # ← old hardcoded value
# to:
"currency": fee_currency,
```

---

## Summary of changes

| File | Change | Reason |
|---|---|---|
| `financial_tasks.py` | Replace `LEDGER_TYPE_SEED` | Fix wrong mappings, add missing types |
| `financial_tasks.py` | Add comment to `_sync_shop_payment_account` | Document known API limitation |
| `financial_service.py` | Add comment to payout fallback | Document primary code path |
| `financial_service.py` | Fix hardcoded `"USD"` in fee breakdown | Use actual ledger currency |

## After changes

```powershell
docker compose restart worker api
docker compose exec redis redis-cli FLUSHDB
```

No database changes or migrations needed.
