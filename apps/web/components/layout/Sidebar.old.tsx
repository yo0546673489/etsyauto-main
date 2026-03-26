'use client';

/**
 * Sidebar Component - Collapsible with Sections
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  X,
  BookOpen,
  BarChart3,
  Wallet,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'messages';
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

// Owner navigation: Full access to all features
const ownerNavigation: NavSection[] = [
  {
    items: [
      { name: 'nav.dashboard', href: '/dashboard/owner', icon: LayoutDashboard },
    ],
  },
  {
    title: 'nav.analytics',
    items: [
      { name: 'nav.analytics', href: '/analytics', icon: BarChart3 },
      { name: 'nav.financials', href: '/financials', icon: Wallet },
    ],
  },
  {
    title: 'nav.shopManagement',
    items: [
      { name: 'nav.products', href: '/products', icon: Package },
      { name: 'nav.orders', href: '/orders', icon: ShoppingCart },
      { name: 'nav.messages', href: '/dashboard/messages', icon: MessageCircle, badgeKey: 'messages' },
    ],
  },
  {
    title: 'nav.settingsSection',
    items: [
      { name: 'nav.settings', href: '/settings', icon: Settings },
    ],
  },
];

// Admin navigation: Analytics + ops (no ownership settings)
const adminNavigation: NavSection[] = [
  {
    items: [
      { name: 'nav.dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
    ],
  },
  {
    title: 'nav.analytics',
    items: [
      { name: 'nav.analytics', href: '/analytics', icon: BarChart3 },
      { name: 'nav.financials', href: '/financials', icon: Wallet },
    ],
  },
  {
    title: 'nav.shopManagement',
    items: [
      { name: 'nav.products', href: '/products', icon: Package },
      { name: 'nav.orders', href: '/orders', icon: ShoppingCart },
    ],
  },
];

// Member navigation: Products and orders
const memberNavigation: NavSection[] = [
  {
    items: [
      { name: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'nav.shopManagement',
    items: [
      { name: 'nav.products', href: '/products', icon: Package },
      { name: 'nav.orders', href: '/orders', icon: ShoppingCart },
    ],
  },
  {
    title: 'nav.settingsSection',
    items: [
      { name: 'nav.settings', href: '/settings', icon: Settings },
    ],
  },
];

// Viewer navigation: Read-only analytics
const viewerNavigation: NavSection[] = [
  {
    items: [
      { name: 'nav.dashboard', href: '/dashboard/viewer', icon: LayoutDashboard },
    ],
  },
  {
    title: 'nav.analytics',
    items: [
      { name: 'nav.analytics', href: '/analytics', icon: BarChart3 },
      { name: 'nav.financials', href: '/financials', icon: Wallet },
      { name: 'nav.orders', href: '/orders', icon: ShoppingCart },
    ],
  },
];

function getNavigationForRole(role: string | undefined): NavSection[] {
  const normalizedRole = role?.toLowerCase() || 'viewer';
  
  switch (normalizedRole) {
    case 'owner':
      return ownerNavigation;
    case 'admin':
      return adminNavigation;
    case 'member':
      return memberNavigation;
    case 'viewer':
      return viewerNavigation;
    default:
      return viewerNavigation; // Default to most restrictive
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showHelpCard, setShowHelpCard] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState<number | null>(null);
  const { t } = useLanguage();
  const { user } = useAuth();
  const messagingApproved = user?.messaging_access === 'approved';

  // Get role-specific navigation
  const navigation = getNavigationForRole(user?.role).map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.name !== 'nav.messages' || messagingApproved
    ),
  }));

  // Load saved state from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebarCollapsed');
    if (savedCollapsed !== null) {
      setIsCollapsed(savedCollapsed === 'true');
    }
    const helpDismissed = localStorage.getItem('helpCardDismissed');
    if (helpDismissed === 'true') {
      setShowHelpCard(false);
    }
  }, []);

  // Load unread messages count for badge (only when tenant has messaging access)
  useEffect(() => {
    if (!messagingApproved) {
      setUnreadMessages(null);
      return;
    }
    async function loadUnread() {
      try {
        const res = await fetch('/api/messages?status=unread&page=1&limit=1', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.total === 'number') {
          setUnreadMessages(data.total);
        }
      } catch {
        // Ignore errors; badge is non-critical
      }
    }
    loadUnread();
  }, [messagingApproved]);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  const dismissHelpCard = () => {
    setShowHelpCard(false);
    localStorage.setItem('helpCardDismissed', 'true');
  };

  return (
    <div className="relative">
      {/* Collapse Toggle Button - Outside main container */}
      <button
        onClick={toggleSidebar}
        className="absolute right-0 top-20 translate-x-1/2 w-6 h-6 bg-[var(--text-inverse)] text-[var(--primary)] border border-[var(--border-color)] rounded-full flex items-center justify-center shadow-lg hover:bg-[var(--text-inverse)] hover:text-[var(--primary-dark)] transition-colors z-50"
        title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>

      <div
        className={cn(
          'h-screen flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] transition-all duration-300 ease-in-out overflow-y-auto',
          isCollapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'h-16 flex items-center border-b border-[var(--border-color)] relative z-10',
          isCollapsed ? 'justify-center px-2' : 'px-6'
        )}>
          <Link href="/" className="flex items-center gap-3 cursor-pointer pointer-events-auto">
            <div className="w-9 h-9 rounded-lg bg-[var(--text-inverse)] flex items-center justify-center flex-shrink-0">
              <span className="text-[var(--primary)] font-bold text-lg">P</span>
            </div>
            {!isCollapsed && (
              <span className="text-[var(--text-inverse)] font-bold text-xl tracking-tight">
                Profitly
              </span>
            )}
          </Link>
        </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 custom-scrollbar">
        {navigation.map((section, sectionIndex) => (
          <div key={sectionIndex} className={cn(sectionIndex > 0 && 'mt-6')}>
            {section.title && !isCollapsed && (
              <p className="px-3 mb-2 text-xs font-semibold text-[var(--text-inverse)] opacity-60 uppercase tracking-wider">
                {t(section.title)}
              </p>
            )}
            {section.title && isCollapsed && (
              <div className="h-px bg-[var(--border-color)] mx-2 mb-2" />
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const hrefBase = item.href.split('?')[0];
                const isActive = pathname === hrefBase || (hrefBase !== '/' && pathname.startsWith(hrefBase + '/'));
                const label = item.name === 'nav.messages' ? 'Messages' : t(item.name);
          
          return (
                  <Link
              key={item.name}
              href={item.href}
              className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                      isCollapsed && 'justify-center',
                isActive
                        ? 'bg-[var(--text-inverse)] text-[var(--primary)]'
                        : 'text-[var(--text-inverse)] opacity-80 hover:bg-[rgba(255,255,255,0.08)] hover:opacity-100'
              )}
                    title={isCollapsed ? t(item.name) : undefined}
            >
                    <Icon className={cn(
                      'w-5 h-5 flex-shrink-0',
                      isActive ? 'text-[var(--primary)]' : 'text-[var(--text-inverse)] opacity-70 group-hover:opacity-100'
                    )} />
                    {!isCollapsed && (
                      <span
                        className={cn(
                          'font-medium opacity-80 group-hover:opacity-100',
                          isActive ? 'text-[var(--primary)]' : 'text-[var(--text-inverse)]'
                        )}
                      >
                        {label}
                      </span>
                    )}
                    {!isCollapsed && item.badgeKey === 'messages' && unreadMessages && unreadMessages > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold px-1.5 min-w-[18px]">
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                    
                    {/* Tooltip for collapsed state */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-3 py-1.5 bg-[var(--card-bg)] text-[var(--text-primary)] text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 border border-[var(--border-color)]">
                        {t(item.name)}
                      </div>
                    )}
            </Link>
                );
        })}
            </div>
          </div>
        ))}
      </nav>

      {/* Help & Documentation Card */}
      {!isCollapsed && showHelpCard && (
        <div className="p-4">
          <div className="bg-[rgba(255,255,255,0.08)] border border-[var(--border-color)] rounded-xl p-4 relative">
            <button
              onClick={dismissHelpCard}
              className="absolute top-2 right-2 text-[var(--text-inverse-muted)] hover:text-[var(--text-inverse)] transition-colors"
              title={t('sidebar.dismiss')}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--text-inverse)] flex items-center justify-center flex-shrink-0">
                <LifeBuoy className="w-5 h-5 text-[var(--primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[var(--text-inverse)] font-semibold mb-1">{t('help.title')}</h4>
                <p className="text-[var(--text-inverse-muted)] text-sm mb-3">
                  {t('help.body')}
                </p>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-inverse)] hover:underline"
                >
                  <BookOpen className="w-4 h-4" />
                  {t('help.cta')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed Help Icon */}
      {isCollapsed && (
        <div className="p-3">
          <Link
            href="/docs"
            className="flex items-center justify-center w-full py-2.5 rounded-lg text-[var(--text-inverse-muted)] hover:text-[var(--text-inverse)] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
            title="Documentation"
          >
            <BookOpen className="w-5 h-5" />
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className={cn(
        'py-3 border-t border-[var(--border-color)]',
        isCollapsed ? 'px-2 text-center' : 'px-6'
      )}>
        <p className="text-xs text-[var(--text-inverse-muted)]">
          {isCollapsed ? 'v1.0' : 'Profitly v1.0.0'}
        </p>
      </div>
      </div>
    </div>
  );
}
