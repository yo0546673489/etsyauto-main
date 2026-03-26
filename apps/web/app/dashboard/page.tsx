'use client';

/**
 * Dashboard Role Dispatcher
 * Redirects users to their role-specific dashboard
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function DashboardRedirector() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Redirect to role-specific dashboard
    const role = user.role?.toLowerCase() || 'viewer';
    
    switch (role) {
      case 'owner':
        router.push('/dashboard/owner');
        break;
      case 'admin':
        router.push('/dashboard/admin');
        break;
      case 'supplier':
        router.push('/dashboard/supplier');
        break;
      case 'viewer':
        router.push('/dashboard/viewer');
        break;
      default:
        // Unknown role, default to viewer
        router.push('/dashboard/viewer');
        break;
    }
  }, [user, isLoading, router]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4"></div>
        <p className="text-[var(--text-secondary)]">Loading dashboard...</p>
      </div>
    </div>
  );
}
