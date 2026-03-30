'use client';

/**
 * TopBar Component - Enhanced with Search, Language Switching, and Profile Settings
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { useShop } from '@/lib/shop-context';
import { ProfileSettingsModal } from '@/components/profile/ProfileSettingsModal';
import { SearchModal } from '@/components/layout/SearchModal';
import { NotificationPanel } from '@/components/layout/NotificationPanel';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { notificationsApi } from '@/lib/api';
import {
  Search,
  ChevronDown,
  LogOut,
  User,
  Settings,
  BookOpen,
  Globe,
  Bell,
  Store,
  CheckCircle,
  WifiOff,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export function TopBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { shops, selectedShopIds, toggleShopId, selectAllShops, clearAllShops, isLoading: shopsLoading } = useShop();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [disconnectedPromptShopId, setDisconnectedPromptShopId] = useState<number | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showShopMenu, setShowShopMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = async () => {
    await logout();
  };

  // Load unread notification count
  useEffect(() => {
    loadUnreadCount();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadUnreadCount = async () => {
    try {
      const data = await notificationsApi.getUnreadCount();
      setUnreadCount(data.count);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  // Global keyboard shortcut for search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'he', name: 'עברית', flag: '🇮🇱' },
  ];

  const currentLanguage = languages.find((lang) => lang.code === language) || languages[0];

  const selectedShopName = shopsLoading
    ? t('topbar.loading')
    : shops.length === 0
      ? t('topbar.noShopConnected')
      : selectedShopIds.length === shops.length
        ? t('topbar.allShops')
        : selectedShopIds.length === 1
          ? (shops.find((s) => s.id === selectedShopIds[0])?.display_name || `Shop ${selectedShopIds[0]}`)
          : `${selectedShopIds.length} ${t('topbar.shopsCount')}`;

  return (
    <>
      {/* In RTL: first child = visual RIGHT, last child = visual LEFT */}
      <header className="h-16 bg-[var(--card-bg)] border-b border-[var(--border-color)] flex items-center gap-3 px-6">

        {/* 1st = visual RIGHT: Shop name */}
        <div className="text-[var(--primary)] font-bold text-lg flex-shrink-0 mr-2">
          {shops.find(s => selectedShopIds.includes(s.id))?.display_name || user?.name || 'Profitly'}
        </div>

        {/* 2nd: Search bar */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full pr-10 pl-24 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] hover:border-[var(--primary)] transition text-right text-sm"
            >
              חיפוש בלוח הבקרה...
            </button>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded text-xs text-[var(--text-muted)]">
              <span>K</span><span className="text-[10px]">⌘</span>
            </div>
          </div>
        </div>

        {/* 3rd: Shop selector + Language */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Connected Shops Selector */}
          <div className="relative">
            <button
              onClick={() => setShowShopMenu(!showShopMenu)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 transition-colors min-w-[200px] shadow-sm"
              title={t('topbar.selectShop')}
              disabled={shopsLoading}
            >
              <Store className="w-4 h-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="text-sm font-medium flex-1 text-left truncate">
                {shopsLoading
                  ? t('topbar.loading')
                  : shops.length === 0
                    ? t('topbar.noShopConnected')
                    : selectedShopIds.length === shops.length
                      ? t('topbar.allShops')
                      : selectedShopIds.length === 1
                        ? (shops.find((s) => s.id === selectedShopIds[0])?.display_name || `Shop ${selectedShopIds[0]}`)
                        : `${selectedShopIds.length} ${t('topbar.shopsCount')}`}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showShopMenu ? 'rotate-180' : ''}`} />
            </button>

            {showShopMenu && shops.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowShopMenu(false)}
                />
                <div className="absolute end-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('topbar.connectedShops')}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={selectAllShops}
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        {t('topbar.selectAll')}
                      </button>
                      <button
                        onClick={clearAllShops}
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        {t('topbar.clear')}
                      </button>
                      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                        {selectedShopIds.length}/{shops.length}
                      </span>
                    </div>
                  </div>
                  <div className="py-1 max-h-60 overflow-y-auto">
                    {shops.map((shop) => {
                      const isSelected = selectedShopIds.includes(shop.id);
                      const isDisconnected = shop.status === 'revoked' || (shop.status === 'connected' && shop.token_health?.has_token && !shop.token_health?.token_valid);
                      return (
                        <div key={shop.id}>
                          <button
                            onClick={() => {
                              toggleShopId(shop.id);
                              if (isDisconnected && !isSelected) {
                                setDisconnectedPromptShopId(shop.id);
                              }
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              isSelected
                                ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            } ${isDisconnected ? 'opacity-60' : ''}`}
                          >
                            <span className={`font-medium truncate flex-1 ${isDisconnected ? 'line-through' : ''}`}>
                              {shop.display_name || `Shop ${shop.id}`}
                            </span>
                            {isDisconnected && (
                              <span title="Disconnected"><WifiOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /></span>
                            )}
                            {isSelected && (
                              <CheckCircle strokeWidth={1.5} className="ml-auto w-4 h-4 flex-shrink-0 text-slate-900 dark:text-slate-100" />
                            )}
                          </button>
                          {disconnectedPromptShopId === shop.id && isDisconnected && (
                            <div className="mx-2 mb-2">
                              <NotificationBanner
                                variant="warning"
                                title="Warning"
                                message={t('topbar.disconnectedWarning')}
                                compact
                                action={
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowShopMenu(false);
                                      setDisconnectedPromptShopId(null);
                                      router.push('/settings?tab=shops');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-800 hover:bg-amber-700 px-2 py-1 text-xs font-semibold text-white transition-colors"
                                  >
                                    {t('topbar.reconnect')}
                                  </button>
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 transition-colors shadow-sm"
              title={t('topbar.changeLanguage')}
            >
              <Globe className="w-4 h-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="text-sm font-medium">{currentLanguage.code.toUpperCase()}</span>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showLanguageMenu ? 'rotate-180' : ''}`} />
            </button>

            {showLanguageMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowLanguageMenu(false)}
                />
                <div className="absolute end-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('topbar.changeLanguage')}
                    </p>
                  </div>
                  <div className="py-1">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLanguage(lang.code as 'en' | 'he');
                          setShowLanguageMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          language === lang.code
                            ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <span className="text-xl">{lang.flag}</span>
                        <span className="font-medium">{lang.name}</span>
                        {language === lang.code && (
                          <CheckCircle strokeWidth={1.5} className="ml-auto w-4 h-4 flex-shrink-0 text-slate-900 dark:text-slate-100" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>{/* end shops+language group */}

        {/* 4th = visual LEFT: User avatar, Help, Bell */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition-colors"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-[var(--primary)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <NotificationPanel
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              unreadCount={unreadCount}
              onCountChange={setUnreadCount}
            />
          </div>

          {/* Help */}
          <a
            href="/docs"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition-colors"
            title="עזרה"
          >
            <BookOpen className="w-4 h-4" />
          </a>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-9 h-9 rounded-full overflow-hidden border-2 border-[var(--border-color)] hover:border-[var(--primary)] transition-colors"
            >
              {user?.profile_picture_url ? (
                <img
                  src={
                    user.profile_picture_url.startsWith('http')
                      ? user.profile_picture_url
                      : `${process.env.NEXT_PUBLIC_API_URL ?? ''}${user.profile_picture_url}`
                  }
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full gradient-primary flex items-center justify-center text-white font-semibold text-sm">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute end-0 mt-2 w-64 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 overflow-hidden">
                  {/* User Info */}
                  <div className="p-4 border-b border-[var(--border-color)]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden">
                        {user?.profile_picture_url ? (
                          <img
                            src={
                              user.profile_picture_url.startsWith('http')
                                ? user.profile_picture_url
                                : `${process.env.NEXT_PUBLIC_API_URL ?? ''}${user.profile_picture_url}`
                            }
                            alt={user.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-[var(--primary)] flex items-center justify-center text-white font-semibold">
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-primary)] font-semibold truncate">{user?.name}</p>
                        <p className="text-[var(--text-muted)] text-sm truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowProfileModal(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>{t('topbar.profileSettings')}</span>
                    </button>
                    <a
                      href="/settings"
                      className="flex items-center gap-3 px-4 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span>{t('topbar.shopSettings')}</span>
                    </a>
                    <a
                      href="/docs"
                      className="flex items-center gap-3 px-4 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>{t('topbar.documentation')}</span>
                    </a>
                  </div>

                  {/* Logout */}
                  <div className="p-2 border-t border-[var(--border-color)]">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[var(--text-primary)] hover:bg-[var(--background)] rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('topbar.logout')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>{/* end user icons group */}
      </header>

      {/* Modals */}
      <ProfileSettingsModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />
    </>
  );
}
