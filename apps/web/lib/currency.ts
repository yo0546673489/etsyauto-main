/**
 * Currency formatting and conversion display helpers
 */

/** Format cents as currency string using Intl.NumberFormat */
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Format dollars (already divided) as currency string */
export function formatAmount(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Get display value for a monetary amount - prefers converted when available */
export function getDisplayAmount(
  amount: number,
  currency: string,
  convertedAmount?: number | null,
  convertedCurrency?: string | null
): { value: number; currency: string; isConverted: boolean } {
  if (convertedAmount != null && convertedCurrency) {
    return { value: convertedAmount, currency: convertedCurrency, isConverted: true };
  }
  return { value: amount, currency, isConverted: false };
}

/** Format for display - shows converted as primary with original as secondary when applicable */
export function formatWithConversion(
  amount: number,
  currency: string,
  convertedAmount?: number | null,
  convertedCurrency?: string | null,
  rateStale?: boolean
): { primary: string; secondary?: string; stale?: boolean } {
  if (convertedAmount != null && convertedCurrency && convertedCurrency !== currency) {
    return {
      primary: formatAmount(convertedAmount, convertedCurrency),
      secondary: `${formatAmount(amount, currency)} (original)`,
      stale: rateStale ?? false,
    };
  }
  return { primary: formatAmount(amount, currency) };
}
