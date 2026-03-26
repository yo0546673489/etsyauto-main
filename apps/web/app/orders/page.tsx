'use client';

/**
 * Orders Page - Vuexy Style
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { SearchInput, PageSizeDropdown, TableActions, Pagination, TableCheckbox } from '@/components/ui/DataTable';
import { Calendar, CheckCircle, RotateCcw, XCircle, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ordersApi, Order, OrderStats } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useShop } from '@/lib/shop-context';
import { useLanguage } from '@/lib/language-context';
import { DisconnectedShopBanner } from '@/components/ui/DisconnectedShopBanner';
import { SyncStatusModal, useRecentSync } from '@/components/modals/SyncStatusModal';
import { useAuth } from '@/lib/auth-context';
import {
  ORDER_STATUS_BADGE_CLASSES,
  ORDER_STATUS_CARD_COLORS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  normalizeOrderStatus,
  normalizePaymentStatus,
} from '@/lib/order-status';

function PaymentStatus({ status }: { status: string }) {
  const normalized = normalizePaymentStatus(status);
  const isPaid = normalized === 'paid';
  return (
    <div className="flex items-center gap-2">
      <span className={isPaid ? 'w-2 h-2 rounded-full bg-green-600' : 'w-2 h-2 rounded-full bg-yellow-500'} />
      <span className={isPaid ? 'text-sm text-green-600' : 'text-sm text-yellow-700'}>
        {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
      </span>
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  const normalized = normalizeOrderStatus(status);
  
  let badgeClass = '';
  switch (normalized) {
    case 'completed':
      badgeClass = 'bg-green-50 text-green-700';
      break;
    case 'in_transit':
      badgeClass = 'bg-yellow-50 text-yellow-700';
      break;
    case 'cancelled':
      badgeClass = 'bg-red-50 text-red-700';
      break;
    case 'refunded':
      badgeClass = 'bg-gray-200 text-gray-800';
      break;
    default:
      badgeClass = 'bg-gray-100 text-gray-700';
  }
  
  return <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${badgeClass}`}>{ORDER_STATUS_LABELS[normalized]}</span>;
}

function CustomerAvatar({ customer }: { customer: { name: string; initials: string } }) {
  const colors = ['bg-[var(--primary)]', 'bg-[var(--success)]', 'bg-[var(--warning)]', 'bg-[var(--info)]', 'bg-[var(--danger)]'];
  const colorIndex = customer.name.charCodeAt(0) % colors.length;
  return <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium', colors[colorIndex])}>{customer.initials}</div>;
}

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { selectedShopId, selectedShopIds } = useShop();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncTaskId, setSyncTaskId] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const { wasSyncedRecently } = useRecentSync('orders');

  // Sync orders from Etsy
  const handleSyncOrders = async () => {
    if (wasSyncedRecently) {
      const proceed = confirm(t('orders.syncConfirm'));
      if (!proceed) return;
    }
    try {
      setSyncing(true);
      const result = await ordersApi.sync({ forceFullSync: total === 0, shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined, shopId: selectedShopId });
      if (result.task_id) {
        setSyncTaskId(result.task_id);
        setShowSyncModal(true);
      } else {
        showToast(t('orders.syncSuccess'), 'success');
        await loadOrders();
        await loadStats();
      }
    } catch (error: any) {
      console.error('Failed to sync orders:', error);
      showToast(error.detail || t('orders.syncFailed'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const statusFilter = searchParams.get('status') || undefined;
  const paymentFilter = searchParams.get('payment_status') || undefined;

  // Load stats
  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const data = await ordersApi.getStats({ shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined });
      setStats(data);
    } catch (error: any) {
      console.error('Failed to load order stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load orders
  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await ordersApi.getAll(currentPage, pageSize, statusFilter, paymentFilter, {
        shopIds: selectedShopIds.length > 0 ? selectedShopIds : undefined,
      });
      setOrders(data.orders);
      setTotal(data.total);
    } catch (error: any) {
      console.error('Failed to load orders:', error);
      showToast(error.detail || t('orders.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [selectedShopIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter]);

  useEffect(() => {
    loadOrders();
  }, [currentPage, pageSize, selectedShopIds, statusFilter, paymentFilter]);

  useEffect(() => {
    ordersApi.markViewed().catch(() => null);
  }, []);

  // Filter orders by search query
  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.order_id.toLowerCase().includes(query) ||
      order.buyer_name.toLowerCase().includes(query) ||
      order.buyer_email.toLowerCase().includes(query)
    );
  });

  const toggleSelectAll = () => setSelectedOrders(selectedOrders.length === filteredOrders.length ? [] : filteredOrders.map(o => o.id));
  const toggleSelect = (id: number) => setSelectedOrders(prev => prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const orderStatsData = [
    { key: 'processing', title: t('orders.status.processing'), value: stats?.order_status.processing || 0, icon: <Calendar className="w-6 h-6" /> },
    { key: 'in_transit', title: t('orders.status.inTransit'), value: stats?.order_status.in_transit || 0, icon: <RefreshCcw className="w-6 h-6" /> },
    { key: 'completed', title: t('orders.status.completed'), value: stats?.order_status.completed || 0, icon: <CheckCircle className="w-6 h-6" /> },
    { key: 'cancelled', title: t('orders.status.cancelled'), value: stats?.order_status.cancelled || 0, icon: <XCircle className="w-6 h-6" /> },
    { key: 'refunded', title: t('orders.status.refunded'), value: stats?.order_status.refunded || 0, icon: <RotateCcw className="w-6 h-6" /> },
  ] as const;

  const paymentStatsData = [
    { key: 'paid', title: t('orders.payment.paid'), value: stats?.payment_status.paid || 0 },
    { key: 'unpaid', title: t('orders.payment.unpaid'), value: stats?.payment_status.unpaid || 0 },
  ] as const;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <DisconnectedShopBanner />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start">
        {/* Order Status - Left Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.orderStatus')}</h2>
            {(statusFilter || paymentFilter) && (
              <button
                onClick={() => router.push('/orders')}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                {t('orders.clearFilters')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderStatsData.map((stat) => {
              const colors = ORDER_STATUS_CARD_COLORS[stat.key];
              const isActive = statusFilter === stat.key;
              
              let borderColorClass = '';
              let iconColorClass = '';
              
              switch (stat.key) {
                case 'completed':
                  borderColorClass = 'border-green-300';
                  iconColorClass = 'text-green-600';
                  break;
                case 'in_transit':
                  borderColorClass = 'border-yellow-300';
                  iconColorClass = 'text-yellow-600';
                  break;
                case 'cancelled':
                  borderColorClass = 'border-red-300';
                  iconColorClass = 'text-red-600';
                  break;
                case 'refunded':
                  borderColorClass = 'border-gray-400';
                  iconColorClass = 'text-gray-600';
                  break;
                default:
                  borderColorClass = 'border-gray-300';
                  iconColorClass = 'text-gray-600';
              }
              
              return (
                <button
                  key={stat.key}
                  onClick={() => router.push(`/orders?status=${stat.key}`)}
                  className={cn(
                    'bg-[var(--card-bg)] border-2 rounded-xl p-5 text-left transition-colors hover:border-[var(--primary)]',
                    borderColorClass,
                    isActive && 'ring-1 ring-[var(--primary)]'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      {loadingStats ? (
                        <div className="w-16 h-9 bg-[var(--background)] animate-pulse rounded" />
                      ) : (
                        <p className="text-3xl font-bold text-[var(--text-primary)]">{stat.value.toLocaleString()}</p>
                      )}
                      <p className="text-[var(--text-muted)] text-sm mt-1">{stat.title}</p>
                    </div>
                    <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', colors.bg)}>
                      <div className={iconColorClass}>
                        {stat.icon}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment Status - Right Column */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.paymentStatus')}</h2>
          <div className="grid grid-cols-1 gap-4">
            {paymentStatsData.map((stat) => {
              const paymentStyle = PAYMENT_STATUS_STYLES[stat.key];
              const isActive = paymentFilter === stat.key;
              const borderColorClass = stat.key === 'paid' ? 'border-green-300' : 'border-yellow-300';
              const dotColorClass = stat.key === 'paid' ? 'bg-green-600' : 'bg-yellow-500';
              
              return (
                <button
                  key={stat.key}
                  onClick={() => router.push(`/orders?payment_status=${stat.key}`)}
                  className={cn(
                    'bg-[var(--card-bg)] border-2 rounded-xl p-5 text-left transition-colors hover:border-[var(--primary)]',
                    borderColorClass,
                    isActive && 'ring-1 ring-[var(--primary)]'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      {loadingStats ? (
                        <div className="w-16 h-9 bg-[var(--background)] animate-pulse rounded" />
                      ) : (
                        <p className="text-3xl font-bold text-[var(--text-primary)]">{stat.value.toLocaleString()}</p>
                      )}
                      <p className="text-[var(--text-muted)] text-sm mt-1">{stat.title}</p>
                    </div>
                    <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', paymentStyle.bg)}>
                      <span className={cn('w-4 h-4 rounded-full', dotColorClass)} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <DashboardCard noPadding>
        <div className="p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-[var(--border-color)]">
          <div className="w-full sm:w-80"><SearchInput placeholder={t('orders.searchPlaceholder')} value={searchQuery} onChange={setSearchQuery} /></div>
          <div className="flex items-center gap-3">
            {(user?.role === 'owner' || user?.role === 'admin') && (
              <button
                onClick={handleSyncOrders}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCcw className={cn('w-4 h-4', syncing && 'animate-spin')} />
                <span>{syncing ? t('orders.syncing') : t('orders.syncOrders')}</span>
              </button>
            )}
            <PageSizeDropdown value={pageSize} onChange={setPageSize} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-[var(--text-muted)] text-lg">{t('orders.noOrders')}</p>
              {searchQuery && (
                <p className="text-[var(--text-muted)] text-sm mt-2">{t('orders.adjustSearch')}</p>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  <th className="text-left py-4 px-5 w-12"><TableCheckbox checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0} indeterminate={selectedOrders.length > 0 && selectedOrders.length < filteredOrders.length} onChange={toggleSelectAll} /></th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.order')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.date')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.customer')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.assignedTo')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.payment')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.status')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.tracking')}</th>
                  <th className="text-left py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.amount')}</th>
                  <th className="text-right py-4 px-5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{t('orders.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-[var(--border-color)] hover:bg-[var(--background)] transition-colors">
                    <td className="py-4 px-5"><TableCheckbox checked={selectedOrders.includes(order.id)} onChange={() => toggleSelect(order.id)} /></td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        {order.item_image && (
                          <div className="w-10 h-10 rounded-md overflow-hidden border border-[var(--border-color)] flex-shrink-0">
                            <img
                              src={order.item_image}
                              alt={order.item_title || order.order_id}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect fill="%23f0f0f0" width="40" height="40"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="10" dy="52%25" dx="50%25" text-anchor="middle"%3ENo%3C/text%3E%3C/svg%3E';
                              }}
                            />
                          </div>
                        )}
                        <span className="font-medium text-[var(--primary)]">{order.order_id}</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-[var(--text-muted)] text-sm">{formatDate(order.created_at)}</td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <CustomerAvatar customer={{ name: order.buyer_name, initials: order.buyer_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }} />
                        <div><p className="font-medium text-[var(--text-primary)]">{order.buyer_name}</p><p className="text-sm text-[var(--text-muted)]">{order.buyer_email}</p></div>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      {order.supplier_name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                          {order.supplier_name}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-4 px-5"><PaymentStatus status={order.payment_status} /></td>
                    <td className="py-4 px-5"><OrderStatus status={order.lifecycle_status || order.status} /></td>
                    <td className="py-4 px-5">
                      {order.tracking_code ? (
                        <span className="font-mono text-xs bg-[var(--background)] px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-primary)]">
                          {order.tracking_code}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      <span className="font-medium text-[var(--text-primary)]">
                        {order.total_price === null ? '--' : `${order.currency} ${order.total_price.toFixed(2)}`}
                      </span>
                    </td>
                    <td className="py-4 px-5"><TableActions onView={() => router.push(`/orders/${order.id}`)} onDelete={() => showToast(t('orders.deleteComingSoon'), 'info')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && filteredOrders.length > 0 && (
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={total} pageSize={pageSize} onPageChange={setCurrentPage} />
        )}
      </DashboardCard>

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
