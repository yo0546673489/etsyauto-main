'use client';

/**
 * Dashboard Layout Component - Vuexy Style
 * Wraps all authenticated pages with Sidebar and TopBar
 */

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const path =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/';
      router.replace(`/login?redirect=${encodeURIComponent(path)}`);
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    if (typeof window !== 'undefined') console.log('[DEBUG analytics] DashboardLayout: auth loading');
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (typeof window !== 'undefined') console.log('[DEBUG analytics] DashboardLayout: auth done, rendering layout');
  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;

