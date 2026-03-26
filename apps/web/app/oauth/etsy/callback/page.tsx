'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { shopsApi } from '@/lib/api';

function EtsyOAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError('Missing authorization code or state from Etsy.');
      return;
    }

    const connect = async () => {
      try {
        const result = await shopsApi.connectEtsy(code, state) as { shop?: { display_name?: string }; display_name?: string };
        const shopName = result?.shop?.display_name || result?.display_name || '';
        const params = shopName ? `?shop=${encodeURIComponent(shopName)}` : '';
        router.replace(`/oauth/etsy/success${params}`);
      } catch (err: any) {
        const detail = err?.detail || 'Failed to connect Etsy shop.';
        setError(detail);
      }
    };

    connect();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
      <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Connecting Etsy…</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          We are finalizing your Etsy connection. You will be redirected shortly.
        </p>
        {error && (
          <div className="mt-4 text-sm text-[var(--danger)] bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EtsyOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
          <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6 text-center">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Loading…</h1>
          </div>
        </div>
      }
    >
      <EtsyOAuthCallbackContent />
    </Suspense>
  );
}
