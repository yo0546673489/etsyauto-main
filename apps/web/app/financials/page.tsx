'use client';

/**
 * Financial Analytics Page
 * Displays P&L summary, payout estimate, fee breakdown chart,
 * revenue timeline, and a searchable ledger table.
 *
 * Owner / Admin / Viewer only (via require_revenue_access on backend).
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import { useShop } from '@/lib/shop-context';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';
import { useCurrency } from '@/lib/currency-context';
import { DisconnectedShopBanner } from '@/components/ui/DisconnectedShopBanner';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import {
  financialsApi,
  invoicesApi,
  shopsApi,
  type ProfitAndLoss,
  type PayoutEstimate,
  type FeeBreakdown,
  type RevenueTimeline,
  type LedgerResponse,
  type LedgerEntryData,
  type BillingScopeStatus,
  type FinancialSummary,
  type Invoice,
  type InvoiceListResponse,
  type SyncStatusResponse,
  type DiscountSummary,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  CheckCircle,
  Download,
  Filter,
  PieChart,
  BarChart3,
  Receipt,
  Banknote,
  ShieldAlert,
  Tag,
  Megaphone,
  Truck,
  CreditCard,
  RotateCcw,
  Package,
  FileUp,
  Percent,
  Clock,
  XCircle,
} from 'lucide-react';

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/** Convert cents to formatted dollar string */
function formatCents(cents: number, currency = 'USD'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return cents < 0 ? `-${formatted}` : formatted;
}

/** Format amount, using converted value when available */
function formatWithConversion(
  amount: number,
  currency: string,
  convertedAmount?: number | null,
  convertedCurrency?: string | null
): string {
  const amt = convertedAmount != null && convertedCurrency ? convertedAmount : amount;
  const ccy = convertedAmount != null && convertedCurrency ? convertedCurrency : currency;
  return formatCents(amt, ccy);
}

/** Short date display */
function shortDate(iso: string | null, locale = 'en-US'): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Build ISO date string from days-ago count */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Human-readable "X minutes ago" from ISO timestamp */
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  return `${diffDays} days ago`;
}

/** Pretty entry type label (English fallback) */
function entryTypeLabel(t: string): string {
  const map: Record<string, string> = {
    // Normalized categories
    sale: 'Sale',
    refund: 'Refund',
    fee: 'Fee',
    advertising: 'Advertising',
    shipping_label: 'Shipping Label',
    subscription: 'Subscription',
    processing_fee: 'Processing Fee',
    transaction_fee: 'Transaction Fee',
    listing_fee: 'Listing Fee',
    offsite_ads: 'Offsite Ads',
    vat_fee: 'VAT Fee',
    other: 'Other',

    // Raw Etsy payment/revenue types
    PAYMENT_GROSS: 'Payment Received',
    payment_gross: 'Payment Received',
    PAYMENT: 'Payment',
    payment: 'Payment',
    DEPOSIT: 'Deposit',
    deposit: 'Deposit',
    DISBURSE: 'Payout',
    DISBURSE2: 'Payout',
    disburse: 'Payout',
    payout: 'Payout',
    Payout: 'Payout',

    // Raw Etsy fee types
    PAYMENT_PROCESSING_FEE: 'Processing Fee',
    payment_processing_fee: 'Processing Fee',
    transaction: 'Transaction Fee',
    TRANSACTION: 'Transaction Fee',
    listing: 'Listing Fee',
    LISTING: 'Listing Fee',
    prolist: 'Promoted Listing',
    PROLIST: 'Promoted Listing',
    offsite_ads_fee: 'Offsite Ads Fee',
    OFFSITE_ADS_FEE: 'Offsite Ads Fee',
    DEPOSIT_FEE: 'Deposit Fee',
    deposit_fee: 'Deposit Fee',

    // Renewal types
    renew_sold_auto: 'Auto Renewal (Sold)',
    renew_sold: 'Renewal (Sold)',
    renew_expired: 'Renewal (Expired)',
    RENEW_SOLD_AUTO: 'Auto Renewal (Sold)',
    RENEW_SOLD: 'Renewal (Sold)',
    RENEW_EXPIRED: 'Renewal (Expired)',

    // Refund types
    REFUND: 'Refund',
    REVERSAL: 'Reversal',
    reversal: 'Reversal',
    CASE_REFUND: 'Case Refund',
    case_refund: 'Case Refund',

    // Tax types
    vat_tax_ep: 'VAT Tax',
    VAT_TAX_EP: 'VAT Tax',
    TAX: 'Tax',
    tax: 'Tax',

    // Shipping
    SHIPPING_LABEL: 'Shipping Label',
    postage: 'Postage',
    POSTAGE: 'Postage',

    // Subscription / onboarding
    seller_onboarding_fee: 'Subscription Fee',
    seller_onboarding_fee_payment: 'Subscription Payment',
    SUBSCRIPTION: 'Subscription',
    listing_renewal: 'Listing Renewal',

    // Reserve
    reserve: 'Reserve',
    Reserve: 'Reserve',
    RESERVE: 'Reserve',
  };
  if (map[t]) return map[t];
  // Fallback: convert snake_case/UPPER_CASE to Title Case
  return t
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Translation key map for entry types */
const ENTRY_TYPE_TRANSLATION_KEYS: Record<string, string> = {
  sale: 'financials.entryTypes.sale',
  refund: 'financials.entryTypes.refund',
  reserve: 'financials.entryTypes.reserve',
  payout: 'financials.entryTypes.payout',
  listing_renewal: 'financials.entryTypes.listingRenewal',
  transaction_fee: 'financials.entryTypes.transactionFee',
  processing_fee: 'financials.entryTypes.processingFee',
  advertising: 'financials.entryTypes.advertising',
  shipping_label: 'financials.entryTypes.shippingLabel',
  subscription: 'financials.entryTypes.subscription',
  tax: 'financials.entryTypes.tax',
  other: 'financials.entryTypes.other',
};

/** Icon for fee category */
function feeIcon(category: string) {
  const icons: Record<string, React.ReactNode> = {
    transaction_fee: <CreditCard className="w-4 h-4" />,
    processing_fee: <Receipt className="w-4 h-4" />,
    listing_renewal: <Tag className="w-4 h-4" />,
    advertising: <Megaphone className="w-4 h-4" />,
    shipping_label: <Truck className="w-4 h-4" />,
    subscription: <Wallet className="w-4 h-4" />,
  };
  return icons[category] || <DollarSign className="w-4 h-4" />;
}

/** Colour for entry type badge */
function entryTypeBadgeClasses(t: string): string {
  const map: Record<string, string> = {
    sale: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    refund: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    payout: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    reserve: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    transaction_fee: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    processing_fee: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    listing_renewal: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    advertising: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
    shipping_label: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    subscription: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    tax: 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300',
  };
  return map[t] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300';
}

/* ================================================================== */
/*  Period selector                                                    */
/* ================================================================== */

type Period = '1m' | '3m' | '6m' | '12m' | 'ytd' | 'lastyear' | 'custom';

const PERIOD_OPTIONS: Period[] = ['1m', '3m', '6m', '12m', 'ytd', 'lastyear', 'custom'];
const PERIOD_STORAGE_KEY = 'financials-period';

function loadPersistedPeriod(): Period {
  if (typeof window === 'undefined') return '3m';
  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (stored && PERIOD_OPTIONS.includes(stored as Period)) return stored as Period;
  } catch {
    /* ignore */
  }
  return '3m';
}

