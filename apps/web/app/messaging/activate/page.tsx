'use client';

/**
 * Public landing for messaging activation links (no login required to validate token).
 */
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { messagingActivationApi, type MessagingActivationValidateResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

function ActivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<MessagingActivationValidateResponse | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setData({ valid: false, reason: 'not_found' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await messagingActivationApi.validateToken(token);
        if (cancelled) return;
        setData(res);
        setStatus(res.valid ? 'ready' : 'error');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setData({ valid: false, reason: 'not_found' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !data?.valid || authLoading || !user) return;
    router.replace(`/settings?tab=messaging&token=${encodeURIComponent(token)}`);
  }, [token, data, user, authLoading, router]);

  const continuePath = token
    ? `/login?redirect=${encodeURIComponent(`/settings?tab=messaging&token=${encodeURIComponent(token)}`)}`
    : '/login';

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
        <div className="max-w-md w-full rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-8 text-center">
          <AlertCircle className="w-12 h-12 text-[var(--danger)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Invalid link</h1>
          <p className="text-[var(--text-muted)] text-sm mb-6">This activation link is missing a token. Please use the link from your email or contact support.</p>
          <Link href="/" className="text-[var(--primary)] font-medium">Go home</Link>
        </div>
      </div>
    );
  }

  if (status === 'loading' || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="w-10 h-10 text-[var(--primary)] animate-spin" />
      </div>
    );
  }

  if (!data?.valid) {
    const reason = data?.reason || 'not_found';
    const msg =
      reason === 'expired'
        ? 'This activation link has expired. Please request a new link from support.'
        : reason === 'used'
          ? 'This activation link has already been used. If you need help, contact support.'
          : 'This activation link is not valid. Please contact support at support@etsyauto.com.';
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
        <div className="max-w-md w-full rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-8 text-center">
          <AlertCircle className="w-12 h-12 text-[var(--danger)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Link not valid</h1>
          <p className="text-[var(--text-muted)] text-sm mb-6">{msg}</p>
          <Link href="/login" className="text-[var(--primary)] font-medium">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
      <div className="max-w-md w-full rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-8 text-center">
        <CheckCircle className="w-12 h-12 text-[var(--success)] mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Messaging access</h1>
        <p className="text-[var(--text-muted)] text-sm mb-2">
          Organization: <strong className="text-[var(--text-primary)]">{data.tenant_name}</strong>
        </p>
        <p className="text-[var(--text-muted)] text-sm mb-8">
          Continue to complete setup in Settings (IMAP & AdsPower).
        </p>
        {user ? (
          <button
            type="button"
            onClick={() => router.push(`/settings?tab=messaging&token=${encodeURIComponent(token)}`)}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90"
          >
            Continue to setup
          </button>
        ) : (
          <Link
            href={continuePath}
            className="inline-flex w-full justify-center py-3 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90"
          >
            Continue to setup
          </Link>
        )}
      </div>
    </div>
  );
}

export default function MessagingActivatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="w-10 h-10 text-[var(--primary)] animate-spin" />
      </div>
    }>
      <ActivateContent />
    </Suspense>
  );
}
