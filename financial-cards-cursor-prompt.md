# Cursor Prompt: Three Financial Summary Cards — Finances Page

## Overview

You are making a **single, focused change** to one file:
`apps/web/app/financials/page.tsx`

You will replace the existing single "Upcoming Payout" card with **three clickable summary cards** in a horizontal row. Each card opens a right-side drawer with a detailed breakdown. Nothing else changes.

---

## Strict Boundaries

- **Only edit:** `apps/web/app/financials/page.tsx`
- **Do not create** any new files, routes, components, or API functions
- **Do not modify** any other file (`api.ts`, `currency-context.tsx`, layout, sidebar, etc.)
- **Do not remove** any existing functionality, state, or UI below the cards
- **Do not add** any new npm packages
- **Do not change** the `fetchAll` function, data fetching logic, or any existing state variables

---

## Context: What Already Exists

### Data already fetched and available in state

The `fetchAll()` function already fetches everything needed. These state variables are already populated:

```ts
const [payout, setPayout] = useState<PayoutEstimate | null>(null);
// payout.available_for_payout      — upcoming payout amount (cents)
// payout.current_balance           — current balance (cents)
// payout.reserve_held              — reserve held (cents)
// payout.converted_available_for_payout  — converted amount (cents), may be null
// payout.converted_current_balance       — converted amount (cents), may be null
// payout.converted_reserve_held          — converted amount (cents), may be null
// payout.converted_currency              — e.g. "USD", "EUR"
// payout.currency                        — shop's native currency e.g. "ILS"
// payout.recent_payouts                  — array of { amount, date }
// payout.as_of                           — ISO timestamp

const [summary, setSummary] = useState<FinancialSummary | null>(null);
// summary.net_profit                     — net profit (cents)
// summary.converted_net_profit           — converted net profit (cents), may be null
// summary.converted_currency             — user's preferred currency code
// summary.currency                       — shop's native currency
// summary.revenue                        — gross revenue (cents)
// summary.converted_revenue             — converted gross revenue (cents)
// summary.etsy_fees                      — total fees (cents)
// summary.converted_etsy_fees           — converted fees (cents)
// summary.advertising_expenses           — marketing spend (cents)
// summary.converted_advertising_expenses — converted (cents)
// summary.refunds                        — total refunds (cents)
// summary.converted_refunds             — converted (cents)
// summary.total_expenses                 — all expenses (cents)
// summary.converted_total_expenses      — converted (cents)
```

### Currency display

The page already has:
```ts
const { currency: displayCurrency } = useCurrency();
// displayCurrency — the user's preferred currency code from localStorage + CurrencyContext
```

### Formatting helpers already defined in the file

```ts
// Use this for all monetary display — it uses converted amounts when available:
formatWithConversion(amount, currency, convertedAmount?, convertedCurrency?)

// Use this only when no conversion is needed:
formatCents(cents, currency)
```

**Always use `formatWithConversion` for card values.** For payout and balance use `payout.*` fields. For net profit use `summary.*` fields.

---

## What to Build

### Step 1 — Replace the existing Upcoming Payout card

Find this block in the JSX (around line 600+):

```tsx
{/* ── Upcoming Payout (prominent card) ── */}
{payout && payout.available_for_payout !== undefined && (
  <div className="rounded-xl border-2 border-emerald-200 ...">
    ...
  </div>
)}
```

**Replace it entirely** with the new `<FinancialSummaryCards />` component defined below.

---

### Step 2 — Add state for the drawer

Add these two state variables alongside the existing state declarations (around line 110, near `const [showEntryTypesModal, ...]`):

```ts
const [activeDrawer, setActiveDrawer] = useState<'payout' | 'balance' | 'profit' | null>(null);
```

That is the only new state needed.

---

### Step 3 — Define the three components inside the file

Add all three components **inside `financials/page.tsx`**, above the `FinancialComparisonPanel` component. Do not create separate files.

---

#### Component A: `FinancialSummaryCards`

This renders the three-card row. It receives props from the page's existing state.

