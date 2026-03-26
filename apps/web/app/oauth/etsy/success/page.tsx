'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle } from 'lucide-react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const shopName = searchParams.get('shop') || 'Your shop';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
      <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-8 text-center">
        <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Shop Connected!
        </h1>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          <span className="font-semibold text-[var(--text-primary)]">{shopName}</span> has
          been successfully connected to Profitly. You can now close this window or
          go back to your dashboard.
        </p>
        <a
          href="/dashboard"
          className="inline-block px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

export default function OAuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]" />
    }>
      <SuccessContent />
    </Suspense>
  );
}
