'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Wallet,
  HelpCircle,
  LogOut,
  Link as LinkIcon,
  Check,
  Star,
  MessageCircle,
  Tag,
  Settings,
  Activity,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/language-context';
import { useAuth, useFeatureAccess } from '@/lib/auth-context';
import { useShop } from '@/lib/shop-context';
import { shopsApi } from '@/lib/api';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: 'messages' | 'discounts' | 'automations';
}

const ownerNavItems: NavItem[] = [
  { name: 'nav.dashboard',  href: '/dashboard/owner', icon: LayoutDashboard },
  { name: 'nav.orders',     href: '/orders',           icon: ShoppingCart },
  { name: 'nav.products',   href: '/products',         icon: Package },
  { name: 'nav.analytics',  href: '/analytics',        icon: BarChart3 },
  { name: 'nav.financials', href: '/financials',       icon: Wallet },
  { name: 'sidebar.reviews',   href: '/reviews',   icon: Star },
  { name: 'sidebar.discounts', href: '/discounts', icon: Tag,           feature: 'discounts' },
  { name: 'sidebar.messages',  href: '/messages',  icon: MessageCircle, feature: 'messages' },
  { name: 'sidebar.automation',href: '/automation',icon: Activity,      feature: 'automations' },
  { name: 'sidebar.newStore',  href: '/stores/new',icon: Store },
];

const employeeNavItems: NavItem[] = [
  { name: 'nav.dashboard',  href: '/dashboard/owner', icon: LayoutDashboard },
  { name: 'nav.orders',     href: '/orders',           icon: ShoppingCart },
  { name: 'nav.products',   href: '/products',         icon: Package },
  { name: 'nav.analytics',  href: '/analytics',        icon: BarChart3 },
  { name: 'nav.financials', href: '/financials',       icon: Wallet },
  { name: 'sidebar.reviews',   href: '/reviews',   icon: Star },
  { name: 'sidebar.discounts', href: '/discounts', icon: Tag,           feature: 'discounts' },
  { name: 'sidebar.messages',  href: '/messages',  icon: MessageCircle, feature: 'messages' },
  { name: 'sidebar.automation',href: '/automation',icon: Activity,      feature: 'automations' },
  // NO "sidebar.newStore" — employees cannot connect shops
];

const adminNavItems: NavItem[] = [
  { name: 'nav.dashboard',  href: '/dashboard/admin', icon: LayoutDashboard },
  { name: 'nav.orders',     href: '/orders',           icon: ShoppingCart },
  { name: 'nav.products',   href: '/products',         icon: Package },
  { name: 'nav.analytics',  href: '/analytics',        icon: BarChart3 },
  { name: 'nav.financials', href: '/financials',       icon: Wallet },
  { name: 'sidebar.reviews',   href: '/reviews',   icon: Star },
  { name: 'sidebar.discounts', href: '/discounts', icon: Tag,           feature: 'discounts' },
  { name: 'sidebar.messages',  href: '/messages',  icon: MessageCircle, feature: 'messages' },
  { name: 'sidebar.automation',href: '/automation',icon: Activity,      feature: 'automations' },
  { name: 'sidebar.newStore',  href: '/stores/new',icon: Store },
];

const supplierNavItems: NavItem[] = [
  { name: 'nav.orders', href: '/orders', icon: ShoppingCart },
];

const viewerNavItems: NavItem[] = [
  { name: 'nav.dashboard',  href: '/dashboard/viewer', icon: LayoutDashboard },
  { name: 'nav.analytics',  href: '/analytics',        icon: BarChart3 },
  { name: 'nav.financials', href: '/financials',       icon: Wallet },
  { name: 'nav.orders',     href: '/orders',           icon: ShoppingCart },
];

function getNavItems(role?: string): NavItem[] {
  switch (role?.toLowerCase()) {
    case 'owner':    return ownerNavItems;
    case 'admin':    return adminNavItems;
    case 'employee': return employeeNavItems;
    case 'supplier': return supplierNavItems;
    case 'viewer':   return viewerNavItems;
    default:         return viewerNavItems;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { selectedShop } = useShop();
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const featureAccess = useFeatureAccess();

  const featureAllowed = (feature?: 'messages' | 'discounts' | 'automations') => {
    if (!feature) return true;
    if (feature === 'messages') return featureAccess.hasMessages;
    if (feature === 'discounts') return featureAccess.hasDiscounts;
    if (feature === 'automations') return featureAccess.hasAutomations;
    return true;
  };

  const navItems = getNavItems(user?.role).filter(item => featureAllowed(item.feature));

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  /**
   * Generate a new Etsy connect-link and copy it to clipboard.
   */
  const handleConnectNewShop = async () => {
    if (copyState !== 'idle') return;
    setCopyState('loading');
    try {
      const { connect_url } = await shopsApi.createConnectLink();
      await navigator.clipboard.writeText(connect_url);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 3000);
    } catch {
      setCopyState('idle');
    }
  };

  const shopName = selectedShop?.display_name || user?.name || t('sidebar.myShop');

  return (
    <aside className="flex flex-col w-[260px] min-h-screen bg-[#006d43] text-white flex-shrink-0 shadow-2xl">

      {/* App Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Profix" className="h-9 w-auto" />
        </Link>
      </div>


      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hrefBase = item.href.split('?')[0];
          const isActive = pathname === hrefBase || (hrefBase !== '/' && pathname.startsWith(hrefBase + '/'));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative',
                isActive
                  ? 'bg-white/20 text-white font-bold backdrop-blur-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{t(item.name)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Connect New Shop Button — hidden for employee role */}
      {user?.role?.toLowerCase() !== 'employee' && <div className="px-4 pb-2">
        <button
          onClick={handleConnectNewShop}
          disabled={copyState === 'loading'}
          className={cn(
            'flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold border border-white/20 transition-all text-sm',
            copyState === 'copied'
              ? 'bg-white/30 text-white'
              : 'bg-white/20 hover:bg-white/30 text-white'
          )}
        >
          {copyState === 'copied' ? (
            <>
              <Check className="w-4 h-4" />
              {t('sidebar.linkCopied')}
            </>
          ) : copyState === 'loading' ? (
            <>
              <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              {t('sidebar.creatingLink')}
            </>
          ) : (
            <>
              <LinkIcon className="w-4 h-4" />
              {t('sidebar.connectShop')}
            </>
          )}
        </button>
      </div>}

      {/* Footer links */}
      <div className="px-4 pb-4 pt-2 border-t border-white/10 mt-2 space-y-1">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm',
            pathname.startsWith('/settings')
              ? 'bg-white/20 text-white font-bold'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          )}
        >
          <Settings className="w-4 h-4" />
          <span>{t('sidebar.settings')}</span>
        </Link>
        <Link
          href="/docs"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
        >
          <HelpCircle className="w-4 h-4" />
          <span>{t('sidebar.help')}</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('sidebar.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