```tsx
function FinancialSummaryCards({
  payout,
  summary,
  loading,
  onCardClick,
}: {
  payout: PayoutEstimate | null;
  summary: FinancialSummary | null;
  loading: boolean;
  onCardClick: (drawer: 'payout' | 'balance' | 'profit') => void;
}) {
  // Skeleton card shown while loading
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm animate-pulse">
            <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
            <div className="h-8 w-36 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Card 1 — Upcoming Payout
  const payoutValue = payout
    ? formatWithConversion(
        payout.available_for_payout,
        payout.currency,
        payout.converted_available_for_payout,
        payout.converted_currency
      )
    : '—';
  const payoutPositive = payout ? payout.available_for_payout >= 0 : true;

  // Card 2 — Current Balance
  const balanceValue = payout
    ? formatWithConversion(
        payout.current_balance,
        payout.currency,
        payout.converted_current_balance,
        payout.converted_currency
      )
    : '—';
  const balancePositive = payout ? payout.current_balance >= 0 : true;

  // Card 3 — Net Profit
  const profitValue = summary
    ? formatWithConversion(
        summary.net_profit,
        summary.currency,
        summary.converted_net_profit,
        summary.converted_currency
      )
    : '—';
  const profitPositive = summary ? summary.net_profit >= 0 : undefined;

  const cards: {
    id: 'payout' | 'balance' | 'profit';
    title: string;
    value: string;
    subtitle: string;
    positive: boolean | undefined;
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
  }[] = [
    {
      id: 'payout',
      title: 'Upcoming Payout',
      value: payoutValue,
      subtitle: 'Available for payout',
      positive: payoutPositive,
      icon: Banknote,
      accentClass: 'border-emerald-200 dark:border-emerald-800',
    },
    {
      id: 'balance',
      title: 'Current Balance',
      value: balanceValue,
      subtitle: payout?.reserve_held
        ? `Reserve held: ${formatWithConversion(payout.reserve_held, payout.currency, payout.converted_reserve_held, payout.converted_currency)}`
        : 'Etsy Payments wallet',
      positive: balancePositive,
      icon: Wallet,
      accentClass: 'border-blue-200 dark:border-blue-800',
    },
    {
      id: 'profit',
      title: 'Net Profit',
      value: profitValue,
      subtitle: 'After all fees & refunds',
      positive: profitPositive,
      icon: profitPositive !== false ? TrendingUp : TrendingDown,
      accentClass:
        profitPositive === false
          ? 'border-red-200 dark:border-red-800'
          : 'border-purple-200 dark:border-purple-800',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onCardClick(card.id)}
          className={cn(
            'rounded-xl border-2 bg-white dark:bg-gray-900 p-5 shadow-sm text-left',
            'hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500',
            card.accentClass
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {card.title}
            </span>
            <card.icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
          <p
            className={cn(
              'text-2xl font-bold tracking-tight',
              card.positive === true && 'text-emerald-600 dark:text-emerald-400',
              card.positive === false && 'text-red-600 dark:text-red-400',
              card.positive === undefined && 'text-gray-900 dark:text-gray-100'
            )}
          >
            {card.value}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            {card.subtitle}
            <ArrowUpRight className="w-3 h-3 opacity-50" />
          </p>
        </button>
      ))}
    </div>
  );
}
```

---

#### Component B: `FinancialDrawer`

This is the slide-in drawer. It receives the active drawer type and the already-fetched data.

