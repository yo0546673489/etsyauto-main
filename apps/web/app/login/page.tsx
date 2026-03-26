'use client';

/**
 * Login Page - Vuexy Style
 */

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import AuthLayout from '@/components/auth/AuthLayout';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

function LoginContent() {
  const { login, error, clearError, isLoading } = useAuth();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [oauthErrorMessage, setOauthErrorMessage] = useState('');

  useEffect(() => {
    // Check for JWT token from OAuth redirect
    const token = searchParams.get('token');
    const invitationAccepted = searchParams.get('invitation_accepted');
    
    if (token) {
      // Store token and redirect to dashboard
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
        
        if (invitationAccepted === 'true') {
          showToast('Invitation accepted successfully! Welcome to the team.', 'success');
        } else {
          showToast('Logged in successfully!', 'success');
        }
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
      }
      return;
    }

    const authErrorCode = searchParams.get('auth_error');
    const authErrorDetail = searchParams.get('auth_error_detail');
    if (authErrorCode) {
      const messageByCode: Record<string, string> = {
        google_oauth_error: 'Google sign-in was cancelled or denied. Please try again.',
        missing_oauth_params: 'Google sign-in response was incomplete. Please try again.',
        oauth_callback_rejected: 'Google sign-in could not be completed. Please use your invitation link and try again.',
        oauth_callback_failed: 'Google sign-in could not be completed right now. Please try again.',
      };
      const baseMessage = messageByCode[authErrorCode] || 'Authentication failed. Please try again.';
      setOauthErrorMessage(authErrorDetail ? `${baseMessage} ${authErrorDetail}` : baseMessage);
    }
    
    // Check for registration success message
    if (searchParams.get('registered') === 'true') {
      const message = typeof window !== 'undefined' 
        ? sessionStorage.getItem('registration_success') 
        : null;
      if (message) {
        setSuccessMessage(message);
        sessionStorage.removeItem('registration_success');
      } else {
        setSuccessMessage('Account created! Please check your email to verify your account.');
      }
    }
  }, [searchParams, showToast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    clearError();
    setOauthErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!formData.email || !formData.password) {
      return;
    }

    try {
      const redirect = searchParams.get('redirect');
      await login(
        formData.email,
        formData.password,
        formData.rememberMe,
        redirect && redirect.startsWith('/') ? redirect : undefined
      );
    } catch (err) {
      // Error handled by context
    }
  };

  return (
    <AuthLayout mode="login">
      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 bg-[var(--primary-bg)] border border-[var(--border-color)] rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-[var(--text-primary)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[var(--text-primary)] text-sm font-medium">Registration Successful!</p>
            <p className="text-[var(--text-secondary)] text-sm mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {(error || oauthErrorMessage) && (
        <div className="mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-800 text-sm font-medium">{error || oauthErrorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="john@example.com"
            autoComplete="email"
            className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition"
            disabled={isLoading}
            required
          />
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)]">
              Password
            </label>
            <a
              href="/forgot-password"
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Forgot Password?
            </a>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              placeholder="············"
              autoComplete="current-password"
              className="w-full px-4 py-3 pr-12 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition"
              disabled={isLoading}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Remember Me */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            name="rememberMe"
            checked={formData.rememberMe}
            onChange={handleChange}
            className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
            Remember me
          </span>
        </label>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-[var(--primary)] text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Signing in...
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border-color)]" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 bg-[var(--card-bg)] text-[var(--text-muted)] text-sm">
            or
          </span>
        </div>
      </div>

      {/* Google Sign-In */}
      <GoogleSignInButton mode="login" />

      {/* Terms */}
      <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
        By signing in, you agree to our{' '}
        <a href="/terms" className="text-[var(--primary)] hover:underline">
          Terms
        </a>{' '}
        &{' '}
        <a href="/privacy" className="text-[var(--primary)] hover:underline">
          Privacy Policy
        </a>
      </p>

      {/* Etsy Attribution Notice - Required by Etsy API Terms */}
      <p className="mt-6 text-center text-xs text-[var(--text-muted)] max-w-sm mx-auto leading-relaxed">
        The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application
        uses the Etsy API but is not endorsed or certified by Etsy, Inc.
      </p>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
