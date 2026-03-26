'use client';

/**
 * Analytics Page
 * Comprehensive analytics dashboard for Owner, Admin, and Viewer roles.
 * Pulls data from 3 backend endpoints: overview, orders, products.
 * Cards are clickable — opening a slide-over detail panel with the underlying data.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import { useShop } from '@/lib/shop-context';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';
import { DisconnectedShopBanner } from '@/components/ui/DisconnectedShopBanner';
import {
  analyticsApi,
  ordersApi,
  productsApi,
  type OverviewAnalytics,
  type OrderAnalytics,
  type ProductAnalytics,
  type FulfillmentAnalytics,
  type Order,
  type Product,
} from '@/lib/api';
import { formatAmount, getDisplayAmount } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Package,
  RefreshCw,
  BarChart3,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Calendar,
} from 'lucide-react';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type DetailView =
  | { kind: 'revenue' }
  | { kind: 'orders'; statusFilter?: string }
  | { kind: 'payment'; paymentFilter?: string }
  | { kind: 'products' }
  | { kind: 'listings' }
  | { kind: 'fulfillment'; stateFilter?: string }
  | { kind: 'sources' }
  | { kind: 'suppliers' }
  | null;

type DateRangePreset = '7d' | '30d' | '90d' | '12m' | 'all';

function dateRangeToParams(preset: DateRangePreset): { start?: string; end?: string } {
  if (preset === 'all') return {};
  const end = new Date();
  const days: Record<DateRangePreset, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365, all: 0 };
  const start = new Date();
  start.setDate(start.getDate() - days[preset]);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function dateRangeToLabel(preset: DateRangePreset, t: (k: string) => string): string {
  const labels: Record<DateRangePreset, string> = {
    '7d': t('analytics.last7d'),
    '30d': t('analytics.last30d'),
    '90d': t('analytics.last90d'),
    '12m': t('analytics.last12m'),
    all: t('analytics.allTime'),
  };
  return labels[preset];
}

/** Format analytics revenue (dollars) - uses converted value when user prefers non-USD */
function formatAnalyticsRevenue(
  amount: number,
  convertedAmount: number | undefined,
  convertedCurrency: string | undefined
): string {
  const { value, currency } = getDisplayAmount(amount, 'USD', convertedAmount, convertedCurrency);
  return formatAmount(value, currency);
}

/* ================================================================== */
/*  Reusable components                                                */
/* ================================================================== */

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  trendLabel,
  prefix = '',
  suffix = '',
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  prefix?: string;
  suffix?: string;
  onClick?: () => void;
}) {
  const { t } = useLanguage();
  const hasTrend = trend !== undefined && trend !== null;
  const isPositive = (trend ?? 0) >= 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-5 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] transition-all',
        onClick && 'cursor-pointer hover:shadow-lg hover:border-[var(--primary)] hover:scale-[1.02] active:scale-[0.99]',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[var(--text-secondary)]">{title}</span>
        <div className="w-9 h-9 rounded-lg bg-[var(--primary-bg)] flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-[var(--primary)]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </p>
      {hasTrend && (
        <div className="flex items-center gap-1.5 mt-2">
          {isPositive ? (
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-red-500" />
          )}
          <span className={cn('text-xs font-semibold', isPositive ? 'text-emerald-500' : 'text-red-500')}>
            {isPositive ? '+' : ''}{trend.toFixed(1)}%
          </span>
          {trendLabel && <span className="text-xs text-[var(--text-muted)]">{trendLabel}</span>}
        </div>
      )}
      {onClick && (
        <p className="text-[10px] text-[var(--text-muted)] mt-2 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> {t('analytics.clickToViewDetails')}
        </p>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
    </div>
  );
}

function BarItem({
  label,
  value,
  total,
  color,
  onClick,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  onClick?: () => void;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div
      onClick={onClick}
      className={cn('space-y-1.5 p-2 rounded-lg transition-all -mx-2', onClick && 'cursor-pointer hover:bg-[var(--background)]')}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">{value.toLocaleString()}</span>
          {onClick && <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />}
        </div>
      </div>
      <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function DonutStat({
  label,
  value,
  total,
  color,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg bg-[var(--background)] transition-all',
        onClick && 'cursor-pointer hover:ring-2 hover:ring-[var(--primary)] hover:ring-opacity-50',
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-secondary)] truncate">{label}</p>
        <p className="font-bold text-[var(--text-primary)]">{value.toLocaleString()}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">{pct}%</span>
        {onClick && <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />}
      </div>
    </div>
  );
}