```tsx
function FinancialDrawer({
  drawer,
  payout,
  summary,
  period,
  onClose,
}: {
  drawer: 'payout' | 'balance' | 'profit' | null;
  payout: PayoutEstimate | null;
  summary: FinancialSummary | null;
  period: string; // e.g. "Last 30 days"
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!drawer) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white dark:bg-gray-900',
          'border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50',
          'flex flex-col overflow-hidden',
          'translate-x-0 transition-transform duration-300'
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {drawer === 'payout' && 'Upcoming Payout'}
            {drawer === 'balance' && 'Current Balance'}
            {drawer === 'profit' && `Net Profit — ${period}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            aria-label="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── PAYOUT DRAWER ── */}
          {drawer === 'payout' && payout && (
            <>
              {/* Primary value */}
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-5">
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium mb-1">
                  Available for Payout
                </p>
                <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                  {formatWithConversion(
                    payout.available_for_payout,
                    payout.currency,
                    payout.converted_available_for_payout,
                    payout.converted_currency
                  )}
                </p>
              </div>

              {/* Breakdown rows */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {[
                  {
                    label: 'Current Balance',
                    value: formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency),
                    note: 'Total in your Etsy Payments account',
                  },
                  {
                    label: 'Reserve Held',
                    value: formatWithConversion(payout.reserve_held, payout.currency, payout.converted_reserve_held, payout.converted_currency),
                    note: 'Funds temporarily withheld by Etsy',
                    valueClass: payout.reserve_held > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
                  },
                  {
                    label: 'Available for Payout',
                    value: formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency),
                    note: 'Next scheduled disbursement',
                    valueClass: 'text-emerald-600 dark:text-emerald-400 font-bold',
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between px-4 py-3',
                      i > 0 && 'border-t border-gray-100 dark:border-gray-800'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</p>
                      {row.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</p>}
                    </div>
                    <p className={cn('text-sm font-semibold', row.valueClass ?? 'text-gray-900 dark:text-gray-100')}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Recent payouts */}
              {payout.recent_payouts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                    Recent Payouts
                  </p>
                  <div className="space-y-2">
                    {payout.recent_payouts.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5"
                      >
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {shortDate(p.date)}
                        </span>
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {formatCents(p.amount, payout.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                Etsy disburses available funds on your configured payout schedule (daily or weekly). Reserve-held funds are released automatically once eligibility criteria are met.
              </p>
            </>
          )}

          {/* ── BALANCE DRAWER ── */}
          {drawer === 'balance' && payout && (
            <>
              {/* Primary value */}
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-5">
                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium mb-1">
                  Current Balance
                </p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                  {formatWithConversion(
                    payout.current_balance,
                    payout.currency,
                    payout.converted_current_balance,
                    payout.converted_currency
                  )}
                </p>
                {payout.as_of && (
                  <p className="text-xs text-blue-500 dark:text-blue-500 mt-1">
                    As of {shortDate(payout.as_of)}
                  </p>
                )}
              </div>

              {/* Balance breakdown */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {[
                  {
                    label: 'Available for Payout',
                    value: formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency),
                    note: 'Ready to be disbursed',
                    valueClass: 'text-emerald-600 dark:text-emerald-400',
                  },
                  {
                    label: 'Reserve Held',
                    value: formatWithConversion(payout.reserve_held, payout.currency, payout.converted_reserve_held, payout.converted_currency),
                    note: 'Temporarily withheld by Etsy',
                    valueClass: payout.reserve_held > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
                  },
                  {
                    label: 'Total Balance',
                    value: formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency),
                    note: 'Available + Reserve',
                    valueClass: 'font-bold text-gray-900 dark:text-gray-100',
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between px-4 py-3',
                      i > 0 && 'border-t border-gray-100 dark:border-gray-800',
                      i === 2 && 'bg-gray-50 dark:bg-gray-800/50'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</p>
                      {row.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</p>}
                    </div>
                    <p className={cn('text-sm font-semibold', row.valueClass ?? 'text-gray-900 dark:text-gray-100')}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                <strong className="text-gray-500">Pending</strong> means funds from recent sales that haven't cleared yet — typically 3–7 days after the sale. They're included in your balance but not yet available for payout.
              </p>
            </>
          )}

          {/* ── NET PROFIT DRAWER ── */}
          {drawer === 'profit' && summary && (
            <>
              {/* Primary value */}
              <div
                className={cn(
                  'rounded-xl p-5 border',
                  summary.net_profit >= 0
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                )}
              >
                <p
                  className={cn(
                    'text-sm font-medium mb-1',
                    summary.net_profit >= 0
                      ? 'text-purple-700 dark:text-purple-400'
                      : 'text-red-700 dark:text-red-400'
                  )}
                >
                  Net Profit — {period}
                </p>
                <p
                  className={cn(
                    'text-3xl font-bold',
                    summary.net_profit >= 0
                      ? 'text-purple-700 dark:text-purple-300'
                      : 'text-red-700 dark:text-red-300'
                  )}
                >
                  {formatWithConversion(
                    summary.net_profit,
                    summary.currency,
                    summary.converted_net_profit,
                    summary.converted_currency
                  )}
                </p>
              </div>

              {/* P&L breakdown rows */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {[
                  {
                    label: 'Gross Revenue',
                    value: formatWithConversion(summary.revenue, summary.currency, summary.converted_revenue, summary.converted_currency),
                    valueClass: 'text-emerald-600 dark:text-emerald-400',
                    note: 'Sales + shipping collected',
                  },
                  {
                    label: 'Etsy Fees',
                    value: `−${formatWithConversion(summary.etsy_fees, summary.currency, summary.converted_etsy_fees, summary.converted_currency)}`,
                    valueClass: 'text-red-500',
                    note: 'Transaction, processing, listing fees',
                  },
                  {
                    label: 'Marketing Spend',
                    value: `−${formatWithConversion(summary.advertising_expenses, summary.currency, summary.converted_advertising_expenses, summary.converted_currency)}`,
                    valueClass: 'text-red-500',
                    note: 'Etsy Ads + Offsite Ads',
                  },
                  {
                    label: 'Refunds',
                    value: summary.refunds > 0
                      ? `−${formatWithConversion(summary.refunds, summary.currency, summary.converted_refunds, summary.converted_currency)}`
                      : '—',
                    valueClass: summary.refunds > 0 ? 'text-red-500' : 'text-gray-400',
                    note: 'Orders refunded to buyers',
                  },
                  {
                    label: 'Net Profit',
                    value: formatWithConversion(summary.net_profit, summary.currency, summary.converted_net_profit, summary.converted_currency),
                    valueClass: summary.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold',
                    note: 'Revenue minus all costs',
                    highlight: true,
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between px-4 py-3',
                      i > 0 && 'border-t border-gray-100 dark:border-gray-800',
                      row.highlight && 'bg-gray-50 dark:bg-gray-800/50'
                    )}
                  >
                    <div>
                      <p className={cn('text-sm font-medium', row.highlight ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-700 dark:text-gray-300')}>
                        {row.label}
                      </p>
                      {row.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</p>}
                    </div>
                    <p className={cn('text-sm', row.valueClass ?? 'text-gray-900 dark:text-gray-100')}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Visual proportion bar */}
              {summary.revenue > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                    Revenue Breakdown
                  </p>
                  <div className="w-full h-3 rounded-full overflow-hidden flex">
                    {[
                      {
                        pct: Math.max(0, (summary.net_profit / summary.revenue) * 100),
                        cls: 'bg-emerald-400',
                        label: 'Profit',
                      },
                      {
                        pct: (summary.etsy_fees / summary.revenue) * 100,
                        cls: 'bg-purple-400',
                        label: 'Fees',
                      },
                      {
                        pct: (summary.advertising_expenses / summary.revenue) * 100,
                        cls: 'bg-pink-400',
                        label: 'Ads',
                      },
                      {
                        pct: (summary.refunds / summary.revenue) * 100,
                        cls: 'bg-red-400',
                        label: 'Refunds',
                      },
                    ].map((seg) => (
                      <div
                        key={seg.label}
                        className={cn('h-full transition-all duration-500', seg.cls)}
                        style={{ width: `${Math.max(0, Math.min(100, seg.pct))}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {[
                      { label: 'Profit', cls: 'bg-emerald-400' },
                      { label: 'Fees', cls: 'bg-purple-400' },
                      { label: 'Ads', cls: 'bg-pink-400' },
                      { label: 'Refunds', cls: 'bg-red-400' },
                    ].map((item) => (
                      <span key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', item.cls)} />
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
```

---

### Step 4 — Wire it up in `FinancialsPage`

#### 4a — Add the drawer state (already specified above):
```ts
const [activeDrawer, setActiveDrawer] = useState<'payout' | 'balance' | 'profit' | null>(null);
```

#### 4b — Replace the existing Upcoming Payout card JSX block with:
```tsx
{/* ── Financial Summary Cards ── */}
<FinancialSummaryCards
  payout={payout}
  summary={summary}
  loading={loading && !payout}
  onCardClick={(drawer) => setActiveDrawer(drawer)}
/>

{/* ── Financial Detail Drawer ── */}
<FinancialDrawer
  drawer={activeDrawer}
  payout={payout}
  summary={summary}
  period={periodToLabel(period)}
  onClose={() => setActiveDrawer(null)}
/>
```

That is the complete change to the page's JSX. Nothing else in the JSX changes.

---

## Verification Checklist

Before finishing, verify each of these manually:

- [ ] Three cards render side by side in a 3-column grid on desktop
- [ ] On mobile (< 640px) cards stack vertically (1 column) — this is handled by `sm:grid-cols-3`
- [ ] Each card shows a loading skeleton while `loading && !payout` is true
- [ ] Clicking "Upcoming Payout" card opens the payout drawer
- [ ] Clicking "Current Balance" card opens the balance drawer
- [ ] Clicking "Net Profit" card opens the profit drawer
- [ ] Pressing Escape closes the drawer
- [ ] Clicking the backdrop closes the drawer
- [ ] The drawer slides in from the right (it uses `fixed right-0`)
- [ ] Currency values use `formatWithConversion()` — they display in the user's preferred currency when a converted value is available, falling back to the shop's native currency otherwise
- [ ] The existing "Activity summary" section, payout bar, fee breakdown, ledger, and all other sections below are completely unchanged
- [ ] No TypeScript errors — all types come from the already-imported `PayoutEstimate` and `FinancialSummary` interfaces
- [ ] `XCircle`, `Banknote`, `Wallet`, `TrendingUp`, `TrendingDown`, `ArrowUpRight` are already imported in the file — do not add duplicate imports
