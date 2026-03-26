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
import { PAYMENT_STATUS_STYLES, normalizePaymentStatus } from '@/lib/order-status';
import { cn } from '@/lib/utils';
import {
  Eye,
  Users,
  ShoppingBag,
  Wallet,
  Truck,
  Plus,
  Mail,
  Tag,
} from 'lucide-react';
import { TrendChart } from '@/components/dashboard/TrendChart';

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
 * Stat Card matching the mockup.
 * NOTE: page body is dir=rtl, so in every flex container:
 *   first child = visual RIGHT,  last child = visual LEFT
 *
 * Card internal layout:
 *   flex justify-between row →  [icon circle | RIGHT]  [badge | LEFT]
 *   then label + value below (text-right)
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
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl px-6 pt-5 pb-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-white/80">
      {/* RTL: first child = visual RIGHT = icon, second = visual LEFT = badge */}
      <div className="flex items-center justify-between mb-5">
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-[22px] h-[22px]', iconColor)} strokeWidth={1.8} />
        </div>
        <span className={cn('text-sm font-semibold', badgeColor)}>
          {badge}
        </span>
      </div>
      <p className="text-sm text-gray-400 text-center mb-1.5">{label}</p>
      <p className="text-[28px] leading-tight font-black text-gray-800 text-center">{value}</p>
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
        const [statsData, ordersData] = await Promise.all([
          dashboardApi.getStats(shopOpts),
          dashboardApi.getRecentOrders(5, shopOpts),
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
  }, [selectedShopIds, showOnboarding]);

  const handleCompleteOnboarding = async (shopName: string, description: string | null) => {
    await onboardingApi.complete(shopName, description);
    setShowOnboarding(false);
  };

  const handleSkipOnboarding = async () => {
    await onboardingApi.skip();
    setShowOnboarding(false);
  };

  const shopName = selectedShop?.display_name || user?.name || '';
  const today = new Date();
  const dateStr = today.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#006d43]" />
      </div>
    );
  }

  const payoutAmount  = stats.available_for_payout || 0;
  const payoutCurrency = stats.payout_currency || '₪';
  const totalOrders   = stats.total_orders || 0;
  const totalCustomers = stats.total_customers || 0;
  const totalProducts = stats.total_products || stats.published_products || 0;

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

        {/* 2nd = visual LEFT: Date card */}
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 text-center min-w-[140px] flex-shrink-0">
          <p className="text-xs text-gray-400 mb-1">התאריך היום</p>
          <p className="text-sm font-bold text-gray-700">{dateStr}</p>
        </div>
      </div>

      {/* ── 4 Stat Cards ──
          RTL: first card = visual RIGHTMOST
          Target (right→left): products | customers | orders | payout
          → HTML order: products, customers, orders, payout
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1st in HTML = visual RIGHTMOST in RTL: צפיות בחנות */}
        <StatCard
          badge={totalProducts > 999 ? `${(totalProducts / 1000).toFixed(1)}k` : `${totalProducts}`}
          badgeColor="text-orange-400"
          icon={Eye}
          iconBg="bg-orange-100"
          iconColor="text-orange-400"
          label="צפיות בחנות"
          value={totalProducts > 999 ? `${(totalProducts / 1000).toFixed(1)}k` : totalProducts}
        />
        {/* 2nd: לקוחות חדשים */}
        <StatCard
          badge={`${totalCustomers}+`}
          badgeColor="text-blue-400"
          icon={Users}
          iconBg="bg-blue-100"
          iconColor="text-blue-400"
          label="לקוחות חדשים"
          value={totalCustomers}
        />
        {/* 3rd: מספר הזמנות */}
        <StatCard
          badge={`${totalOrders}+`}
          badgeColor="text-teal-500"
          icon={ShoppingBag}
          iconBg="bg-teal-100"
          iconColor="text-teal-500"
          label="מספר הזמנות"
          value={totalOrders}
        />
        {/* 4th in HTML = visual LEFTMOST in RTL: תשלום ממתין */}
        <StatCard
          badge="12%+"
          badgeColor="text-[#006d43]"
          icon={Wallet}
          iconBg="bg-green-100"
          iconColor="text-[#006d43]"
          label="תשלום ממתין"
          value={`${payoutCurrency}${payoutAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
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
                  {/* RTL table: first th = visual RIGHT */}
                  <th className="pb-3 font-semibold">מספר הזמנה</th>
                  <th className="pb-3 font-semibold">לקוח</th>
                  <th className="pb-3 font-semibold">תאריך</th>
                  <th className="pb-3 font-semibold">סטטוס</th>
                  <th className="pb-3 font-semibold text-left">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3.5 font-medium text-gray-800">{order.order_id}</td>
                    <td className="py-3.5 text-gray-600">{order.buyer_name}</td>
                    <td className="py-3.5 text-gray-400 text-sm">{order.date}</td>
                    <td className="py-3.5">
                      <span className={cn(
                        'text-xs px-2.5 py-1 rounded-lg font-bold',
                        PAYMENT_STATUS_STYLES[normalizePaymentStatus(order.payment_status)]
                      )}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td className="py-3.5 font-bold text-gray-800 text-left">
                      {order.amount ?? (order.total_price != null
                        ? `${order.currency || ''} ${order.total_price.toFixed(2)}`
                        : '—')}
                    </td>
                  </tr>
                ))}
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

      {/* ── Bottom Row: Shop Health + Real Trend Chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* 1st = visual RIGHT: Shop Health */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-black text-gray-800 text-right mb-6">בריאות החנות</h3>
          <div className="space-y-5">
            {[
              { label: 'דירוג שירות ללקוחות', pct: 94 },
              { label: 'מהירות משלוח',         pct: 88 },
              { label: 'שביעות רצון מוצר',     pct: 98 },
            ].map(({ label, pct }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-800">{pct}%</p>
                  <p className="text-sm text-gray-700 font-medium">{label}</p>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#006d43] rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2nd = visual LEFT: Real Interactive Trend Chart */}
        <div className="lg:col-span-8">
          <TrendChart />
        </div>
      </div>

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