function ClickableCard({
  children,
  onClick,
  className: extraClass,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-6 transition-all',
        onClick && 'cursor-pointer hover:shadow-lg hover:border-[var(--primary)]',
        extraClass,
      )}
    >
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Detail Drawer                                                      */
/* ================================================================== */

function StatusBadge({ status, type = 'order' }: { status: string; type?: string }) {
  const colorMap: Record<string, string> = {
    processing: 'bg-yellow-100 text-yellow-700',
    in_transit: 'bg-blue-100 text-blue-700',
    shipped: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-orange-100 text-orange-700',
    delayed: 'bg-orange-100 text-orange-700',
    paid: 'bg-emerald-100 text-emerald-700',
    unpaid: 'bg-amber-100 text-amber-700',
    published: 'bg-emerald-100 text-emerald-700',
    draft: 'bg-gray-100 text-gray-700',
    pending: 'bg-blue-100 text-blue-700',
    successful: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  };

  const classes = colorMap[status.toLowerCase()] || 'bg-gray-100 text-gray-700';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', classes)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function DetailDrawer({
  view,
  onClose,
  overview,
  orders,
  products,
  fulfillment,
  shopId,
  isOwner,
}: {
  view: DetailView;
  onClose: () => void;
  overview: OverviewAnalytics | null;
  orders: OrderAnalytics | null;
  products: ProductAnalytics | null;
  fulfillment: FulfillmentAnalytics | null;
  shopId?: number;
  isOwner: boolean;
}) {
  const [detailOrders, setDetailOrders] = useState<Order[]>([]);
  const [detailProducts, setDetailProducts] = useState<Product[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTotal, setDetailTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const drawerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch detail data when view changes
  useEffect(() => {
    if (!view) return;
    setPage(1);
  }, [view]);

  useEffect(() => {
    if (!view) return;
    loadDetailData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, page]);

  const loadDetailData = async () => {
    if (!view) return;
    setDetailLoading(true);

    try {
      if (view.kind === 'orders') {
        const res = await ordersApi.getAll(page, limit, view.statusFilter, undefined, { shopId });
        setDetailOrders(res.orders);
        setDetailTotal(res.total);
      } else if (view.kind === 'payment') {
        const res = await ordersApi.getAll(page, limit, undefined, view.paymentFilter, { shopId });
        setDetailOrders(res.orders);
        setDetailTotal(res.total);
      } else if (view.kind === 'products') {
        const res = await productsApi.getAll(page, limit, undefined, { shopId });
        setDetailProducts(res.products);
        setDetailTotal(res.total);
      } else if (view.kind === 'fulfillment') {
        // Use orders endpoint; map fulfillment states to lifecycle_status
        const statusMap: Record<string, string> = {
          processing: 'processing',
          shipped: 'in_transit',
          in_transit: 'in_transit',
          delivered: 'completed',
          delayed: 'processing',
          cancelled: 'cancelled',
        };
        const mappedStatus = view.stateFilter ? statusMap[view.stateFilter] || undefined : undefined;
        const res = await ordersApi.getAll(page, limit, mappedStatus, undefined, { shopId });
        setDetailOrders(res.orders);
        setDetailTotal(res.total);
      }
    } catch {
      // silently handle
    } finally {
      setDetailLoading(false);
    }
  };

  if (!view) return null;

  const totalPages = Math.ceil(detailTotal / limit);

  const getTitle = (): string => {
    switch (view.kind) {
      case 'revenue': return t('analytics.revenueBreakdown');
      case 'orders': return view.statusFilter ? `${t('analytics.orders')} — ${view.statusFilter.replace(/_/g, ' ')}` : t('analytics.allOrders');
      case 'payment': return view.paymentFilter ? `${t('analytics.orders')} — ${view.paymentFilter}` : t('analytics.paymentOverview');
      case 'products': return t('analytics.allProducts');
      case 'listings': return t('analytics.listingJobs');
      case 'fulfillment': return view.stateFilter ? `${t('analytics.fulfillment')} — ${view.stateFilter.replace(/_/g, ' ')}` : t('analytics.fulfillmentOverview');
      case 'sources': return t('analytics.shipmentSources');
      case 'suppliers': return t('analytics.supplierPerformance');
      default: return t('analytics.details');
    }
  };

  const renderContent = () => {
    /* ── Revenue detail ────────────────────────── */
    if (view.kind === 'revenue' && overview) {
      const fmt = (amt: number, conv?: number, ccy?: string) =>
        formatAnalyticsRevenue(amt, conv, ccy);
      const daily30 = overview.converted_revenue_30d != null
        ? overview.converted_revenue_30d / 30
        : overview.revenue_30d / 30;
      const daily7 = overview.converted_revenue_7d != null
        ? overview.converted_revenue_7d / 7
        : overview.revenue_7d / 7;
      const daily30Str = overview.converted_currency
        ? formatAmount(daily30, overview.converted_currency)
        : `$${daily30.toFixed(2)}`;
      const daily7Str = overview.converted_currency
        ? formatAmount(daily7, overview.converted_currency)
        : `$${daily7.toFixed(2)}`;
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <StatTile label={t('analytics.totalRevenue')} value={fmt(overview.total_revenue, overview.converted_total_revenue, overview.converted_currency)} />
            <StatTile label={t('analytics.avgOrderValue')} value={fmt(overview.avg_order_value, overview.converted_avg_order_value, overview.converted_currency)} />
            <StatTile label={t('analytics.totalOrders')} value={overview.total_orders.toLocaleString()} />
          </div>

          <div className="border-t border-[var(--border-color)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('analytics.performance7d')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <TrendTile label={t('analytics.orders')} value={overview.orders_7d} trend={overview.orders_7d_trend} />
              <TrendTile label={t('analytics.revenue')} value={fmt(overview.revenue_7d, overview.converted_revenue_7d, overview.converted_currency)} trend={overview.revenue_7d_trend} />
            </div>
          </div>

          <div className="border-t border-[var(--border-color)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('analytics.performance30d')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <TrendTile label={t('analytics.orders')} value={overview.orders_30d} trend={overview.orders_30d_trend} />
              <TrendTile label={t('analytics.revenue')} value={fmt(overview.revenue_30d, overview.converted_revenue_30d, overview.converted_currency)} trend={overview.revenue_30d_trend} />
            </div>
          </div>

          {overview.orders_30d > 0 && (
            <div className="border-t border-[var(--border-color)] pt-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('analytics.insights')}</h4>
              <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                <p>{t('analytics.dailyAvg30d')} <strong className="text-[var(--text-primary)]">{daily30Str}</strong> {t('analytics.revenue').toLowerCase()}, <strong className="text-[var(--text-primary)]">{(overview.orders_30d / 30).toFixed(1)}</strong> {t('analytics.orders').toLowerCase()}</p>
                <p>{t('analytics.dailyAvg7d')} <strong className="text-[var(--text-primary)]">{daily7Str}</strong> {t('analytics.revenue').toLowerCase()}, <strong className="text-[var(--text-primary)]">{(overview.orders_7d / 7).toFixed(1)}</strong> {t('analytics.orders').toLowerCase()}</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Orders list ───────────────────────────── */
    if ((view.kind === 'orders' || view.kind === 'payment' || view.kind === 'fulfillment') && !detailLoading) {
      if (detailOrders.length === 0) {
        return <EmptyState message={t('analytics.noOrdersFound')} />;
      }
      return (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">{detailTotal} order{detailTotal !== 1 ? 's' : ''} total</p>
          <div className="space-y-2">
            {detailOrders.map((order) => (
              <a
                key={order.id}
                href={`/orders/${order.id}`}
                className="block p-4 rounded-lg bg-[var(--background)] hover:ring-2 hover:ring-[var(--primary)] hover:ring-opacity-50 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {order.order_id}
                  </span>
                  <StatusBadge status={order.lifecycle_status || order.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>{order.buyer_name}</span>
                  <span>{order.total_price != null ? `$${(order.total_price / 100).toFixed(2)}` : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mt-1">
                  <span>{order.item_title || '—'}</span>
                  <span>{new Date(order.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <StatusBadge status={order.payment_status} />
                  {order.fulfillment_status && <StatusBadge status={order.fulfillment_status} />}
                </div>
              </a>
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      );
    }

    /* ── Products list ─────────────────────────── */
    if (view.kind === 'products' && !detailLoading) {
      if (detailProducts.length === 0) {
        return <EmptyState message={t('analytics.noProductsFound')} />;
      }
      return (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">{detailTotal} product{detailTotal !== 1 ? 's' : ''} total</p>
          <div className="space-y-2">
            {detailProducts.map((product) => (
              <a
                key={product.id}
                href={`/products/${product.id}`}
                className="flex items-center gap-3 p-4 rounded-lg bg-[var(--background)] hover:ring-2 hover:ring-[var(--primary)] hover:ring-opacity-50 transition-all"
              >
                {product.images?.[0] ? (
                  <img
                    src={product.images[0]}
                    alt={product.title_raw}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[var(--card-bg)] flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-[var(--text-muted)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{product.title_raw}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {product.price != null ? `$${(product.price / 100).toFixed(2)}` : '—'}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{product.source}</span>
                    {product.etsy_listing_id && (
                      <StatusBadge status="published" />
                    )}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              </a>
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </div>
      );
    }

    /* ── Listing jobs detail ───────────────────── */
    if (view.kind === 'listings' && products) {
      const jobs = products.listing_jobs;
      const jTotal = jobs.total || 1;
      return (
        <div className="space-y-6">
          <StatTile label={t('analytics.totalJobs')} value={jobs.total.toLocaleString()} />
          <div className="space-y-3">
            <ProgressRow label={t('analytics.successful')} value={jobs.successful} total={jTotal} color="bg-emerald-500" />
            <ProgressRow label={t('analytics.pending')} value={jobs.pending} total={jTotal} color="bg-blue-500" />
            <ProgressRow label={t('analytics.failed')} value={jobs.failed} total={jTotal} color="bg-red-500" />
          </div>
          {jobs.total > 0 && (
            <div className="border-t border-[var(--border-color)] pt-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('analytics.rates')}</h4>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-xl font-bold text-emerald-500">{((jobs.successful / jobs.total) * 100).toFixed(1)}%</p>
                  <p className="text-xs text-[var(--text-muted)]">{t('analytics.success')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-500">{((jobs.failed / jobs.total) * 100).toFixed(1)}%</p>
                  <p className="text-xs text-[var(--text-muted)]">{t('analytics.failure')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-blue-500">{((jobs.pending / jobs.total) * 100).toFixed(1)}%</p>
                  <p className="text-xs text-[var(--text-muted)]">{t('analytics.pending')}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Sources detail ────────────────────────── */
    if (view.kind === 'sources' && fulfillment) {
      const src = fulfillment.source_breakdown;
      const sTotal = src.manual + src.etsy_sync + src.auto || 1;
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-[var(--background)]">
              <p className="text-2xl font-bold text-violet-500">{src.manual}</p>
              <p className="text-xs text-[var(--text-muted)]">{t('analytics.manual')}</p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--background)]">
              <p className="text-2xl font-bold text-blue-500">{src.etsy_sync}</p>
              <p className="text-xs text-[var(--text-muted)]">{t('analytics.etsySync')}</p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--background)]">
              <p className="text-2xl font-bold text-emerald-500">{src.auto}</p>
              <p className="text-xs text-[var(--text-muted)]">{t('analytics.automatic')}</p>
            </div>
          </div>
          <ProgressRow label={t('analytics.manual')} value={src.manual} total={sTotal} color="bg-violet-500" />
          <ProgressRow label={t('analytics.etsySync')} value={src.etsy_sync} total={sTotal} color="bg-blue-500" />
          <ProgressRow label={t('analytics.automatic')} value={src.auto} total={sTotal} color="bg-emerald-500" />
        </div>
      );
    }

    /* ── Supplier performance detail ───────────── */
    if (view.kind === 'suppliers' && fulfillment && isOwner) {
      const entries = Object.entries(fulfillment.supplier_performance);
      if (entries.length === 0) return <EmptyState message={t('analytics.noSupplierData')} />;
      const maxShipments = Math.max(...entries.map(([, d]) => d.shipment_count), 1);
      return (
        <div className="space-y-4">
          {entries
            .sort(([, a], [, b]) => b.shipment_count - a.shipment_count)
            .map(([supplierId, data]) => (
              <div key={supplierId} className="p-4 rounded-lg bg-[var(--background)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{t('analytics.supplier')} #{supplierId}</span>
                  <span className="text-sm font-bold text-[var(--primary)]">{data.shipment_count} {t('analytics.shipments')}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--card-bg)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--primary)] transition-all duration-500"
                    style={{ width: `${(data.shipment_count / maxShipments) * 100}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      );
    }

    if (detailLoading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
        </div>
      );
    }

    return <EmptyState message={t('analytics.noDataAvailable')} />;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-screen w-full max-w-xl bg-[var(--card-bg)] shadow-2xl z-50 flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)] capitalize">{getTitle()}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--background)] transition"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-behavior-contain p-5">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </>
  );
}

/* ── Small helper components for the drawer ──────────────────── */

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 rounded-lg bg-[var(--background)] text-center">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function TrendTile({ label, value, trend }: { label: string; value: string | number; trend: number }) {
  const positive = trend >= 0;
  return (
    <div className="p-4 rounded-lg bg-[var(--background)]">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-lg font-bold text-[var(--text-primary)]">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <div className="flex items-center gap-1 mt-1">
        {positive ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
        <span className={cn('text-xs font-semibold', positive ? 'text-emerald-500' : 'text-red-500')}>
          {positive ? '+' : ''}{trend.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">{value} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--background)] overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)]">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--background)] transition disabled:opacity-40"
      >
        <ChevronLeft className="w-4 h-4" /> {t('common.previous')}
      </button>
      <span className="text-sm text-[var(--text-muted)]">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--background)] transition disabled:opacity-40"
      >
        {t('common.next')} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Package className="w-12 h-12 text-[var(--text-muted)] mb-3" />
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

/* ================================================================== */
/*  Main page                                                          */
/* ================================================================== */

function AnalyticsContent() {
  const { user } = useAuth();
  const { selectedShop, selectedShopIds, selectedShops, isLoading: shopLoading } = useShop();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [orders, setOrders] = useState<OrderAnalytics | null>(null);
  const [products, setProducts] = useState<ProductAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailView, setDetailView] = useState<DetailView>(null);
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [showDateRangeMenu, setShowDateRangeMenu] = useState(false);

  const isOwner = user?.role?.toLowerCase() === 'owner';
  const shopIds = selectedShopIds && selectedShopIds.length > 0 ? selectedShopIds : undefined;
  const shopId = !shopIds ? selectedShop?.id : undefined;

  const { start: startDate, end: endDate } = useMemo(
    () => dateRangeToParams(dateRange),
    [dateRange]
  );

  const loadAnalytics = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const [overviewData, ordersData, productsData] = await Promise.all([
        analyticsApi.getOverview(shopId, forceRefresh, shopIds, startDate, endDate),
        analyticsApi.getOrders(shopId, forceRefresh, shopIds, startDate, endDate),
        analyticsApi.getProducts(shopId, forceRefresh, shopIds, startDate, endDate),
      ]);
      setOverview(overviewData);
      setOrders(ordersData);
      setProducts(productsData);
    } catch (err: unknown) {
      const error = err as { detail?: string };
      showToast(error?.detail || t('analytics.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [shopId, shopIds, startDate, endDate, showToast, t]);

  useEffect(() => {
    if (shopLoading) return;
    loadAnalytics();
  }, [loadAnalytics, shopLoading]);

  if (loading || shopLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  const orderTotal = orders
    ? Object.values(orders.status_breakdown).reduce((a, b) => a + b, 0)
    : 0;
  const paymentTotal = orders
    ? orders.payment_breakdown.paid + orders.payment_breakdown.unpaid
    : 0;
  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      <DisconnectedShopBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {t('analytics.title')}
          </h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">
            {selectedShop ? `Performance overview for ${selectedShop.display_name}` : 'Performance overview'}
            <span className="ml-2 text-xs">— {t('analytics.clickCardDetails')}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date range dropdown (matches financials page style) */}
          <div className="relative">
            <button
              onClick={() => setShowDateRangeMenu(!showDateRangeMenu)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 transition-colors min-w-[180px] shadow-sm"
            >
              <Calendar className="w-4 h-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="text-sm font-medium flex-1 text-left truncate">
                {dateRangeToLabel(dateRange, t)}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showDateRangeMenu ? 'rotate-180' : ''}`} />
            </button>

            {showDateRangeMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowDateRangeMenu(false)}
                />
                <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('financials.dateRange') || 'Date range'}
                    </p>
                  </div>
                  <div className="py-1">
                    {(['7d', '30d', '90d', '12m', 'all'] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => {
                          setDateRange(preset);
                          setShowDateRangeMenu(false);
                        }}
                        className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                          dateRange === preset
                            ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <span className="text-sm">{dateRangeToLabel(preset, t)}</span>
                        {dateRange === preset && (
                          <CheckCircle strokeWidth={1.5} className="ml-auto w-4 h-4 flex-shrink-0 text-slate-900 dark:text-slate-100" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => loadAnalytics(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--background)] transition disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {loading ? t('analytics.refreshing') : t('analytics.refresh')}
          </button>
        </div>
      </div>

      {/* ── Revenue & Order KPIs ─────────────────────────────── */}
      {overview && (
        <>
          <SectionHeader title={t('analytics.revenueOrders')} subtitle={t('analytics.keyIndicators')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title={t('analytics.totalRevenue')}
              value={formatAnalyticsRevenue(overview.total_revenue, overview.converted_total_revenue, overview.converted_currency)}
              icon={DollarSign}
              onClick={() => setDetailView({ kind: 'revenue' })}
            />
            <KpiCard
              title={t('analytics.totalOrders')}
              value={overview.total_orders}
              icon={ShoppingCart}
              onClick={() => setDetailView({ kind: 'orders' })}
            />
            <KpiCard
              title={t('analytics.avgOrderValue')}
              value={formatAnalyticsRevenue(overview.avg_order_value, overview.converted_avg_order_value, overview.converted_currency)}
              icon={BarChart3}
            />
            <KpiCard
              title={t('analytics.revenue7d')}
              value={formatAnalyticsRevenue(overview.revenue_7d, overview.converted_revenue_7d, overview.converted_currency)}
              icon={TrendingUp}
              trend={overview.revenue_7d_trend}
              trendLabel={t('analytics.vsPrev7d')}
              onClick={() => setDetailView({ kind: 'revenue' })}
            />
          </div>
        </>
      )}

      {/* ── Order Status & Payment ───────────────────────────── */}
      {orders && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order status */}
          <ClickableCard>
            <SectionHeader title={t('analytics.orderStatus')} subtitle={`${orderTotal} total orders`} />
            <div className="space-y-4">
              <BarItem label={t('analytics.completed')} value={orders.status_breakdown.completed} total={orderTotal} color="bg-emerald-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'completed' })} />
              <BarItem label={t('analytics.processing')} value={orders.status_breakdown.processing} total={orderTotal} color="bg-amber-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'processing' })} />
              <BarItem label={t('analytics.inTransit')} value={orders.status_breakdown.in_transit} total={orderTotal} color="bg-blue-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'in_transit' })} />
              <BarItem label={t('analytics.cancelled')} value={orders.status_breakdown.cancelled} total={orderTotal} color="bg-red-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'cancelled' })} />
              <BarItem label={t('analytics.refunded')} value={orders.status_breakdown.refunded} total={orderTotal} color="bg-orange-500" onClick={() => setDetailView({ kind: 'orders', statusFilter: 'refunded' })} />
            </div>
          </ClickableCard>

          {/* Payment breakdown */}
          <ClickableCard>
            <SectionHeader title={t('analytics.paymentStatus')} subtitle={`${paymentTotal} total orders`} />
            <div className="grid grid-cols-2 gap-4 mb-6">
              <DonutStat
                label={t('analytics.paid')}
                value={orders.payment_breakdown.paid}
                total={paymentTotal}
                color="bg-emerald-100 text-emerald-600"
                icon={CheckCircle}
                onClick={() => setDetailView({ kind: 'payment', paymentFilter: 'paid' })}
              />
              <DonutStat
                label={t('analytics.unpaid')}
                value={orders.payment_breakdown.unpaid}
                total={paymentTotal}
                color="bg-amber-100 text-amber-600"
                icon={AlertTriangle}
                onClick={() => setDetailView({ kind: 'payment', paymentFilter: 'unpaid' })}
              />
            </div>

            {paymentTotal > 0 && (
              <div className="h-4 rounded-full overflow-hidden flex bg-[var(--background)]">
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(orders.payment_breakdown.paid / paymentTotal) * 100}%` }}
                />
                <div
                  className="bg-amber-400 transition-all duration-500"
                  style={{ width: `${(orders.payment_breakdown.unpaid / paymentTotal) * 100}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between mt-2 text-xs text-[var(--text-muted)]">
              <span>{t('analytics.paid')} ({paymentTotal > 0 ? ((orders.payment_breakdown.paid / paymentTotal) * 100).toFixed(0) : 0}%)</span>
              <span>{t('analytics.unpaid')} ({paymentTotal > 0 ? ((orders.payment_breakdown.unpaid / paymentTotal) * 100).toFixed(0) : 0}%)</span>
            </div>
          </ClickableCard>
        </div>
      )}

      {/* ── Products ─────────────────────────────────────────── */}
      {products && (
        <>
          <SectionHeader title={t('analytics.products')} subtitle={t('analytics.inventoryOverview')} />
          <ClickableCard onClick={() => setDetailView({ kind: 'products' })}>
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="text-center p-4 rounded-lg bg-[var(--background)]">
                <Package className="w-6 h-6 text-[var(--primary)] mx-auto mb-2" />
                <p className="text-3xl font-bold text-[var(--text-primary)]">{products.total_products}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('analytics.total')}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[var(--background)]">
                <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                <p className="text-3xl font-bold text-[var(--text-primary)]">{products.published_products}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('analytics.published')}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-[var(--background)]">
                <FileText className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <p className="text-3xl font-bold text-[var(--text-primary)]">{products.draft_products}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{t('analytics.drafts')}</p>
              </div>
            </div>
            {products.total_products > 0 && (
              <>
                <div className="h-3 rounded-full overflow-hidden flex bg-[var(--background)] mb-2">
                  <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${(products.published_products / products.total_products) * 100}%` }} />
                  <div className="bg-amber-400 transition-all duration-700" style={{ width: `${(products.draft_products / products.total_products) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>Published ({((products.published_products / products.total_products) * 100).toFixed(0)}%)</span>
                  <span>Drafts ({((products.draft_products / products.total_products) * 100).toFixed(0)}%)</span>
                </div>
              </>
            )}
          </ClickableCard>
        </>
      )}

      {/* ── Revenue Breakdown ───────────────────────────────── */}
      {overview && (
        <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-6">
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-5">Revenue Breakdown</h3>
          <div className="space-y-5">
            {[
              { label: 'Last 7 days', value: overview.revenue_7d, converted: overview.converted_revenue_7d, color: 'bg-blue-500' },
              { label: 'Last 30 days', value: overview.revenue_30d, converted: overview.converted_revenue_30d, color: 'bg-indigo-500' },
              { label: `Total (${dateRangeToLabel(dateRange, t)})`, value: overview.total_revenue, converted: overview.converted_total_revenue, color: 'bg-emerald-500' },
            ].map((item) => {
              const max = Math.max(overview.total_revenue, 1);
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-[var(--text-secondary)]">{item.label}</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {formatAnalyticsRevenue(item.value, item.converted, overview.converted_currency)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[var(--background)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                      style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cache timestamp */}
      {overview?.computed_at && (
        <p className="text-xs text-[var(--text-muted)] text-right">
          {t('analytics.dataCachedAt')} {new Date(overview.computed_at).toLocaleString()}
        </p>
      )}

      {/* Detail Drawer */}
      {detailView && (
        <DetailDrawer
          view={detailView}
          onClose={() => setDetailView(null)}
          overview={overview}
          orders={orders}
          products={products}
          fulfillment={null}
          shopId={shopId}
          isOwner={isOwner}
        />
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <AnalyticsContent />
    </DashboardLayout>
  );
}
