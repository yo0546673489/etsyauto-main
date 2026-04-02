'use client';

/**
 * Orders Page — עיצוב מחודש עברי
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SearchInput, TableCheckbox, Pagination } from '@/components/ui/DataTable';
import {
  CheckCircle2,
  RotateCcw,
  XCircle,
  RefreshCcw,
  Clock,
  Truck,
  Plus,
  Download,
  SlidersHorizontal,
  Eye,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ordersApi, Order, OrderStats } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useShop } from '@/lib/shop-context';
import { useLanguage } from '@/lib/language-context';
import { DisconnectedShopBanner } from '@/components/ui/DisconnectedShopBanner';
import { SyncStatusModal, useRecentSync } from '@/components/modals/SyncStatusModal';
import { useAuth } from '@/lib/auth-context';
import {
  PAYMENT_STATUS_STYLES,
  normalizeOrderStatus,
  normalizePaymentStatus,
} from '@/lib/order-status';

/* ────────── Badge תשלום ────────── */
function PaymentBadge({ status }: { status: string }) {
  const normalized = normalizePaymentStatus(status);
  const isPaid = normalized === 'paid';
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
      isPaid
        ? 'bg-green-50 text-green-700'
        : 'bg-yellow-50 text-yellow-700'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', isPaid ? 'bg-green-500' : 'bg-yellow-500')} />
      {isPaid ? 'שולם' : 'לא שולם'}
    </span>
  );
}

/* ────────── Badge סטטוס הזמנה ────────── */
function OrderBadge({ status }: { status: string }) {
  const normalized = normalizeOrderStatus(status);
  const map: Record<string, { label: string; cls: string }> = {
    completed:  { label: 'הושלם',  cls: 'bg-green-50 text-green-700' },
    in_transit: { label: 'בדרך',   cls: 'bg-blue-50 text-blue-700' },
    processing: { label: 'בתהליך', cls: 'bg-sky-50 text-sky-700' },
    cancelled:  { label: 'בוטל',   cls: 'bg-red-50 text-red-600' },
    refunded:   { label: 'הוחזר',  cls: 'bg-gray-100 text-gray-600' },
  };
  const cfg = map[normalized] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-flex px-2.5 py-1 rounded-md text-xs font-semibold', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

/* ────────── אווטר לקוח ────────── */
const AVATAR_COLORS = [
  'bg-[#006d43]', 'bg-blue-500', 'bg-orange-400',
  'bg-purple-500', 'bg-red-400', 'bg-teal-500',
];
function CustomerAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0', color)}>
      {initials}
    </div>
  );
}

/* ────────── כרטיס סטטיסטיקה ────────── */
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
  borderColor: string;
  isActive?: boolean;
  loading?: boolean;
  onClick: () => void;
}
function StatCard({ label, value, icon, iconBg, borderColor, isActive, loading, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl p-5 border-2 text-right transition-all hover:shadow-md w-full',
        borderColor,
        isActive && 'ring-2 ring-[#006d43] ring-offset-1'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0', iconBg)}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="w-12 h-9 bg-gray-100 animate-pulse rounded mb-1" />
      ) : (
        <p className="text-3xl font-black text-gray-800 leading-none mb-1" dir="ltr">
          {String(value).padStart(2, '0')}
        </p>
      )}
      <p className="text-sm text-gray-400 font-medium">{label}</p>
    </button>
  );
}

