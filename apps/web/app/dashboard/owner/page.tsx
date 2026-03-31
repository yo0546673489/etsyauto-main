'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';
import { useShop } from '@/lib/shop-context';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import OnboardingModal from '@/components/OnboardingModal';
import { DisconnectedShopBanner } from '@/components/ui/DisconnectedShopBanner';
import { onboardingApi, dashboardApi, type DashboardStats, type DashboardOrder } from '@/lib/api';
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE_CLASSES, normalizeOrderStatus } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import {
  Eye,
  ShoppingBag,
  Wallet,
  CreditCard,
  Truck,
  Plus,
  Mail,
  Tag,
} from 'lucide-react';
import { TrendChart } from '@/components/dashboard/TrendChart';
import DateRangePicker, { computeRange, type DateRange } from '@/components/dashboard/DateRangePicker';

function WelcomeHandler() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { t } = useLanguage();
  useEffect(() => {
    if (searchParams.get('welcome') === 'true') {
      showToast(t('dashboard.welcomeToast'), 'success');
      window.history.replaceState({}, '', '/dashboard/owner');
    }
  }, [searchParams, showToast]);
  return null;
}

/**
 * Stat Card matching the mockup exactly.
 * RTL layout: first child = visual RIGHT, last child = visual LEFT
 *
 * Card layout (visual, RTL):
 *   top row: [badge on RIGHT]  [icon circle on LEFT]
 *   center: label text
 *   bottom: large value
 */
interface StatCardProps {
  badge: string;
  badgeColor: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
}

function StatCard({ badge, badgeColor, icon: Icon, iconBg, iconColor, label, value }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl px-6 pt-5 pb-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/80">
      {/* RTL: first child = visual RIGHT = badge, second = visual LEFT = icon */}
      <div className="flex items-center justify-between mb-5">
        <span className={cn('text-sm font-semibold', badgeColor)}>
          {badge}
        </span>
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-[22px] h-[22px]', iconColor)} strokeWidth={1.8} />
        </div>
      </div>
      <p className="text-sm text-gray-400 text-center mb-1.5">{label}</p>
      <p className="text-[28px] leading-tight font-black text-gray-800 text-center" dir="ltr">{value}</p>
    </div>
  );
}

