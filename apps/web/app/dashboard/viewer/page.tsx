'use client';

/**
 * Viewer Dashboard
 * Read-only analytics view (no operational controls)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';
import { useShop } from '@/lib/shop-context';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { dashboardApi, type DashboardStats, type DashboardOrder } from '@/lib/api';
import { PAYMENT_STATUS_STYLES, normalizePaymentStatus } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import {
  Package,
  ShoppingCart,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown as TrendingDownIcon,
  Link as LinkIcon,
  Clock,
  DollarSign,
  Eye,
  BarChart3,
} from 'lucide-react';

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
}

function StatCard({ title, value, icon: Icon, trend, trendLabel }: StatCardProps) {
  const hasTrend = trend !== undefined;
  const isPositive = trend && trend > 0;

  return (
    <div className="p-6 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[var(--text-secondary)] text-sm font-medium">{title}</h3>
        <div className="w-10 h-10 rounded-lg bg-[var(--primary-bg)] flex items-center justify-center">
          <Icon className="w-5 h-5 text-[var(--text-primary)]" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        {hasTrend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            isPositive ? "text-green-600" : "text-red-600"
          )}>
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDownIcon className="w-3 h-3" />
            )}
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
      {trendLabel && (
        <p className="text-xs text-[var(--text-muted)] mt-1">{trendLabel}</p>
      )}
    </div>
  );
}

function ViewerDashboardContent() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { selectedShop } = useShop();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Load dashboard data
  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [statsData, ordersData] = await Promise.all([
          dashboardApi.getStats({ shopId: selectedShop?.id }),
          dashboardApi.getRecentOrders(5, { shopId: selectedShop?.id }),
        ]);
        setStats(statsData);
        setRecentOrders(ordersData.orders || []);
      } catch (error: any) {
        showToast(error.detail || 'Failed to load dashboard', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [selectedShop, showToast]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Hi, {user?.name || 'there'}. Shop Analytics Overview
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            Read-only view of shop performance and metrics
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)]">
          <Eye className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-sm text-[var(--text-secondary)]">Viewer Mode</span>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Orders"
          value={stats.total_orders || 0}
          icon={ShoppingCart}
          trend={stats.changes?.orders}
          trendLabel="vs last period"
        />
        <StatCard
          title={t('dashboard.publishedProducts')}
          value={stats.published_products ?? stats.total_products ?? 0}
          icon={Package}
          trend={stats.changes?.products}
          trendLabel="vs last period"
        />
        <StatCard
          title="Active Listings"
          value={stats.active_listings || 0}
          icon={Clock}
          trend={stats.changes?.listings}
          trendLabel="vs last period"
        />
        <StatCard
          title="Total Customers"
          value={stats.total_customers || 0}
          icon={DollarSign}
          trend={stats.changes?.customers}
          trendLabel="vs last period"
        />
      </div>

      {/* Recent Orders (Read-Only) */}
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Recent Orders
          </h2>
          <Link
            href="/orders"
            className="text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
          >
            View All
            <LinkIcon className="w-4 h-4" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-[var(--text-muted)] text-center py-8">
            No recent orders
          </p>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border-color)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)]">
                      {order.order_id}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {order.buyer_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-[var(--text-primary)]">
                      ${order.total_price?.toFixed(2) || '0.00'}
                    </p>
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full",
                      PAYMENT_STATUS_STYLES[normalizePaymentStatus(order.payment_status)]
                    )}>
                      {order.payment_status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Read-Only Access
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              You have viewer permissions. You can see analytics and order data but cannot make changes. Contact an admin for operational access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ViewerDashboardPage() {
  return (
    <DashboardLayout>
      <ViewerDashboardContent />
    </DashboardLayout>
  );
}
