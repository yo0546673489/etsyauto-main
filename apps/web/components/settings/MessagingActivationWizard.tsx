'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messagingActivationApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useShop } from '@/lib/shop-context';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessagingActivationWizardProps {
  token: string;
}

export function MessagingActivationWizard({ token }: MessagingActivationWizardProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { refreshShops } = useShop();
  const [step, setStep] = useState(1);
  const [terms1, setTerms1] = useState(false);
  const [terms2, setTerms2] = useState(false);
  const [imapHost, setImapHost] = useState('imap.gmail.com');
  const [imapEmail, setImapEmail] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [adspowerProfileId, setAdspowerProfileId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canContinue1 = terms1 && terms2;
  const canContinue2 = imapHost.trim() && imapEmail.trim() && imapPassword.trim();
  const canContinue3 = adspowerProfileId.trim();

  async function handleActivate() {
    setError(null);
    setSubmitting(true);
    try {
      await messagingActivationApi.activate({
        token,
        imap_host: imapHost.trim(),
        imap_email: imapEmail.trim(),
        imap_password: imapPassword,
        adspower_profile_id: adspowerProfileId.trim(),
        accepted_terms: true,
      });
      setDone(true);
      await refreshUser();
      await refreshShops();
      router.replace('/settings?tab=messaging');
      setTimeout(() => {
        router.push('/dashboard/messages');
      }, 2000);
    } catch (e: unknown) {
      const err = e as { detail?: unknown };
      const d = err?.detail;
      const msg =
        typeof d === 'string'
          ? d
          : Array.isArray(d)
            ? 'Activation failed. Check your details and try again.'
            : 'Activation failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <DashboardCard>
        <div className="text-center py-8">
          <CheckCircle className="w-14 h-14 text-[var(--success)] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Messaging access activated!</h2>
          <p className="text-[var(--text-muted)] text-sm">Redirecting to Messages…</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardCard>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Step {step} of 4 — Messaging Access Activation
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Welcome & Terms</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Messaging automation reads and sends Etsy messages using a connected mailbox (IMAP) and a browser profile (AdsPower).
            </p>
            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={terms1}
                onChange={(e) => setTerms1(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-[var(--text-primary)]">
                I understand this feature automates reading and replying to Etsy messages via browser automation.
              </span>
            </label>
            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={terms2}
                onChange={(e) => setTerms2(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-[var(--text-primary)]">
                I accept the Terms of Service and usage policies.
              </span>
            </label>
            <button
              type="button"
              disabled={!canContinue1}
              onClick={() => setStep(2)}
              className={cn(
                'px-5 py-2.5 rounded-lg font-medium',
                canContinue1
                  ? 'bg-[var(--primary)] text-white hover:opacity-90'
                  : 'bg-[var(--background)] text-[var(--text-muted)] cursor-not-allowed'
              )}
            >
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Connect Your Gmail</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Use a Gmail account with{' '}
              <a
                href="https://support.google.com/accounts/answer/185833"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] underline"
              >
                App Passwords
              </a>{' '}
              enabled (not your normal Gmail password).
            </p>
            <div className="space-y-4 max-w-lg">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">IMAP Host</label>
                <input
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Email address</label>
                <input
                  type="email"
                  value={imapEmail}
                  onChange={(e) => setImapEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">App password</label>
                <input
                  type="password"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setStep(1)} className="px-5 py-2.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)]">
                Back
              </button>
              <button
                type="button"
                disabled={!canContinue2}
                onClick={() => setStep(3)}
                className={cn(
                  'px-5 py-2.5 rounded-lg font-medium',
                  canContinue2 ? 'bg-[var(--primary)] text-white' : 'opacity-50 cursor-not-allowed'
                )}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Connect AdsPower</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Find your Profile ID in AdsPower → Open Browser → right-click your shop profile → Copy Profile ID.
            </p>
            <div className="max-w-lg">
              <label className="block text-sm text-[var(--text-muted)] mb-1">AdsPower Profile ID</label>
              <input
                value={adspowerProfileId}
                onChange={(e) => setAdspowerProfileId(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setStep(2)} className="px-5 py-2.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)]">
                Back
              </button>
              <button
                type="button"
                disabled={!canContinue3}
                onClick={() => setStep(4)}
                className={cn(
                  'px-5 py-2.5 rounded-lg font-medium',
                  canContinue3 ? 'bg-[var(--primary)] text-white' : 'opacity-50 cursor-not-allowed'
                )}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Ready to Activate</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              We will save IMAP and AdsPower settings to all shops in your organization and enable messaging access.
            </p>
            <ul className="text-sm text-[var(--text-primary)] space-y-2 mb-6 list-disc list-inside">
              <li>IMAP: {imapEmail || '—'} @ {imapHost}</li>
              <li>AdsPower profile: {adspowerProfileId || '—'}</li>
            </ul>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(3)} className="px-5 py-2.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)]">
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleActivate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Activate Messaging Access
              </button>
            </div>
          </>
        )}
      </DashboardCard>
    </div>
  );
}