/* ────────── תוכן הדף ────────── */
function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { selectedShopId, selectedShopIds, shops } = useShop();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const { wasSyncedRecently } = useRecentSync('orders');

  const statusFilter  = searchParams.get('status')         || undefined;
  const paymentFilter = searchParams.get('payment_status') || undefined;

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const data = await ordersApi.getStats({ shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined });
      setStats(data);
    } catch {}
    finally { setLoadingStats(false); }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await ordersApi.getAll(currentPage, pageSize, statusFilter, paymentFilter, {
        shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined,
      });
      setOrders(data.orders);
      setTotal(data.total);
    } catch (e: any) {
      showToast(e.detail || t('orders.loadFailed'), 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadStats(); }, [selectedShopIds]);
  useEffect(() => { setCurrentPage(1); }, [statusFilter, paymentFilter]);
  useEffect(() => { loadOrders(); }, [currentPage, pageSize, selectedShopIds, statusFilter, paymentFilter]);
  useEffect(() => { ordersApi.markViewed().catch(() => null); }, []);

  const handleSyncOrders = async () => {
    if (wasSyncedRecently) {
      if (!confirm(t('orders.syncConfirm'))) return;
    }
    try {
      setSyncing(true);
      const result = await ordersApi.sync({
        forceFullSync: total === 0,
        shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined,
        shopId: selectedShopId,
      });
      if (result.task_id) {
        setSyncTaskId(result.task_id);
        setShowSyncModal(true);
      } else {
        showToast(t('orders.syncSuccess'), 'success');
        await loadOrders();
        await loadStats();
      }
    } catch (e: any) {
      showToast(e.detail || t('orders.syncFailed'), 'error');
    } finally { setSyncing(false); }
  };

  const filteredOrders = orders.filter(o => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return o.order_id.toLowerCase().includes(q) || o.buyer_name.toLowerCase().includes(q) || o.buyer_email.toLowerCase().includes(q);
  });

  const toggleSelectAll = () =>
    setSelectedOrders(selectedOrders.length === filteredOrders.length ? [] : filteredOrders.map(o => o.id));
  const toggleSelect = (id: number) =>
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatAmount = (order: Order) => {
    if (order.total_price == null) return '—';
    return `${order.currency || 'USD'} ${order.total_price.toFixed(2)}`;
  };

  const totalPages = Math.ceil(total / pageSize);

  /* ── כרטיסי הסטטיסטיקות ── */
  const statCards = [
    {
      key: 'paid',
      label: 'שולמו',
      value: stats?.payment_status.paid ?? 0,
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      iconBg: 'bg-green-100',
      borderColor: 'border-green-200',
      filter: () => router.push('/orders?payment_status=paid'),
      active: paymentFilter === 'paid',
    },
    {
      key: 'unpaid',
      label: 'לא שולמו',
      value: stats?.payment_status.unpaid ?? 0,
      icon: <Clock className="w-5 h-5 text-red-400" />,
      iconBg: 'bg-red-50',
      borderColor: 'border-red-200',
      filter: () => router.push('/orders?payment_status=unpaid'),
      active: paymentFilter === 'unpaid',
    },
    {
      key: 'processing',
      label: 'בתהליך',
      value: stats?.order_status.processing ?? 0,
      icon: <RefreshCcw className="w-5 h-5 text-blue-500" />,
      iconBg: 'bg-blue-50',
      borderColor: 'border-blue-200',
      filter: () => router.push('/orders?status=processing'),
      active: statusFilter === 'processing',
    },
    {
      key: 'cancelled',
      label: 'בוטלו',
      value: stats?.order_status.cancelled ?? 0,
      icon: <XCircle className="w-5 h-5 text-red-500" />,
      iconBg: 'bg-red-50',
      borderColor: 'border-red-200',
      filter: () => router.push('/orders?status=cancelled'),
      active: statusFilter === 'cancelled',
    },
    {
      key: 'refunded',
      label: 'הוחזרו',
      value: stats?.order_status.refunded ?? 0,
      icon: <RotateCcw className="w-5 h-5 text-gray-500" />,
      iconBg: 'bg-gray-100',
      borderColor: 'border-gray-200',
      filter: () => router.push('/orders?status=refunded'),
      active: statusFilter === 'refunded',
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6" dir="rtl">
      <DisconnectedShopBanner />

      {/* ── כותרת ── */}
      <div className="flex items-start justify-between">
        <div className="text-right">
          <h1 className="text-3xl font-black text-gray-800">ניהול הזמנות</h1>
          <p className="text-gray-400 mt-1 text-sm">סקירה כללית של הפעילות העסקית והמכירות שלך היום.</p>
        </div>
        {(user?.role === 'owner' || user?.role === 'admin') && (
          <button
            onClick={handleSyncOrders}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#006d43] hover:bg-[#005a37] text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
          >
            <Plus className={cn('w-4 h-4', syncing && 'animate-spin')} />
            {syncing ? 'מסנכרן...' : 'סנכרן הזמנות'}
          </button>
        )}
      </div>

      {/* ── כרטיסי סטטיסטיקות — שורה אחת ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map(c => (
          <StatCard
            key={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            iconBg={c.iconBg}
            borderColor={c.borderColor}
            isActive={c.active}
            loading={loadingStats}
            onClick={c.filter}
          />
        ))}
      </div>

      {/* ── טבלת עסקאות ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* header of table section */}
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-lg font-black text-gray-800">עסקאות אחרונות</h2>
          <div className="flex items-center gap-3 flex-wrap">
            {/* חיפוש */}
            <div dir="rtl">
              <SearchInput
                placeholder="חפש הזמנה..."
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
            {/* ייצא */}
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
              <Download className="w-4 h-4" />
              ייצא נתונים
            </button>
            {/* סינון מתקדם */}
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
              סינון מתקדם
            </button>
            {/* נקה סינון */}
            {(statusFilter || paymentFilter) && (
              <button
                onClick={() => router.push('/orders')}
                className="text-sm text-[#006d43] font-semibold hover:underline"
              >
                נקה סינון
              </button>
            )}
          </div>
        </div>

        {/* table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-[#006d43] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-gray-400 text-lg">אין הזמנות להצגה</p>
              {searchQuery && <p className="text-gray-400 text-sm mt-2">נסה לשנות את החיפוש</p>}
            </div>
          ) : (
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="py-3.5 px-5 w-10">
                    <TableCheckbox
                      checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                      indeterminate={selectedOrders.length > 0 && selectedOrders.length < filteredOrders.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">מספר הזמנה</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">חנות</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">תאריך</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">סכום</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">מעקב</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">תשלום</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide">סטטוס</th>
                  <th className="py-3.5 px-5 text-xs font-semibold text-gray-400 tracking-wide text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-4 px-5">
                      <TableCheckbox checked={selectedOrders.includes(order.id)} onChange={() => toggleSelect(order.id)} />
                    </td>

                    {/* מספר הזמנה + תמונה */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        {order.item_image && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
                            <img
                              src={order.item_image}
                              alt={order.item_title || ''}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <span className="font-bold text-[#006d43] text-sm" dir="ltr">{order.order_id}</span>
                      </div>
                    </td>

                    {/* חנות */}
                    <td className="py-4 px-5">
                      <span className="font-semibold text-gray-800 text-sm">
                        {shops.find(s => s.id === order.shop_id)?.display_name || '—'}
                      </span>
                    </td>

                    {/* תאריך */}
                    <td className="py-4 px-5 text-sm text-gray-500">{formatDate(order.created_at)}</td>

                    {/* סכום */}
                    <td className="py-4 px-5">
                      <span className="font-bold text-gray-800 text-sm" dir="ltr">{formatAmount(order)}</span>
                    </td>

                    {/* מעקב */}
                    <td className="py-4 px-5">
                      {order.tracking_code ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg text-gray-700">
                          <Truck className="w-3.5 h-3.5 text-gray-400" />
                          {order.tracking_code}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>

                    {/* תשלום */}
                    <td className="py-4 px-5">
                      <PaymentBadge status={order.payment_status} />
                    </td>

                    {/* סטטוס */}
                    <td className="py-4 px-5">
                      <OrderBadge status={order.lifecycle_status || order.status} />
                    </td>

                    {/* פעולות */}
                    <td className="py-4 px-5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => router.push(`/orders/${order.id}`)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#006d43] hover:bg-green-50 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => showToast(t('orders.deleteComingSoon'), 'info')}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* pagination */}
        {!loading && filteredOrders.length > 0 && (
          <div className="border-t border-gray-100">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      <SyncStatusModal
        isOpen={showSyncModal}
        onClose={() => { setShowSyncModal(false); setSyncTaskId(null); }}
        taskId={syncTaskId}
        syncType="orders"
        onComplete={() => { loadOrders(); loadStats(); }}
      />
    </div>
  );
}

export default function OrdersPage() {
  return <DashboardLayout><OrdersContent /></DashboardLayout>;
}
