'use client';

/**
 * Client-side Providers Wrapper
 * Separates client components from server layout
 */

import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import { LanguageProvider } from '@/lib/language-context';
import { CurrencyProvider } from '@/lib/currency-context';
import { ShopProvider } from '@/lib/shop-context';
import { GoogleOAuthProvider } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
// Use a placeholder when clientId is empty to prevent @react-oauth/google from crashing
const EFFECTIVE_CLIENT_ID = GOOGLE_CLIENT_ID || 'placeholder-disabled';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={EFFECTIVE_CLIENT_ID}>
      <LanguageProvider>
        <CurrencyProvider>
          <ToastProvider>
            <AuthProvider>
              <ShopProvider>{children}</ShopProvider>
            </AuthProvider>
          </ToastProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </GoogleOAuthProvider>
  );
}
