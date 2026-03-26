# Cursor Prompt: Fix Ledger Entry Description Labels

## Problem

The finances page ledger table shows raw Etsy API field names as descriptions:
`PAYMENT_GROSS`, `PAYMENT_PROCESSING_FEE`, `DISBURSE2`, `prolist`,
`offsite_ads_fee`, `renew_sold_auto`, `listing`, `transaction` etc.

These need to be mapped to human-readable labels.

## Fix — `apps/web/app/financials/page.tsx`

Find the `entryTypeLabel` function:

```typescript
function entryTypeLabel(t: string): string {
  const map: Record<string, string> = {
    advertising: 'Advertising',
    shipping_label: 'Shipping Label',
    subscription: 'Subscription',
    ...
  };
```

Expand the map to include ALL raw Etsy entry_type values. Replace the
entire map inside `entryTypeLabel` with:

```typescript
const map: Record<string, string> = {
  // Normalized categories (already mapped)
  sale:                        'Sale',
  refund:                      'Refund',
  fee:                         'Fee',
  advertising:                 'Advertising',
  shipping_label:              'Shipping Label',
  subscription:                'Subscription',
  processing_fee:              'Processing Fee',
  transaction_fee:             'Transaction Fee',
  listing_fee:                 'Listing Fee',
  offsite_ads:                 'Offsite Ads',
  vat_fee:                     'VAT Fee',
  other:                       'Other',

  // Raw Etsy payment/revenue types
  PAYMENT_GROSS:               'Payment Received',
  payment_gross:               'Payment Received',
  PAYMENT:                     'Payment',
  payment:                     'Payment',
  DEPOSIT:                     'Deposit',
  deposit:                     'Deposit',
  DISBURSE:                    'Payout',
  DISBURSE2:                   'Payout',
  disburse:                    'Payout',
  payout:                      'Payout',
  Payout:                      'Payout',

  // Raw Etsy fee types
  PAYMENT_PROCESSING_FEE:      'Processing Fee',
  payment_processing_fee:      'Processing Fee',
  transaction:                 'Transaction Fee',
  TRANSACTION:                 'Transaction Fee',
  transaction_fee:             'Transaction Fee',
  listing:                     'Listing Fee',
  LISTING:                     'Listing Fee',
  prolist:                     'Promoted Listing',
  PROLIST:                     'Promoted Listing',
  offsite_ads_fee:             'Offsite Ads Fee',
  OFFSITE_ADS_FEE:             'Offsite Ads Fee',
  DEPOSIT_FEE:                 'Deposit Fee',
  deposit_fee:                 'Deposit Fee',

  // Renewal types
  renew_sold_auto:             'Auto Renewal (Sold)',
  renew_sold:                  'Renewal (Sold)',
  renew_expired:               'Renewal (Expired)',
  RENEW_SOLD_AUTO:             'Auto Renewal (Sold)',
  RENEW_SOLD:                  'Renewal (Sold)',
  RENEW_EXPIRED:               'Renewal (Expired)',

  // Refund types
  REFUND:                      'Refund',
  REVERSAL:                    'Reversal',
  reversal:                    'Reversal',
  CASE_REFUND:                 'Case Refund',
  case_refund:                 'Case Refund',

  // Tax types
  vat_tax_ep:                  'VAT Tax',
  VAT_TAX_EP:                  'VAT Tax',
  TAX:                         'Tax',
  tax:                         'Tax',

  // Shipping
  shipping_label:              'Shipping Label',
  SHIPPING_LABEL:              'Shipping Label',
  postage:                     'Postage',
  POSTAGE:                     'Postage',

  // Subscription / onboarding
  seller_onboarding_fee:        'Subscription Fee',
  seller_onboarding_fee_payment: 'Subscription Payment',
  SUBSCRIPTION:                'Subscription',

  // Reserve
  reserve:                     'Reserve',
  Reserve:                     'Reserve',
  RESERVE:                     'Reserve',
};
```

Then at the end of the function, add a fallback that title-cases unknown values:

```typescript
  if (map[t]) return map[t];
  // Fallback: convert snake_case/UPPER_CASE to Title Case
  return t
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
```

So the full function becomes:

```typescript
function entryTypeLabel(t: string): string {
  const map: Record<string, string> = {
    // ... all entries above ...
  };
  if (map[t]) return map[t];
  return t
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
```

---

## Also fix the description column in the ledger table

Find where the ledger table rows are rendered. Look for where `description`
or `entry_type` is displayed in a `<td>` or table cell. It likely looks like:

```tsx
<td>{entry.description}</td>
// or
<td>{entry.entry_type}</td>
```

Replace with:

```tsx
<td>{entryTypeLabel(entry.description || entry.entry_type || '')}</td>
```

This ensures the human-readable label is shown instead of the raw value.

---

## Also fix the Fee Breakdown section

In the Fee Breakdown card, the category labels like `deposit_fee` are shown
raw. Find where fee category names are rendered and wrap them with
`entryTypeLabel()` as well.

---

## Do NOT change

- Any backend files
- The `ENTRY_TYPE_TRANSLATION_KEYS` map (used for i18n, keep as-is)
- Any API calls or data fetching logic

---

## After changes

Since web is in production mode, rebuild:
```powershell
docker compose build --no-cache web && docker compose up -d web
```