function OwnerDashboardContent() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { selectedShop, selectedShopIds } = useShop();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(() => computeRange('last30'));

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const status = await onboardingApi.getStatus();
        if (status.needs_onboarding) setShowOnboarding(true);
      } catch {}
    };
    if (user) checkOnboarding();
  }, [user]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const shopOpts = selectedShopIds.length > 0 ? { shopIds: selectedShopIds } : { shopId: selectedShop?.id };
        const dateOpts = { startDate: dateRange.startDate, endDate: dateRange.endDate };
        const [statsData, ordersData] = await Promise.all([
          dashboardApi.getStats({ ...shopOpts, ...dateOpts }),
          dashboardApi.getRecentOrders(5, { ...shopOpts, ...dateOpts }),
        ]);
        setStats(statsData);
        setRecentOrders(ordersData.orders || []);
      } catch (e: any) {
        showToast(e.detail || t('dashboard.loadFailed'), 'error');
      } finally {
        setLoading(false);
      }
    };
    if (!showOnboarding) load();
  }, [selectedShopIds, showOnboarding, dateRange]);

  const handleCompleteOnboarding = async (shopName: string, description: string | null) => {
    await onboardingApi.complete(shopName, description);
    setShowOnboarding(false);
  };

  const handleSkipOnboarding = async () => {
    await onboardingApi.skip();
    setShowOnboarding(false);
  };

  const shopName = selectedShop?.display_name || user?.name || '';

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#006d43]" />
      </div>
    );
  }

  const payoutAmount      = stats.available_for_payout || 0;
  const depositAmount     = stats.available_for_deposit;   // null = unknown
  const payoutLabel       = stats.payout_label || 'יתרה נוכחית';
  const totalOrders       = stats.total_orders || 0;
  const totalViews        = stats.total_views || 0;
  const todayVisits    = stats.today_visits || 0;
  // today_visits = from Etsy Stats API (often unavailable) → show totalViews only for multi-day ranges
  const isToday        = dateRange.key === 'today' || dateRange.key === 'yesterday';
  const shopViews      = todayVisits > 0 ? todayVisits : (isToday ? null : totalViews);
  const changes        = stats.changes || { products: 0, customers: 0, orders: 0, listings: 0 };

  // Format currency using shop's native currency (payout_currency from Etsy)
  // Values from API are already in decimal (divided by 100 server-side)
  const shopCurrency = stats?.payout_currency || 'ILS';
  const formatCurrency = (amount: number) => {
    try {
      const formatted = new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: shopCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(amount));
      return amount < 0 ? `-${formatted}` : formatted;
    } catch {
      const str = Math.abs(amount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return amount < 0 ? `-${shopCurrency} ${str}` : `${shopCurrency} ${str}`;
    }
  };

  // Format large numbers: 1234 → 1.2k
  const formatCompact = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
  };

  return (
    <div className="max-w-[1300px] mx-auto space-y-6">
      <Suspense fallback={null}><WelcomeHandler /></Suspense>
      <DisconnectedShopBanner />

      {/* ── Header ──
          RTL order: first child = visual RIGHT
          We want: greeting on RIGHT, date card on LEFT
          → put greeting FIRST, date card SECOND
      */}
      <div className="flex items-start justify-between">
        {/* 1st = visual RIGHT: Greeting */}
        <div className="text-right">
          <h1 className="text-3xl font-black text-gray-800">ברוך שובר!</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {shopName} - הנה עדכון על מה שקורה בחנות שלך היום.
          </p>
        </div>

        {/* 2nd = visual LEFT: Date Range Picker */}
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── 4 Stat Cards ──
          RTL: first in HTML = visual RIGHTMOST
          סדר (ימין→שמאל): יתרה נוכחית | כסף משוחרר לבנק | מספר הזמנות | צפיות בחנות
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1st = RIGHTMOST: יתרה נוכחית */}
        <StatCard
          badge={payoutAmount < 0 ? 'חוב' : 'עדכני'}
          badgeColor={payoutAmount < 0 ? 'text-red-500' : 'text-[#006d43]'}
          icon={Wallet}
          iconBg={payoutAmount < 0 ? 'bg-red-50' : 'bg-green-50'}
          iconColor={payoutAmount < 0 ? 'text-red-500' : 'text-[#006d43]'}
          label={payoutLabel}
          value={formatCurrency(payoutAmount)}
        />
        {/* 2nd: כסף משוחרר לבנק */}
        <StatCard
          badge={depositAmount && depositAmount > 0 ? 'זמין' : 'עדכני'}
          badgeColor={depositAmount && depositAmount > 0 ? 'text-[#006d43]' : 'text-[#006d43]'}
          icon={CreditCard}
          iconBg="bg-purple-50"
          iconColor="text-purple-500"
          label="כסף משוחרר לבנק"
          value={formatCurrency(depositAmount ?? 0)}
        />
        {/* 3rd: מספר הזמנות */}
        <StatCard
          badge={`${changes.orders}%+`}
          badgeColor="text-[#006d43]"
          icon={ShoppingBag}
          iconBg="bg-green-50"
          iconColor="text-[#006d43]"
          label="מספר הזמנות"
          value={totalOrders}
        />
        {/* 4th = LEFTMOST: צפיות בחנות */}
        <StatCard
          badge={shopViews === null ? 'לא זמין' : 'מצטבר'}
          badgeColor="text-orange-400"
          icon={Eye}
          iconBg="bg-orange-50"
          iconColor="text-orange-400"
          label="צפיות בחנות"
          value={shopViews === null ? '—' : formatCompact(shopViews)}
        />
      </div>

      {/* ── Middle Row ──
          RTL: first = visual RIGHT
          Target: orders table on RIGHT (wide), quick actions on LEFT (narrow)
          → HTML: orders (col-8) FIRST, quick actions (col-4) SECOND
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* 1st = visual RIGHT: Recent Orders */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            {/* In RTL: first=RIGHT, second=LEFT */}
            <h2 className="text-lg font-black text-gray-800">הזמנות אחרונות</h2>
            <Link href="/orders" className="text-sm text-[#006d43] font-bold hover:underline">
              הצג הכל
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="text-gray-400 text-center py-10">אין הזמנות להצגה</p>
          ) : (
            <table className="w-full text-right">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-100">
                  <th className="pb-3 font-semibold">מספר הזמנה</th>
                  <th className="pb-3 font-semibold">לקוח</th>
                  <th className="pb-3 font-semibold">תאריך</th>
                  <th className="pb-3 font-semibold">סטטוס</th>
                  <th className="pb-3 font-semibold text-left">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.map((order) => {
                  const orderStatus = normalizeOrderStatus(order.lifecycle_status || order.status);
                  const hebrewDate = order.date
                    ? new Date(order.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—';
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 font-bold text-[#006d43] text-sm">#{order.order_id}</td>
                      <td className="py-3.5 text-gray-700 font-medium text-sm">{order.buyer_name}</td>
                      <td className="py-3.5 text-gray-400 text-sm">{hebrewDate}</td>
                      <td className="py-3.5">
                        <span className={cn(
                          'text-xs px-3 py-1 rounded-lg font-bold',
                          ORDER_STATUS_BADGE_CLASSES[orderStatus]
                        )}>
                          {ORDER_STATUS_LABELS[orderStatus]}
                        </span>
                      </td>
                      <td className="py-3.5 font-bold text-gray-800 text-left text-sm">
                        {order.amount ?? (order.total_price != null
                          ? `${order.currency || 'USD'} ${order.total_price.toFixed(2)}`
                          : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 2nd = visual LEFT: Quick Actions */}
        <div className="lg:col-span-4 bg-[#006d43] rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/5 rounded-full pointer-events-none" />
          {/* In RTL: title on RIGHT */}
          <h3 className="text-lg font-black mb-5 relative z-10 text-right">פעולות מהירות</h3>
          <div className="grid grid-cols-2 gap-3 relative z-10">
            {/* In RTL grid: first=visual RIGHT */}
            <Link
              href="/products/new"
              className="bg-white/15 hover:bg-white/25 rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-95 border border-white/10"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Plus className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white">מוצר חדש</span>
            </Link>
            <Link
              href="/orders"
              className="bg-white/15 hover:bg-white/25 rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-95 border border-white/10"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white">משלוח</span>
            </Link>
            <Link
              href="/marketing"
              className="bg-white/15 hover:bg-white/25 rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-95 border border-white/10"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Tag className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white">קופון</span>
            </Link>
            <Link
              href="/dashboard/messages"
              className="bg-white/15 hover:bg-white/25 rounded-xl p-4 flex flex-col items-center gap-2 transition-all active:scale-95 border border-white/10"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white">הודעה</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Full-width Trend Chart ── */}
      <TrendChart />

      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
        currentShopName={user?.tenant_name}
      />
    </div>
  );
}

export default function OwnerDashboardPage() {
  return (
    <DashboardLayout>
      <OwnerDashboardContent />
    </DashboardLayout>
  );
}