function persistPeriod(p: Period): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PERIOD_STORAGE_KEY, p);
  } catch {
    /* ignore */
  }
}

/** Calculate calendar-month boundaries exactly like Etsy */
function periodToDates(p: Period, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  if (p === 'custom') {
    return {
      start: customStart ? new Date(customStart).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      end: customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : now.toISOString(),
    };
  }
  if (p === 'ytd') {
    return {
      start: new Date(now.getFullYear(), 0, 1).toISOString(),
      end: now.toISOString(),
    };
  }
  if (p === 'lastyear') {
    const y = now.getFullYear() - 1;
    return {
      start: new Date(y, 0, 1).toISOString(),
      end: new Date(y, 11, 31, 23, 59, 59, 999).toISOString(),
    };
  }
  if (p === '1m') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: now.toISOString() };
  }
  const monthsBack: Record<string, number> = { '3m': 3, '6m': 6, '12m': 12 };
  const months = monthsBack[p] ?? 3;
  const start = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Human-readable period label */
function periodToLabel(p: Period, customStart?: string, customEnd?: string, t?: (key: string) => string, locale = 'en-US'): string {
  if (p === 'custom' && customStart && customEnd) {
    const fmt = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(customStart)} – ${fmt(customEnd)}`;
  }
  if (t) {
    const keyMap: Record<Period, string> = {
      '1m': 'financials.period.1m',
      '3m': 'financials.period.3m',
      '6m': 'financials.period.6m',
      '12m': 'financials.period.12m',
      'ytd': 'financials.period.ytd',
      'lastyear': 'financials.period.lastyear',
      'custom': 'financials.period.custom',
    };
    return t(keyMap[p]) || p;
  }
  const labels: Record<Period, string> = {
    '1m':       'This Month',
    '3m':       'Last 3 Months',
    '6m':       'Last 6 Months',
    '12m':      'Last 12 Months',
    'ytd':      'This Year',
    'lastyear': 'Last Year',
    'custom':   'Custom',
  };
  return labels[p] ?? p;
}

function periodToGranularity(p: Period): string {
  if (p === '1m') return 'daily';
  if (p === '3m' || p === '6m') return 'weekly';
  return 'monthly';
}

/* ================================================================== */
/*  Expandable category card (Etsy-style)                              */
/* ================================================================== */

function ExpandableCard({
  title,
  totalValue,
  totalPositive,
  icon: Icon,
  children,
  defaultExpanded = false,
}: {
  title: string;
  totalValue: string;
  totalPositive: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0',
            totalPositive ? 'bg-green-50' : 'bg-red-50'
          )}>
            <Icon className={cn('w-5 h-5', totalPositive ? 'text-[#006d43]' : 'text-red-500')} />
          </div>
          <span className="font-black text-gray-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xl font-black',
              totalPositive ? 'text-[#006d43]' : 'text-red-500'
            )}
            dir="ltr"
          >
            {totalValue}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/40">
          {children}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Entry Types Registry Modal                                          */
/* ================================================================== */

const REGISTRY_CATEGORIES = ['sales', 'fees', 'marketing', 'refunds', 'adjustments', 'other'] as const;

function EntryTypesModal({
  onClose,
  onSaved,
  t,
}: {
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const { showToast } = useToast();
  const [entryTypes, setEntryTypes] = useState<Array<{ entry_type: string; category: string | null; mapped: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    financialsApi
      .getEntryTypes()
      .then((data) => {
        setEntryTypes(data.entry_types);
        const initial: Record<string, string> = {};
        data.entry_types.filter((r) => !r.mapped).forEach((r) => {
          initial[r.entry_type] = r.category || 'other';
        });
        setSelections(initial);
      })
      .catch(() => showToast(t('financials.loadFailed'), 'error'))
      .finally(() => setLoading(false));
  }, [t, showToast]);

  const unmapped = entryTypes.filter((r) => !r.mapped);

  const handleSave = async (entryType: string) => {
    const category = selections[entryType] || 'other';
    setSaving(entryType);
    try {
      await financialsApi.updateEntryTypeMapping(entryType, category);
      showToast(t('financials.mappingSaved'), 'success');
      setEntryTypes((prev) =>
        prev.map((r) => (r.entry_type === entryType ? { ...r, category, mapped: true } : r))
      );
      setSelections((prev) => {
        const next = { ...prev };
        delete next[entryType];
        return next;
      });
      if (unmapped.length <= 1) onSaved();
    } catch {
      showToast(t('financials.loadFailed'), 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b dark:border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('financials.entryTypesModalTitle')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('financials.entryTypesModalDescription')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : unmapped.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                {t('financials.allTypesMapped') || 'All entry types are mapped.'}
              </p>
            ) : (
              <div className="space-y-4">
                {unmapped.map((r) => (
                  <div
                    key={r.entry_type}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 truncate">
                      {r.entry_type}
                    </span>
                    <select
                      value={selections[r.entry_type] || 'other'}
                      onChange={(e) =>
                        setSelections((prev) => ({ ...prev, [r.entry_type]: e.target.value }))
                      }
                      className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 min-w-[140px]"
                    >
                      {REGISTRY_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {t(`financials.registryCategory.${cat}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSave(r.entry_type)}
                      disabled={saving === r.entry_type}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {saving === r.entry_type ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : null}
                      {t('financials.saveMapping')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {t('common.close') || 'Close'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  Reusable mini-components                                           */
/* ================================================================== */

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  positive,
  className,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  positive?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('bg-white rounded-2xl px-6 pt-5 pb-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80', className)}>
      <div className="flex items-center justify-between mb-5">
        <span className={cn('text-sm font-semibold', positive === false ? 'text-red-400' : positive === true ? 'text-[#006d43]' : 'text-gray-400')}>{subtitle || ''}</span>
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0', positive === false ? 'bg-red-50' : 'bg-green-50')}>
          <Icon className={cn('w-[22px] h-[22px]', positive === false ? 'text-red-500' : 'text-[#006d43]')} strokeWidth={1.8} />
        </div>
      </div>
      <p className="text-sm text-gray-400 text-center mb-1.5">{title}</p>
      <p className={cn('text-[28px] leading-tight font-black text-center', positive === false ? 'text-red-500' : 'text-gray-800')} dir="ltr">{value}</p>
    </div>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-black text-gray-800">{title}</h2>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Financial Summary Cards & Drawer                                    */
/* ================================================================== */

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
  const { t } = useLanguage();
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-2xl px-6 pt-5 pb-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 animate-pulse">
            <div className="flex items-center justify-between mb-5">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="w-12 h-12 rounded-full bg-gray-100" />
            </div>
            <div className="h-4 w-24 bg-gray-100 rounded mx-auto mb-2" />
            <div className="h-8 w-32 bg-gray-200 rounded mx-auto" />
          </div>
        ))}
      </div>
    );
  }

  const payoutValue = payout
    ? formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency)
    : '—';
  const payoutPositive = payout ? payout.available_for_payout >= 0 : true;

  const balanceValue = payout
    ? formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency)
    : '—';
  const balancePositive = payout ? payout.current_balance >= 0 : true;

  const profitValue = summary
    ? formatWithConversion(summary.net_profit, summary.currency, summary.converted_net_profit, summary.converted_currency)
    : '—';
  const profitPositive = summary ? summary.net_profit >= 0 : undefined;

  const cards = [
    {
      id: 'profit' as const,
      badge: profitPositive === false ? t('financials.loss') : t('financials.profitable'),
      badgeColor: profitPositive === false ? 'text-red-500' : 'text-[#006d43]',
      icon: profitPositive !== false ? TrendingUp : TrendingDown,
      iconBg: profitPositive === false ? 'bg-red-50' : 'bg-green-50',
      iconColor: profitPositive === false ? 'text-red-500' : 'text-[#006d43]',
      label: t('financials.netProfit'),
      value: profitValue,
      valueColor: profitPositive === false ? 'text-red-500' : 'text-[#006d43]',
    },
    {
      id: 'balance' as const,
      badge: balancePositive ? t('financials.currentBalance') : t('financials.loss'),
      badgeColor: balancePositive ? 'text-blue-500' : 'text-red-500',
      icon: Wallet,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      label: t('financials.currentBalance'),
      value: balanceValue,
      valueColor: balancePositive ? 'text-gray-800' : 'text-red-500',
    },
    {
      id: 'payout' as const,
      badge: payoutPositive ? t('financials.availableForPayout') : t('financials.loss'),
      badgeColor: payoutPositive ? 'text-[#006d43]' : 'text-red-500',
      icon: Banknote,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-[#006d43]',
      label: t('financials.upcomingPayout'),
      value: payoutValue,
      valueColor: payoutPositive ? 'text-[#006d43]' : 'text-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onCardClick(card.id)}
            className="bg-white rounded-2xl px-6 pt-5 pb-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer text-right"
          >
            <div className="flex items-center justify-between mb-5">
              <span className={cn('text-sm font-semibold', card.badgeColor)}>{card.badge}</span>
              <div className={cn('w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0', card.iconBg)}>
                <Icon className={cn('w-[22px] h-[22px]', card.iconColor)} strokeWidth={1.8} />
              </div>
            </div>
            <p className="text-sm text-gray-400 text-center mb-1.5">{card.label}</p>
            <p className={cn('text-[28px] leading-tight font-black text-center', card.valueColor)} dir="ltr">
              {card.value}
            </p>
          </button>
        );
      })}
    </div>
  );
}

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
  period: string;
  onClose: () => void;
}) {
  const { t, isRTL } = useLanguage();
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
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {drawer === 'payout' && t('financials.upcomingPayout')}
            {drawer === 'balance' && t('financials.currentBalance')}
            {drawer === 'profit' && `${t('financials.netProfit')} — ${period}`}
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {drawer === 'payout' && payout && (
            <>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-5">
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium mb-1">{t('financials.availableForPayout')}</p>
                <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                  {formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {[
                  { label: t('financials.currentBalance'), value: formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency), note: t('financials.totalInAccount') },
                  { label: t('financials.reserve'), value: formatWithConversion(payout.reserve_held, payout.currency, payout.converted_reserve_held, payout.converted_currency), note: t('financials.fundsHeldByEtsy'), valueClass: payout.reserve_held > 0 ? 'text-amber-600 dark:text-amber-400' : undefined },
                  { label: t('financials.availableForPayout'), value: formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency), note: t('financials.nextScheduledPayout'), valueClass: 'text-emerald-600 dark:text-emerald-400 font-bold' },
                ].map((row, i) => (
                  <div key={i} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t border-gray-100 dark:border-gray-800')}>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</p>
                      {row.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</p>}
                    </div>
                    <p className={cn('text-sm font-semibold', row.valueClass ?? 'text-gray-900 dark:text-gray-100')}>{row.value}</p>
                  </div>
                ))}
              </div>
              {payout.recent_payouts?.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">{t('financials.recentPayouts')}</p>
                  <div className="space-y-2">
                    {payout.recent_payouts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{shortDate(p.date, isRTL ? 'he-IL' : 'en-US')}</span>
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{formatCents(p.amount, payout.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                {t('financials.payoutScheduleNote')}
              </p>
            </>
          )}
          {drawer === 'balance' && payout && (
            <>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-5">
                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium mb-1">{t('financials.currentBalance')}</p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                  {formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency)}
                </p>
                {payout.as_of && <p className="text-xs text-blue-500 dark:text-blue-500 mt-1">{t('financials.asOf')} {shortDate(payout.as_of, isRTL ? 'he-IL' : 'en-US')}</p>}
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {[
                  { label: t('financials.availableForPayout'), value: formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency), note: t('financials.readyForRelease'), valueClass: 'text-emerald-600 dark:text-emerald-400' },
                  { label: t('financials.reserve'), value: formatWithConversion(payout.reserve_held, payout.currency, payout.converted_reserve_held, payout.converted_currency), note: t('financials.heldTemporarily'), valueClass: payout.reserve_held > 0 ? 'text-amber-600 dark:text-amber-400' : undefined },
                  { label: t('financials.totalBalance'), value: formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency), note: t('financials.availablePlusReserve'), valueClass: 'font-bold text-gray-900 dark:text-gray-100' },
                ].map((row, i) => (
                  <div key={i} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t border-gray-100 dark:border-gray-800', i === 2 && 'bg-gray-50 dark:bg-gray-800/50')}>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</p>
                      {row.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</p>}
                    </div>
                    <p className={cn('text-sm font-semibold', row.valueClass ?? 'text-gray-900 dark:text-gray-100')}>{row.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                {t('financials.pendingNote')}
              </p>
            </>
          )}
          {drawer === 'profit' && summary && (
            <>
              <div className={cn('rounded-xl p-5 border', summary.net_profit >= 0 ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800')}>
                <p className={cn('text-sm font-medium mb-1', summary.net_profit >= 0 ? 'text-purple-700 dark:text-purple-400' : 'text-red-700 dark:text-red-400')}>{t('financials.netProfit')} — {period}</p>
                <p className={cn('text-3xl font-bold', summary.net_profit >= 0 ? 'text-purple-700 dark:text-purple-300' : 'text-red-700 dark:text-red-300')}>
                  {formatWithConversion(summary.net_profit, summary.currency, summary.converted_net_profit, summary.converted_currency)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {[
                  { label: t('financials.grossRevenue'), value: formatWithConversion(summary.revenue, summary.currency, summary.converted_revenue, summary.converted_currency), valueClass: 'text-emerald-600 dark:text-emerald-400', note: t('financials.grossRevenueNote') },
                  { label: t('financials.etsyFees'), value: `−${formatWithConversion(summary.etsy_fees, summary.currency, summary.converted_etsy_fees, summary.converted_currency)}`, valueClass: 'text-red-500', note: t('financials.etsyFeesNote') },
                  { label: t('financials.marketingExpenses'), value: `−${formatWithConversion(summary.advertising_expenses, summary.currency, summary.converted_advertising_expenses, summary.converted_currency)}`, valueClass: 'text-red-500', note: t('financials.marketingNote') },
                  { label: t('financials.refunds'), value: summary.refunds > 0 ? `−${formatWithConversion(summary.refunds, summary.currency, summary.converted_refunds, summary.converted_currency)}` : '—', valueClass: summary.refunds > 0 ? 'text-red-500' : 'text-gray-400', note: t('financials.refundsNote') },
                  { label: t('financials.netProfit'), value: formatWithConversion(summary.net_profit, summary.currency, summary.converted_net_profit, summary.converted_currency), valueClass: summary.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold', note: t('financials.revenueMinusExpenses'), highlight: true },
                ].map((row, i) => (
                  <div key={i} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t border-gray-100 dark:border-gray-800', (row as { highlight?: boolean }).highlight && 'bg-gray-50 dark:bg-gray-800/50')}>
                    <div>
                      <p className={cn('text-sm font-medium', (row as { highlight?: boolean }).highlight ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-700 dark:text-gray-300')}>{row.label}</p>
                      {row.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</p>}
                    </div>
                    <p className={cn('text-sm', row.valueClass ?? 'text-gray-900 dark:text-gray-100')}>{row.value}</p>
                  </div>
                ))}
              </div>
              {summary.revenue > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">{t('financials.revenueBreakdown')}</p>
                  <div className="w-full h-3 rounded-full overflow-hidden flex">
                    {[
                      { pct: Math.max(0, (summary.net_profit / summary.revenue) * 100), cls: 'bg-emerald-400', labelKey: 'financials.legend.profit' },
                      { pct: (summary.etsy_fees / summary.revenue) * 100, cls: 'bg-purple-400', labelKey: 'financials.legend.fees' },
                      { pct: (summary.advertising_expenses / summary.revenue) * 100, cls: 'bg-pink-400', labelKey: 'financials.legend.ads' },
                      { pct: (summary.refunds / summary.revenue) * 100, cls: 'bg-red-400', labelKey: 'financials.legend.refunds' },
                    ].map((seg) => (
                      <div key={seg.labelKey} className={cn('h-full transition-all duration-500', seg.cls)} style={{ width: `${Math.max(0, Math.min(100, seg.pct))}%` }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {[{ labelKey: 'financials.legend.profit', cls: 'bg-emerald-400' }, { labelKey: 'financials.legend.fees', cls: 'bg-purple-400' }, { labelKey: 'financials.legend.ads', cls: 'bg-pink-400' }, { labelKey: 'financials.legend.refunds', cls: 'bg-red-400' }].map((item) => (
                      <span key={item.labelKey} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', item.cls)} />
                        {t(item.labelKey)}
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

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

function FinancialComparisonPanel({
  comparisonData,
  shops,
  onClose,
}: {
  comparisonData: Record<string, FinancialSummary>;
  shops: { id: number; display_name: string }[];
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { currency: displayCurrency } = useCurrency();
  const entries = Object.entries(comparisonData);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('financials.comparison')}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">
          {t('common.close')}
        </button>
      </div>
      <div className={`grid gap-4 ${entries.length === 2 ? 'grid-cols-2' : entries.length >= 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {entries.map(([shopId, summary]) => {
          const shop = shops.find((s) => s.id === Number(shopId));
          const shopName = shop?.display_name || `Shop ${shopId}`;
          return (
            <div key={shopId} className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h4 className="font-semibold text-sm border-b border-gray-200 dark:border-gray-700 pb-2">
                {shopName}
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">{t('financials.revenue')}</p>
                  <p className="font-semibold text-green-600">{formatWithConversion(summary.revenue, summary.currency ?? displayCurrency, summary.converted_revenue, summary.converted_currency)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">{t('financials.totalExpenses')}</p>
                  <p className="font-semibold text-red-500">{formatWithConversion(summary.total_expenses, summary.currency ?? displayCurrency, summary.converted_total_expenses, summary.converted_currency)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">{t('financials.netProfit')}</p>
                  <p className="font-semibold text-blue-600">{formatWithConversion(summary.net_profit, summary.currency ?? displayCurrency, summary.converted_net_profit, summary.converted_currency)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">{t('financials.etsyFees')}</p>
                  <p className="font-semibold">{formatWithConversion(summary.etsy_fees, summary.currency ?? displayCurrency, summary.converted_etsy_fees, summary.converted_currency)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">{t('financials.advertising')}</p>
                  <p className="font-semibold">{formatWithConversion(summary.advertising_expenses, summary.currency ?? displayCurrency, summary.converted_advertising_expenses, summary.converted_currency)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Margin</p>
                  <p className="font-semibold">{summary.revenue > 0 ? ((summary.net_profit / summary.revenue) * 100).toFixed(1) : '0.0'}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FinancialsPage() {
  const { user } = useAuth();
  const { selectedShop, selectedShopIds, selectedShops } = useShop();
  const { showToast } = useToast();
  const { t, isRTL } = useLanguage();
  const { currency: displayCurrency } = useCurrency();

  const [period, setPeriod] = useState<Period>(() => loadPersistedPeriod());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customDraft, setCustomDraft] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshingConnection, setRefreshingConnection] = useState(false);
  const [scopeStatus, setScopeStatus] = useState<BillingScopeStatus | null>(null);
  const [comparisonData, setComparisonData] = useState<Record<string, FinancialSummary> | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Data
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [pnl, setPnl] = useState<ProfitAndLoss | null>(null);
  const [payout, setPayout] = useState<PayoutEstimate | null>(null);
  const [fees, setFees] = useState<FeeBreakdown | null>(null);
  const [timeline, setTimeline] = useState<RevenueTimeline | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerFilter, setLedgerFilter] = useState('');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [showLedgerTypeMenu, setShowLedgerTypeMenu] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceListResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [discounts, setDiscounts] = useState<DiscountSummary | null>(null);
  const [showEntryTypesModal, setShowEntryTypesModal] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'payout' | 'balance' | 'profit' | null>(null);

  const shopIds = selectedShopIds && selectedShopIds.length > 0 ? selectedShopIds : undefined;
  const shopId = !shopIds ? selectedShop?.id : undefined;
  const { start, end } = useMemo(() => periodToDates(period, customStart, customEnd), [period, customStart, customEnd]);

  /** Translate entry type using the translation function */
  const translateEntryType = (type: string): string => {
    const key = ENTRY_TYPE_TRANSLATION_KEYS[type];
    return key ? t(key) : type;
  };

  /** Label for ledger type filter dropdown */
  const ledgerTypeToLabel = (value: string): string => {
    if (!value) return t('financials.allTypes');
    const key = (ENTRY_TYPE_TRANSLATION_KEYS as Record<string, string>)[value];
    return key ? t(key) : value;
  };

  const LEDGER_TYPE_OPTIONS = [
    { value: '', labelKey: 'financials.allTypes' },
    { value: 'sale', labelKey: 'financials.types.sales' },
    { value: 'transaction_fee', labelKey: 'financials.types.transactionFees' },
    { value: 'processing_fee', labelKey: 'financials.types.processingFees' },
    { value: 'refund', labelKey: 'financials.types.refunds' },
    { value: 'payout', labelKey: 'financials.types.payouts' },
    { value: 'listing_renewal', labelKey: 'financials.types.listingRenewals' },
    { value: 'advertising', labelKey: 'financials.types.advertising' },
    { value: 'shipping_label', labelKey: 'financials.types.shippingLabels' },
    { value: 'reserve', labelKey: 'financials.types.reserves' },
  ] as const;

  // ── Check scope status ──
  useEffect(() => {
    financialsApi.getScopeStatus(shopId).then(setScopeStatus).catch(() => {});
  }, [shopId]);

  // ── Fetch all data ──
  const fetchAll = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const [summaryData, pnlData, payoutData, feeData, timelineData, ledgerData, invoiceData, syncStatusData, discountsData] = await Promise.all([
        financialsApi.getSummary({ shopIds, shopId, startDate: start, endDate: end, forceRefresh }),
        financialsApi.getProfitAndLoss(shopId, start, end, shopIds),
        financialsApi.getPayoutEstimate(shopId, shopIds),
        financialsApi.getFeeBreakdown(shopId, start, end, shopIds),
        financialsApi.getTimeline(shopId, start, end, periodToGranularity(period), shopIds),
        financialsApi.getLedger(shopId, ledgerFilter || undefined, start, end, 15, ledgerPage * 15, shopIds),
        invoicesApi.list({ shopIds, shopId, limit: 10 }),
        financialsApi.getSyncStatus(shopId, shopIds),
        financialsApi.getDiscounts({ shopIds, shopId, startDate: start, endDate: end }),
      ]);
      setSummary(summaryData);
      setPnl(pnlData);
      setPayout(payoutData);
      setFees(feeData);
      setTimeline(timelineData);
      setLedger(ledgerData);
      setInvoices(invoiceData);
      setSyncStatus(syncStatusData);
      setDiscounts(discountsData);
    } catch (err: unknown) {
      const error = err as { message?: string; status?: number };
      if (error?.message?.includes('403') || error?.status === 403) {
        showToast(t('financials.noPermission'), 'error');
      } else {
        showToast(t('financials.loadFailed'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [shopId, shopIds, start, end, period, ledgerPage, ledgerFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Refresh connection (token refresh) ──
  const handleRefreshConnection = async () => {
    const targetShopId =
      syncStatus?.shops &&
      Object.entries(syncStatus.shops).find(([, s]) => s.has_auth_error)?.[0]
        ? Number(Object.entries(syncStatus.shops).find(([, s]) => s.has_auth_error)?.[0])
        : shopIds?.[0] ?? selectedShop?.id;
    if (!targetShopId) return;
    setRefreshingConnection(true);
    try {
      await shopsApi.refreshConnection(targetShopId);
      showToast(t('financials.connectionRefreshed') || 'Connection refreshed successfully', 'success');
      await financialsApi.triggerSync(targetShopId, false);
      showToast(t('financials.syncStarted'), 'success');
      setTimeout(() => fetchAll(true), 5000);
    } catch (err: unknown) {
      const e = err as { status?: number; detail?: string } | undefined;
      if (e?.status === 401) {
        showToast(t('financials.refreshTokenExpired') || 'Refresh token expired. Please reconnect your Etsy shop.', 'error');
      } else {
        showToast((e?.detail as string) || t('financials.refreshFailed') || 'Failed to refresh connection', 'error');
      }
    } finally {
      setRefreshingConnection(false);
    }
  };

  // ── Sync trigger ──
  const handleSync = async (forceFull = false) => {
    const targetShopId = shopIds && shopIds.length > 1 ? undefined : (shopIds?.[0] ?? shopId);
    setSyncing(true);
    try {
      // Capture baseline timestamp before sync
      const baselineArr = syncStatus?.shops
        ? Object.values(syncStatus.shops).flatMap((s) => [
            s.ledger_last_sync_at ? new Date(s.ledger_last_sync_at).getTime() : 0,
            s.payment_last_sync_at ? new Date(s.payment_last_sync_at).getTime() : 0,
          ]).filter((t) => t > 0)
        : [];
      const baseline = baselineArr.length > 0 ? Math.max(...baselineArr) : 0;

      await financialsApi.triggerSync(targetShopId, forceFull);
      showToast(t('financials.syncStarted'), 'success');

      // Poll sync status until we see a newer timestamp or hit timeout
      const pollIntervalMs = 2000;
      const maxWaitMs = forceFull ? 90000 : 60000;
      let elapsed = 0;
      const poll = async () => {
        while (elapsed < maxWaitMs) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          elapsed += pollIntervalMs;
          try {
            const next = await financialsApi.getSyncStatus(shopId, shopIds);
            const timestamps = next?.shops
              ? Object.values(next.shops).flatMap((s) => [
                  s.ledger_last_sync_at ? new Date(s.ledger_last_sync_at).getTime() : 0,
                  s.payment_last_sync_at ? new Date(s.payment_last_sync_at).getTime() : 0,
                ]).filter((t) => t > 0)
              : [];
            const nextTs = timestamps.length > 0 ? Math.max(...timestamps) : 0;
            setSyncStatus(next);
            if (nextTs > baseline) {
              await fetchAll(true);
              return;
            }
          } catch {
            /* ignore poll errors */
          }
        }
        await fetchAll(true);
      };
      poll();
    } catch {
      showToast(t('financials.syncFailed'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ── Invoice upload handler ──
  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const metadata: Record<string, string> = {};
      if (shopId) metadata.shop_id = String(shopId);
      await invoicesApi.upload(file, metadata);
      showToast(t('financials.invoiceUploaded'), 'success');
      setShowInvoiceUpload(false);
      fetchAll();
    } catch {
      showToast(t('financials.invoiceUploadFailed'), 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleInvoiceAction = async (invoiceId: number, action: 'approved' | 'rejected') => {
    try {
      await invoicesApi.update(invoiceId, { status: action });
      showToast(t('financials.invoiceActioned').replace('{action}', action), 'success');
      fetchAll();
    } catch {
      showToast(t('financials.invoiceActionFailed').replace('{action}', action), 'error');
    }
  };

  const handleInvoiceDelete = async (invoiceId: number) => {
    try {
      await invoicesApi.delete(invoiceId);
      showToast(t('financials.invoiceDeleted'), 'success');
      fetchAll();
    } catch {
      showToast(t('financials.invoiceDeleteFailed'), 'error');
    }
  };

  // ── Loading skeleton ──
  if (loading && !summary) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  // ── Fetch failed: show retry ──
  if (!loading && !summary) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/40 dark:border-slate-600 p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-slate-500 dark:text-slate-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">{t('financials.loadFailed')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-4">Check that you have a connected shop and billing scope.</p>
          <button
            onClick={() => fetchAll(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 dark:bg-slate-500 dark:hover:bg-slate-400"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.retry') || 'Retry'}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // Compute helpers
  const maxFee = fees ? Math.max(...fees.categories.map((c) => c.amount), 1) : 1;

  // Timeline max for bar chart scaling
  const maxTimelineVal = timeline
    ? Math.max(...timeline.timeline.map((t) => Math.max(t.revenue, t.expenses)), 1)
    : 1;

  return (
    <DashboardLayout>
      <div className="max-w-[1300px] mx-auto space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
        <DisconnectedShopBanner />
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div className="text-right">
            <h1 className="text-3xl font-black text-gray-800">{t('financials.title')}</h1>
            <p className="text-gray-400 mt-1 text-sm">
              {t('financials.subtitle')}{' '}
              {shopIds && shopIds.length > 1 ? `${shopIds.length} ${t('financials.selectedShops')}` : selectedShop?.display_name || t('financials.allShops')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Period dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodMenu(!showPeriodMenu)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:border-[#006d43] transition-colors min-w-[220px] shadow-sm"
              >
                <Calendar className="w-4 h-4 flex-shrink-0 text-gray-400" />
                <span className="text-sm font-semibold flex-1 text-start truncate">
                  {periodToLabel(period, customStart, customEnd, t, isRTL ? 'he-IL' : 'en-US')}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPeriodMenu ? 'rotate-180' : ''}`} />
              </button>

              {showPeriodMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPeriodMenu(false)} />
                  <div className="absolute end-0 mt-2 w-72 bg-white border border-gray-100 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('dateRange.label')}</p>
                    </div>
                    <div className="py-1">
                      {PERIOD_OPTIONS.filter(p => p !== 'custom').map((p) => (
                        <button
                          key={p}
                          onClick={() => { setPeriod(p); persistPeriod(p); setShowPeriodMenu(false); }}
                          className={`w-full flex items-center px-4 py-2.5 text-right transition-colors ${
                            period === p
                              ? 'bg-green-50 text-[#006d43]'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-sm font-medium">{periodToLabel(p, undefined, undefined, t)}</span>
                          {period === p && <CheckCircle strokeWidth={2} className="ms-auto w-4 h-4 flex-shrink-0 text-[#006d43]" />}
                        </button>
                      ))}
                    </div>

                    {/* Custom date range */}
                    <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{t('financials.period.custom')}</p>
                      <div className="flex gap-2 mb-2">
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 mb-1 block">{t('financials.from')}</label>
                          <input
                            type="date"
                            value={customDraft.start}
                            onChange={e => setCustomDraft(d => ({ ...d, start: e.target.value }))}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 mb-1 block">{t('financials.to')}</label>
                          <input
                            type="date"
                            value={customDraft.end}
                            min={customDraft.start}
                            onChange={e => setCustomDraft(d => ({ ...d, end: e.target.value }))}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                          />
                        </div>
                      </div>
                      <button
                        disabled={!customDraft.start || !customDraft.end}
                        onClick={() => {
                          setCustomStart(customDraft.start);
                          setCustomEnd(customDraft.end);
                          setPeriod('custom');
                          persistPeriod('custom');
                          setShowPeriodMenu(false);
                        }}
                        className="w-full py-1.5 rounded-lg text-sm font-medium bg-[#006d43] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#005a37] transition-colors"
                      >
                        {t('common.apply')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Compare button (visible when multiple shops selected) */}
            {shopIds && shopIds.length > 1 && (
              <button
                onClick={async () => {
                  setShowComparison(!showComparison);
                  if (!showComparison && !comparisonData) {
                    setLoadingComparison(true);
                    try {
                      const data = await financialsApi.getComparison(shopIds, start, end);
                      setComparisonData(data.shops);
                    } catch {
                      setComparisonData(null);
                    } finally {
                      setLoadingComparison(false);
                    }
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-[#006d43] transition-colors"
              >
                {showComparison ? t('financials.hideComparison') : t('financials.compareShops')}
              </button>
            )}


            {/* Sync */}
            {user?.role && ['owner', 'admin'].includes(user.role.toLowerCase()) && (
              <button
                onClick={() => handleSync(false)}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#006d43] text-white hover:bg-[#005a37] disabled:opacity-50 transition-colors shadow-sm font-semibold text-sm"
              >
                <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
                {t('financials.sync')}
              </button>
            )}
          </div>
        </div>

        {/* ── Unmapped ledger types warning ── */}
        {(syncStatus?.unmapped_ledger_types || summary?.warning) && (() => {
          const count = syncStatus?.unmapped_count ?? summary?.unmapped_count ?? ((syncStatus?.unmapped_types || summary?.unmapped_types) ?? []).length;
          const message = count > 0
            ? (t('financials.unmappedLedgerTypesMessageWithCount') || 'Profit may not match Etsy. {count} unmapped entry types need mapping in the registry.').replace('{count}', String(count))
            : t('financials.unmappedLedgerTypesMessage');
          return (
            <NotificationBanner
              variant="warning"
              title={t('financials.unmappedLedgerTypes')}
              message={message}
              action={{ label: t('financials.mapInRegistry'), onClick: () => setShowEntryTypesModal(true) }}
            />
          );
        })()}

        {/* ── Sync error banner ── */}
        {syncStatus && Object.values(syncStatus.shops).some((s) => s.ledger_last_error || s.payment_last_error) && (
          <NotificationBanner
            variant="error"
            title={t('financials.syncError')}
            message={
              Object.values(syncStatus.shops).some((s) => {
                const isAuthError = (msg: string) =>
                  /reconnect|authentication|401|token|invalid_grant|refresh.*expired/i.test(msg);
                return (
                  (s.ledger_last_error && isAuthError(s.ledger_last_error)) ||
                  (s.payment_last_error && isAuthError(s.payment_last_error)) ||
                  s.has_auth_error
                );
              })
                ? t('financials.authErrorHint')
                : t('financials.syncErrorGeneric')
            }
            action={
              (Object.values(syncStatus.shops).some((s) => s.has_auth_error) ||
                Object.values(syncStatus.shops).some(
                  (s) =>
                    (s.ledger_last_error?.toLowerCase().includes('reconnect') ||
                      s.ledger_last_error?.toLowerCase().includes('authentication') ||
                      s.ledger_last_error?.toLowerCase().includes('401') ||
                      s.ledger_last_error?.toLowerCase().includes('token') ||
                      s.payment_last_error?.toLowerCase().includes('reconnect') ||
                      s.payment_last_error?.toLowerCase().includes('authentication') ||
                      s.payment_last_error?.toLowerCase().includes('401') ||
                      s.payment_last_error?.toLowerCase().includes('token'))
                )) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshConnection}
                    disabled={refreshingConnection}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-800 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw className={cn('w-4 h-4', refreshingConnection && 'animate-spin')} />
                    {refreshingConnection ? (t('financials.refreshing') || 'Refreshing...') : (t('financials.refreshConnection') || 'Refresh Connection')}
                  </button>
                  <a
                    href="/settings?tab=shops"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-800 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
                >
                  {t('financials.reconnectEtsy')}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
            </div>
              ) : undefined
            }
          />
        )}

        {/* ── Scope warning banner ── */}
        {scopeStatus && !scopeStatus.has_billing_scope && (
          <NotificationBanner
            variant="warning"
            title={t('financials.billingScopeNotGranted')}
            message={
              <>
                {t('financials.billingScopeMessage')}{' '}
                <code className="font-mono text-xs bg-white/20 px-1 rounded">{t('financials.billingScopeCode')}</code>{' '}
                {t('financials.billingScopeEnd')}
              </>
            }
            action={scopeStatus.reconnect_url ? { label: t('financials.reconnectEtsy'), href: scopeStatus.reconnect_url } : undefined}
          />
        )}

        {/* ── Financial Comparison Panel ── */}
        {showComparison && shopIds && shopIds.length > 1 && (
          loadingComparison ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : comparisonData ? (
            <FinancialComparisonPanel
              comparisonData={comparisonData}
              shops={selectedShops}
              onClose={() => { setShowComparison(false); setComparisonData(null); }}
            />
          ) : null
        )}

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
          period={periodToLabel(period, customStart, customEnd, t, isRTL ? 'he-IL' : 'en-US')}
          onClose={() => setActiveDrawer(null)}
        />

        {/* ── Activity Summary (Etsy-style) ── */}
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6">
          <h2 className="text-lg font-black text-gray-800 mb-4">
            {t('financials.activitySummary')}
          </h2>

          {/* Current Etsy Wallet Balance */}
          {payout && (
            <p className="text-sm text-gray-500 mb-2">
              {t('financials.yourCurrentBalance')}{' '}
              <strong className="text-gray-800 font-black">
                {formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency)}
              </strong>
              .
            </p>
          )}

          {/* Net Profit for selected period */}
          {summary && (
            <p className="text-sm text-gray-500 mb-6">
              {t('financials.yourNetProfit')}{' '}
              <strong
                className={cn(
                  'font-black',
                  summary.net_profit >= 0 ? 'text-[#006d43]' : 'text-red-500'
                )}
              >
                {formatWithConversion(summary.net_profit, summary.currency, summary.converted_net_profit, summary.converted_currency)}
              </strong>
              .
            </p>
          )}

          {/* Sales and Fees - Expandable cards */}
          {summary && fees && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ExpandableCard
                title={t('financials.sales')}
                totalValue={formatWithConversion(summary.revenue, summary.currency, summary.converted_revenue, summary.converted_currency)}
                totalPositive
                icon={Receipt}
                defaultExpanded
              >
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('financials.totalSales')}</span>
                    <span className="font-medium">{formatWithConversion(summary.revenue, summary.currency, summary.converted_revenue, summary.converted_currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('financials.refunds')}</span>
                    <span className="font-medium text-red-600">
                      {summary.refunds > 0 ? `-${formatWithConversion(summary.refunds, summary.currency, summary.converted_refunds, summary.converted_currency)}` : '—'}
                    </span>
                  </div>
                </div>
              </ExpandableCard>

              <ExpandableCard
                title={t('financials.fees')}
                totalValue={`-${formatWithConversion(summary.etsy_fees, summary.currency, summary.converted_etsy_fees, summary.converted_currency)}`}
                totalPositive={false}
                icon={CreditCard}
                defaultExpanded
              >
                <div className="space-y-2 text-sm">
                  {fees.categories
                    .filter((c) =>
                      ['transaction_fee', 'processing_fee', 'listing_renewal', 'subscription'].includes(c.category)
                    )
                    .map((cat) => (
                      <div key={cat.category} className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">{entryTypeLabel(cat.category)}</span>
                        <span className="font-medium text-red-600">-{formatCents(cat.amount, fees.currency)}</span>
                      </div>
                    ))}
                  {fees.categories.filter((c) =>
                    ['transaction_fee', 'processing_fee', 'listing_renewal', 'subscription'].includes(c.category)
                  ).length === 0 && (
                    <p className="text-gray-400 text-sm">{t('financials.noFeeData')}</p>
                  )}
                </div>
              </ExpandableCard>

              <ExpandableCard
                title={t('financials.marketing')}
                totalValue={`-${formatWithConversion(summary.advertising_expenses, summary.currency, summary.converted_advertising_expenses, summary.converted_currency)}`}
                totalPositive={false}
                icon={Megaphone}
                defaultExpanded
              >
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('financials.advertising')}</span>
                    <span className="font-medium text-red-600">
                      -{formatWithConversion(summary.advertising_expenses, summary.currency, summary.converted_advertising_expenses, summary.converted_currency)}
                    </span>
            </div>
                </div>
              </ExpandableCard>

              {/* Discounts (derived from Order.discount_amt) */}
              {discounts && (discounts.total_discounts > 0 || discounts.order_count_with_discounts > 0) && (
                <ExpandableCard
                  title={t('financials.discounts')}
                  totalValue={`-${formatWithConversion(discounts.total_discounts, discounts.currency, discounts.converted_total_discounts, discounts.converted_currency)}`}
                  totalPositive={false}
                  icon={Percent}
                >
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{t('financials.discountsDescription')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{t('financials.ordersWithDiscounts')}</span>
                      <span className="font-medium">{discounts.order_count_with_discounts}</span>
                    </div>
                  </div>
                </ExpandableCard>
              )}
            </div>
          )}
        </div>

        {/* ── Additional stats (Product costs, Invoices, etc.) ── */}
        {summary && user?.role && ['owner', 'admin'].includes(user.role.toLowerCase()) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title={t('financials.productCosts')}
              value={formatWithConversion(summary.product_costs, summary.currency, summary.converted_product_costs, summary.converted_currency)}
                icon={Package}
                positive={false}
                subtitle={t('financials.productCostsDescription')}
              />
              <StatCard
                title={t('financials.invoiceExpenses')}
              value={formatWithConversion(summary.invoice_expenses, summary.currency, summary.converted_invoice_expenses, summary.converted_currency)}
                icon={FileUp}
                positive={false}
                subtitle={t('financials.invoiceExpensesDescription')}
              />
              <StatCard
                title={t('financials.totalExpenses')}
              value={formatWithConversion(summary.total_expenses, summary.currency, summary.converted_total_expenses, summary.converted_currency)}
                icon={TrendingDown}
                positive={false}
                subtitle={t('financials.totalExpensesDescription')}
              />
              <StatCard
                title={t('financials.netProfit')}
              value={formatWithConversion(summary.net_profit, summary.currency, summary.converted_net_profit, summary.converted_currency)}
                icon={TrendingUp}
                positive={summary.net_profit >= 0}
                subtitle={summary.net_profit >= 0 ? t('financials.profitable') : t('financials.loss')}
                className={cn(
                  summary.net_profit >= 0
                    ? 'border-emerald-200 dark:border-emerald-800'
                    : 'border-red-200 dark:border-red-800'
                )}
              />
            </div>
        )}

        {/* ── Invoice Expenses Section ── */}
        {user?.role && ['owner', 'admin'].includes(user.role.toLowerCase()) && (
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6">
            <SectionHeader title={t('financials.expenseInvoices')}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {invoices?.total_count ?? 0} {t('financials.invoicesCount')}
                </span>
                <label className="inline-flex items-center gap-1.5 rounded-xl bg-[#006d43] text-white px-4 py-2 text-sm font-semibold hover:bg-[#005a37] cursor-pointer transition-colors">
                  <FileUp className="w-4 h-4" />
                  {uploading ? t('financials.uploading') : t('financials.uploadInvoice')}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx"
                    onChange={handleInvoiceUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
            </SectionHeader>

            {invoices && invoices.invoices.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 text-left border-b border-gray-100">
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.file')}</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.vendor')}</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.date')}</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">{t('financials.table.amount')}</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.status')}</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-800">
                    {invoices.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-4 py-2 truncate max-w-[200px]">
                          <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded mr-1 uppercase">
                            {inv.file_type}
                          </span>
                          {inv.file_name}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                          {inv.vendor_name || '—'}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                          {shortDate(inv.invoice_date, isRTL ? 'he-IL' : 'en-US')}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {inv.total_amount !== null ? formatCents(inv.total_amount, inv.currency) : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            inv.status === 'approved' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
                            inv.status === 'rejected' && 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
                            inv.status === 'pending' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                          )}>
                            {inv.status === 'approved' ? t('financials.status.approved') : inv.status === 'rejected' ? t('financials.status.rejected') : t('financials.status.pending')}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            {inv.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleInvoiceAction(inv.id, 'approved')}
                                  className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
                                >
                                  {t('common.approve')}
                                </button>
                                <button
                                  onClick={() => handleInvoiceAction(inv.id, 'rejected')}
                                  className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
                                >
                                  {t('common.reject')}
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleInvoiceDelete(inv.id)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                {t('financials.noInvoices')}
              </p>
            )}
          </div>
        )}

        {/* ── Payout bar ── */}
        {payout && (
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6">
            <SectionHeader title={t('financials.payoutEstimate')}>
              <span className="text-xs text-gray-400">
                {t('financials.asOf')} {shortDate(payout.as_of, isRTL ? 'he-IL' : 'en-US')}
              </span>
            </SectionHeader>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">{t('financials.currentBalance')}</p>
                <p className="text-xl font-bold mt-1">
                  {formatWithConversion(payout.current_balance, payout.currency, payout.converted_current_balance, payout.converted_currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('financials.reserveHeld')}</p>
                <p className="text-xl font-bold mt-1 text-amber-600">
                  {formatWithConversion(payout.reserve_held, payout.currency, payout.converted_reserve_held, payout.converted_currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('financials.availableForPayout')}</p>
                <p className="text-xl font-bold mt-1 text-emerald-600">
                  {formatWithConversion(payout.available_for_payout, payout.currency, payout.converted_available_for_payout, payout.converted_currency)}
                </p>
              </div>
            </div>

            {/* Recent payouts */}
            {payout.recent_payouts.length > 0 && (
              <div className="mt-4 pt-4 border-t dark:border-gray-800">
                <p className="text-xs font-medium text-gray-500 mb-2">{t('financials.recentPayouts')}</p>
                <div className="flex flex-wrap gap-2">
                  {payout.recent_payouts.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs text-blue-700 dark:text-blue-300"
                    >
                      <Banknote className="w-3 h-3" />
                      {formatCents(p.amount, payout?.currency ?? displayCurrency)} — {shortDate(p.date, isRTL ? 'he-IL' : 'en-US')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Two-column: Fee Breakdown + Timeline ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fee breakdown */}
          {fees && (
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6">
              <SectionHeader title={t('financials.feeBreakdown')}>
                <span className="text-sm font-semibold text-gray-500">
                  {formatWithConversion(fees.total_fees, fees.currency, fees.converted_total_fees, fees.converted_currency)}
                </span>
              </SectionHeader>

              <div className="space-y-3">
                {fees.categories.map((cat) => {
                  const pct = (cat.amount / fees.total_fees) * 100;
                  return (
                    <div key={cat.category}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          {feeIcon(cat.category)}
                          {entryTypeLabel(cat.category)}
                        </span>
                        <span className="font-medium">{formatWithConversion(cat.amount, fees.currency, undefined, fees.converted_currency)}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {cat.count} {t('financials.entries')} &middot; {pct.toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
                {fees.categories.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {t('financials.noFeeData')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Revenue timeline (simple bar chart) */}
          {timeline && (
            <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 p-6">
              <SectionHeader title={t('financials.revenueTimeline')}>
                <span className="text-xs text-gray-400 capitalize">{timeline.granularity}</span>
              </SectionHeader>

              {timeline.timeline.length > 0 ? (
                <div className="flex items-end gap-1 h-48 mt-2">
                  {timeline.timeline.map((point, idx) => {
                    const revH = (point.revenue / maxTimelineVal) * 100;
                    const expH = (point.expenses / maxTimelineVal) * 100;
                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center gap-0.5 group relative"
                      >
                        {/* Tooltip */}
                        <div className="absolute -top-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                          <p>{shortDate(point.date, isRTL ? 'he-IL' : 'en-US')}</p>
                          <p className="text-emerald-400">{t('financials.rev')} {formatCents(point.revenue, displayCurrency)}</p>
                          <p className="text-red-400">{t('financials.exp')} {formatCents(point.expenses, displayCurrency)}</p>
                          <p className="text-blue-400">{t('financials.net')} {formatCents(point.net, displayCurrency)}</p>
                        </div>
                        <div
                          className="w-full bg-emerald-400 dark:bg-emerald-500 rounded-t transition-all duration-300"
                          style={{ height: `${revH}%`, minHeight: point.revenue > 0 ? '2px' : 0 }}
                        />
                        <div
                          className="w-full bg-red-300 dark:bg-red-500 rounded-t transition-all duration-300"
                          style={{ height: `${expH}%`, minHeight: point.expenses > 0 ? '2px' : 0 }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-16">
                  {t('financials.noTimelineData')}
                </p>
              )}

              <div className="flex items-center justify-center gap-6 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-emerald-400 inline-block" /> {t('financials.revenue')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-300 inline-block" /> {t('financials.expenses')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent activities (Ledger) ── */}
        {ledger && (
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80 overflow-hidden">
            <div className="p-5 border-b dark:border-gray-800">
              <SectionHeader title={t('financials.recentActivities')}>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowLedgerTypeMenu(!showLedgerTypeMenu)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:border-[#006d43] transition-colors min-w-[160px] shadow-sm"
                    >
                      <Filter className="w-4 h-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-medium flex-1 text-left truncate">
                        {ledgerTypeToLabel(ledgerFilter)}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showLedgerTypeMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showLedgerTypeMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowLedgerTypeMenu(false)}
                        />
                        <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-100 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                          <div className="px-4 py-3 border-b border-gray-100">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                              {t('financials.filterByType')}
                            </p>
                          </div>
                          <div className="py-1 max-h-72 overflow-y-auto">
                            {LEDGER_TYPE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value || 'all'}
                                onClick={() => {
                                  setLedgerFilter(opt.value);
                                  setLedgerPage(0);
                                  setShowLedgerTypeMenu(false);
                                }}
                                className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                                  ledgerFilter === opt.value
                                    ? 'bg-green-50 text-[#006d43]'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <span className="text-sm font-medium">{t(opt.labelKey)}</span>
                                {ledgerFilter === opt.value && (
                                  <CheckCircle strokeWidth={2} className="ml-auto w-4 h-4 flex-shrink-0 text-[#006d43]" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{ledger.total_count} {t('common.total')}</span>
                </div>
              </SectionHeader>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-left border-b border-gray-100">
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.date')}</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.type')}</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('financials.table.description')}</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">{t('financials.table.net')}</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">{t('financials.table.balance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {ledger.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <td className="px-5 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {shortDate(entry.entry_created_at, isRTL ? 'he-IL' : 'en-US')}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            entryTypeBadgeClasses(entry.entry_type)
                          )}
                        >
                          {translateEntryType(entry.entry_type)}
                        </span>
                      </td>
                      <td className="px-5 py-3 max-w-xs truncate text-gray-700 dark:text-gray-300">
                        {entryTypeLabel(entry.description || entry.entry_type || '') || '—'}
                      </td>
                      <td
                        className={cn(
                          'px-5 py-3 text-right font-mono whitespace-nowrap',
                          entry.amount >= 0 ? 'text-emerald-600' : 'text-red-500'
                        )}
                      >
                        {entry.amount >= 0 ? '+' : ''}
                        {formatCents(entry.amount, entry.currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap text-gray-500">
                        {formatCents(entry.balance, entry.currency)}
                      </td>
                    </tr>
                  ))}
                  {ledger.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                        {t('financials.noLedgerEntries')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {ledger.total_count > 15 && (
              <div className="flex items-center justify-between px-5 py-3 border-t dark:border-gray-800">
                <p className="text-xs text-gray-500">
                  Showing {ledger.offset + 1}–{Math.min(ledger.offset + 15, ledger.total_count)} of{' '}
                  {ledger.total_count}
                </p>
                <div className="flex gap-1">
                  <button
                    disabled={ledgerPage === 0}
                    onClick={() => setLedgerPage((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={(ledgerPage + 1) * 15 >= ledger.total_count}
                    onClick={() => setLedgerPage((p) => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Entry Types Registry Modal ── */}
        {showEntryTypesModal && (
          <EntryTypesModal
            onClose={() => setShowEntryTypesModal(false)}
            onSaved={() => {
              setShowEntryTypesModal(false);
              fetchAll(true);
            }}
            t={t}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
