# Cursor Prompt: Fix Fee Breakdown Category Names

## Problem

In `apps/api/app/services/financial_service.py`, the `get_fee_breakdown`
method returns raw `entry_type` values as the `category` field in each
category object. For example:

```json
{"category": "PAYMENT_PROCESSING_FEE", "amount": 4259, "count": 4}
{"category": "transaction", "amount": 4661, "count": 4}
{"category": "listing", "amount": 1287, "count": 20}
```

But the frontend in `apps/web/app/financials/page.tsx` filters for:
```typescript
['transaction_fee', 'processing_fee', 'listing_renewal', 'subscription']
```

So the filter finds zero matches and shows "No fee data for this period."

Additionally, the fee breakdown incorrectly includes non-fee entry types
like `DISBURSE2` (adjustments), `prolist` (marketing), and `sales_tax`
(adjustments) because `get_fee_breakdown` filters only by `amount < 0`
instead of by registry category.

## Fix — `apps/api/app/services/financial_service.py`

### Step 1: Add entry type → normalized category mapping

Add this constant near the top of the `FinancialService` class (after the
`CACHE_TTL = 300` line):

```python
# Maps raw Etsy entry_type values to normalized frontend category names
FEE_CATEGORY_MAP: dict = {
    # Transaction fees
    "transaction":                   "transaction_fee",
    "transaction_quantity":          "transaction_fee",
    "transaction_fee":               "transaction_fee",
    # Processing fees
    "PAYMENT_PROCESSING_FEE":        "processing_fee",
    "payment_processing_fee":        "processing_fee",
    "processing_fee":                "processing_fee",
    # Listing renewal fees
    "listing":                       "listing_renewal",
    "listing_private":               "listing_renewal",
    "renew_sold":                    "listing_renewal",
    "renew_sold_auto":               "listing_renewal",
    "renew_expired":                 "listing_renewal",
    "auto_renew_expired":            "listing_renewal",
    # Deposit / other fees
    "DEPOSIT_FEE":                   "deposit_fee",
    "seller_onboarding_fee":         "subscription",
    "seller_onboarding_fee_payment": "subscription",
    "vat_tax_ep":                    "vat_fee",
    "vat_seller_services":           "vat_fee",
    "shipping_labels":               "shipping_label",
}
```

### Step 2: Fix `get_fee_breakdown` to use registry category filter

Find the `get_fee_breakdown` method. Replace the filters list and query:

```python
# FIND this filters list:
filters = [
    LedgerEntry.tenant_id == tenant_id,
    LedgerEntry.entry_created_at >= start_date,
    LedgerEntry.entry_created_at <= end_date,
    LedgerEntry.amount < 0,  # Fees are debits (negative)
]
self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)

rows = (
    self.db.query(
        LedgerEntry.entry_type,
        func.sum(LedgerEntry.amount).label("total"),
        func.count(LedgerEntry.id).label("count"),
    )
    .filter(and_(*filters))
    .group_by(LedgerEntry.entry_type)
    .all()
)
```

Replace with (join registry to filter ONLY entries categorized as "fees"):

```python
filters = [
    LedgerEntry.tenant_id == tenant_id,
    LedgerEntry.entry_created_at >= start_date,
    LedgerEntry.entry_created_at <= end_date,
    LedgerEntry.amount < 0,
    LedgerEntryTypeRegistry.category == "fees",  # Only real fee entries
]
self._apply_shop_filter(filters, LedgerEntry.shop_id, shop_id, shop_ids)

rows = (
    self.db.query(
        LedgerEntry.entry_type,
        func.sum(LedgerEntry.amount).label("total"),
        func.count(LedgerEntry.id).label("count"),
    )
    .join(
        LedgerEntryTypeRegistry,
        LedgerEntry.entry_type == LedgerEntryTypeRegistry.entry_type,
    )
    .filter(and_(*filters))
    .group_by(LedgerEntry.entry_type)
    .all()
)
```

### Step 3: Map entry_type to normalized category name in the result

Find this loop inside `get_fee_breakdown`:

```python
categories = []
total_fees = 0
for entry_type, total, count in rows:
    abs_total = abs(total or 0)
    total_fees += abs_total
    categories.append({
        "category": entry_type or "other",
        "amount": abs_total,
        "count": count,
    })
```

Replace with:

```python
# Aggregate by normalized category name
category_totals: dict = {}
total_fees = 0
for entry_type, total, count in rows:
    abs_total = abs(total or 0)
    total_fees += abs_total
    normalized = self.FEE_CATEGORY_MAP.get(entry_type, "other")
    if normalized in category_totals:
        category_totals[normalized]["amount"] += abs_total
        category_totals[normalized]["count"] += count
    else:
        category_totals[normalized] = {
            "category": normalized,
            "amount": abs_total,
            "count": count,
        }
categories = sorted(
    category_totals.values(),
    key=lambda c: c["amount"],
    reverse=True,
)
```

## Do NOT touch anything else in this file.

## After the fix:

```powershell
# Restart API
docker compose restart api

# Clear Redis cache
docker compose exec redis redis-cli FLUSHDB
```

## Expected result

The fee breakdown endpoint should now return:
```json
{
  "categories": [
    {"category": "transaction_fee", "amount": 4661, "count": 4},
    {"category": "processing_fee", "amount": 4259, "count": 4},
    {"category": "listing_renewal", "amount": 1672, "count": 26},
    {"category": "deposit_fee", "amount": 2100, "count": 3}
  ]
}
```

The frontend filter for `['transaction_fee', 'processing_fee',
'listing_renewal', 'subscription']` will now find matches and display
the fee breakdown correctly instead of "No fee data for this period."
