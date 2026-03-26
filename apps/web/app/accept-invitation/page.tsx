'use client';

/**
 * Accept Invitation Page
 * Allows users to accept team invitations via email link
 */

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Mail, Lock } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationData, setInvitationData] = useState<any>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new'); // new user or existing user
  const [loginPassword, setLoginPassword] = useState(''); // for existing users

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link. No token provided.');
    }
  }, [token]);

  const handleGoogleSignIn = async () => {
    if (!token) {
      setError('Invalid invitation token');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get Google OAuth URL from backend
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const response = await fetch(`${apiUrl}/api/oauth/google/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitation_token: token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to initiate Google sign-in');
      }

      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setError(err.message || 'Failed to initiate Google sign-in');
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!token) {
      setError('Invalid invitation token');
      return;
    }

    // Validate based on mode
    if (mode === 'new') {
      // New user - validate password fields
      if (!password || !confirmPassword) {
        setError('Please enter and confirm your password');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }
    } else {
      // Existing user - validate login password
      if (!loginPassword) {
        setError('Please enter your password to continue');
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
      
      const response = await fetch(`${API_BASE_URL}/api/team/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          token,
          password: mode === 'new' ? password : null,
          existing_password: mode === 'existing' ? loginPassword : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to accept invitation');
      }

      setInvitationData(data);
      setSuccess(true);

      // Backend now sets HttpOnly cookies; just redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Accept invitation error:', err);
      setError(err.message || 'Failed to accept invitation. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)] p-8 text-center">
            <XCircle className="w-16 h-16 text-[var(--danger)] mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Invalid Invitation</h1>
            <p className="text-[var(--text-muted)] mb-6">
              This invitation link is invalid or has expired.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-3 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg transition-all"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)] p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Invitation Accepted!</h1>
            <p className="text-[var(--text-secondary)] mb-2">
              You have successfully joined <strong className="text-[var(--text-primary)]">{invitationData?.tenant_name}</strong> as a{' '}
              <strong className="text-[var(--primary)]">{invitationData?.role}</strong>.
            </p>
            <p className="text-[var(--text-muted)] mb-6">
              Redirecting to dashboard...
            </p>
            <div className="flex items-center justify-center gap-2 text-[var(--primary)]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Please wait</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)] p-8 shadow-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--primary)] to-blue-500 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Accept Team Invitation</h1>
            <p className="text-[var(--text-muted)]">
              You've been invited to join a team. Complete the form below to accept.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-[var(--danger-bg)] border border-[var(--danger)]/50 rounded-lg flex items-start gap-3">
              <XCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <p className="text-[var(--danger)] text-sm">{error}</p>
            </div>
          )}

          {/* Google Sign-In Option */}
          <div className="mb-6">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-3 border border-[var(--border-color)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {loading ? 'Please wait...' : 'Continue with Google'}
            </button>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border-color)]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-[var(--card-bg)] text-[var(--text-muted)]">Or continue with email</span>
              </div>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="mb-6">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  mode === 'new'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--card-bg-hover)] border border-[var(--border-color)]'
                }`}
                disabled={loading}
              >
                New to Platform
              </button>
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  mode === 'existing'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--card-bg-hover)] border border-[var(--border-color)]'
                }`}
                disabled={loading}
              >
                I Have an Account
              </button>
            </div>
            
            {mode === 'new' ? (
              <p className="text-sm text-[var(--text-muted)]">
                Set a password for your new account to complete the invitation.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Sign in with your existing password to accept the invitation.
              </p>
            )}
          </div>

          {/* Conditional Fields Based on Mode */}
          {mode === 'new' ? (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="Enter password (min 8 characters)"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="Confirm password"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="Enter your existing password"
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Use the password from your existing account.
                </p>
              </div>
            </div>
          )}

          {/* Accept Button */}
          <button
            onClick={handleAcceptInvitation}
            disabled={loading}
            className="w-full py-3 bg-[var(--primary)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Accepting Invitation...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Accept Invitation
              </>
            )}
          </button>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Already have an account?{' '}
              <button
                onClick={() => router.push('/login')}
                className="text-[var(--primary)] hover:opacity-80 font-medium"
              >
                Log in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}
