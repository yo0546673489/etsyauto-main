'use client';

/**
 * Google Sign-In Button Component
 * Production-ready Google OAuth 2.0 / OpenID Connect integration
 * 
 * Features:
 * - Server-side token verification
 * - Detailed error handling with user-friendly messages
 * - Automatic account linking for existing email users
 * - Post-login onboarding detection for new users
 * - Custom styled button matching app theme
 */

import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

interface GoogleSignInButtonProps {
  mode?: 'login' | 'register';
  tenantName?: string;
}

// Google "G" Logo SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export default function GoogleSignInButton({ mode = 'login', tenantName }: GoogleSignInButtonProps) {
  const { googleLogin } = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Use the hook-based approach for custom button styling
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      try {
        // For implicit flow, we get an access token. 
        // We need to exchange it for an ID token or user info
        // Fetch user info from Google
        const userInfoResponse = await fetch(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
            },
          }
        );
        
        if (!userInfoResponse.ok) {
          throw new Error('Failed to get user info from Google');
        }

        // For the implicit flow, we send the access token to our backend
        // which will verify it and create/login the user
        await googleLogin(tokenResponse.access_token, tenantName);
      } catch (error: any) {
        const errorMessage = error?.detail || error?.message || 'Google sign-in failed. Please try again.';
        console.error('Google sign-in error:', error);
        showToast(errorMessage, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google sign-in failed:', error);
      showToast('Google sign-in was cancelled or failed. Please try again.', 'warning');
    },
    flow: 'implicit',
  });

  const buttonText = mode === 'register' ? 'Sign up with Google' : 'Continue with Google';
  const isConfigured = !!GOOGLE_CLIENT_ID;

  if (!isConfigured) {
    return (
      <div className="relative group">
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-slate-800 border border-slate-600 rounded-xl text-white font-medium opacity-40 cursor-not-allowed"
        >
          <GoogleIcon />
          <span>{buttonText}</span>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
          Google sign-in is not configured yet
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-slate-800 border border-slate-600 rounded-xl text-white font-medium hover:bg-slate-700 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <>
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <GoogleIcon />
          <span>{buttonText}</span>
        </>
      )}
    </button>
  );
}
