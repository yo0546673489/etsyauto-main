'use client';

/**
 * Authentication Context Provider
 * Manages user authentication state across the application
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, type User, type ApiError } from './api';

interface AuthContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean, redirectAfter?: string) => Promise<void>;
  register: (email: string, password: string, name: string, tenantName: string) => Promise<void>;
  googleLogin: (googleToken: string, tenantName?: string) => Promise<void>;
  logout: () => Promise<void>;
  uploadProfilePicture: (file: File) => Promise<void>;
  deleteProfilePicture: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  getRoleDashboardPath: (roleOverride?: string) => string;
  /** Re-fetch /api/auth/me (e.g. after messaging activation) */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SAFE_AUTH_DEFAULT = 'Something went wrong. Please try again.';

const UNSAFE_ERROR_PATTERNS = [
  'psycopg2',
  'sqlalchemy',
  'traceback',
  'stack trace',
  'column',
  'undefinedcolumn',
  'sql:',
  'select ',
  'insert ',
  'update ',
  'delete ',
  'exception',
  'error:',
  '\n',
];

function normalizeErrorDetail(detail: any): string {
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((error: any) => error.msg).join('\n');
  }
  if (typeof detail === 'string') {
    return detail;
  }
  return '';
}

function isUnsafeDetail(detail: string): boolean {
  const lower = detail.toLowerCase();
  return UNSAFE_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

function getSafeAuthError(err: any, fallback: string = SAFE_AUTH_DEFAULT): string {
  const status = err?.status;
  const detail = normalizeErrorDetail(err?.detail);

  if (status === 401) {
    return 'Invalid email or password.';
  }
  if (status === 403) {
    return 'Access denied.';
  }
  if (status === 429) {
    return 'Too many attempts. Please try again later.';
  }
  if (status && status >= 500) {
    return fallback;
  }
  if (!detail || isUnsafeDetail(detail) || detail.length > 200) {
    return fallback;
  }
  return detail;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      // No valid cookie/token — user not logged in
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    }
  };

  const login = async (
    email: string,
    password: string,
    rememberMe: boolean = false,
    redirectAfter?: string
  ) => {
    try {
      setError(null);
      setIsLoading(true);

      const response = await authApi.login({ email, password, remember_me: rememberMe });

      const nextUser: User = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        tenant_id: response.tenant.id,
        tenant_name: response.tenant.name,
        role: response.tenant.role,
        profile_picture_url: response.user.profile_picture_url,
        tenant_description: response.tenant.description,
        onboarding_completed: response.tenant.onboarding_completed,
        messaging_access: response.tenant.messaging_access ?? 'none',
      };

      // Cookies are set by the backend response — just update React state
      setUser(nextUser);

      // Hard reload so all contexts (shops, stats, etc.) re-initialize fresh
      const dest = (redirectAfter && redirectAfter.startsWith('/'))
        ? redirectAfter
        : getRoleDashboardPath(nextUser.role);
      window.location.href = dest;
    } catch (err: any) {
      setError(getSafeAuthError(err, 'Login failed. Please try again.'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    tenantName: string
  ) => {
    try {
      setError(null);
      setIsLoading(true);

      const response = await authApi.register({
        email,
        password,
        name,
        tenant_name: tenantName,
      });

      // Cookies are set by the backend response — just update React state
      // Set user
      setUser({
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        tenant_id: response.tenant.id,
        tenant_name: response.tenant.name,
        role: response.tenant.role,
        profile_picture_url: response.user.profile_picture_url,
        tenant_description: response.tenant.description,
        onboarding_completed: response.tenant.onboarding_completed,
        messaging_access: response.tenant.messaging_access ?? 'none',
      });

      // Post-registration onboarding (new users always see onboarding)
      router.push('/dashboard?welcome=true');
    } catch (err: any) {
      // Status 202 means account created successfully but needs email verification
      // Check both err.status and fall through to message check
      const status = err?.status;
      let detail = normalizeErrorDetail(err?.detail);

      // 202 status OR success message indicates account was created
      if (status === 202 || (typeof detail === 'string' && detail.toLowerCase().includes('account created'))) {
        // This is a success case - store success message and redirect to login
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('registration_success', detail || 'Account created! Please check your email to verify your account.');
        }
        router.push('/login?registered=true');
        return;
      }

      setError(getSafeAuthError(err, 'Registration failed. Please try again.'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = async (googleToken: string, tenantName?: string) => {
    try {
      setError(null);
      setIsLoading(true);

      const response = await authApi.googleAuth({
        google_token: googleToken,
        tenant_name: tenantName,
      });

      // Cookies are set by the backend response — just update React state
      // Set user
      setUser({
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        tenant_id: response.tenant.id,
        tenant_name: response.tenant.name,
        role: response.tenant.role,
        profile_picture_url: response.user.profile_picture_url,
        tenant_description: response.tenant.description,
        onboarding_completed: response.tenant.onboarding_completed,
        messaging_access: response.tenant.messaging_access ?? 'none',
      });

      // Post-login onboarding for new users
      // Hard reload so all contexts re-initialize fresh after Google login
      window.location.href = response.user.is_new_user ? '/dashboard?welcome=true' : '/dashboard';
    } catch (err) {
      setError(getSafeAuthError(err, 'Google sign in failed. Please try again.'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
      setUser(null);
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Force logout anyway (cookies may already be cleared)
      setUser(null);
      router.push('/login');
    }
  };

  const clearError = () => {
    setError(null);
  };

  const getRoleDashboardPath = (roleOverride?: string): string => {
    const effectiveRole = (roleOverride || user?.role || 'viewer').toLowerCase();
    switch (effectiveRole) {
      case 'owner':
        return '/dashboard/owner';
      case 'admin':
        return '/dashboard/admin';
      case 'supplier':
        return '/dashboard/supplier';
      case 'viewer':
        return '/dashboard/viewer';
      default:
        return '/dashboard/viewer';
    }
  };

  const uploadProfilePicture = async (file: File) => {
    try {
      setError(null);
      const response = await authApi.uploadProfilePicture(file);

      // Update user with new profile picture URL
      if (user) {
        setUser({
          ...user,
          profile_picture_url: response.profile_picture_url,
        });
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || 'Failed to upload profile picture');
      throw err;
    }
  };

  const deleteProfilePicture = async () => {
    try {
      setError(null);
      await authApi.deleteProfilePicture();

      // Update user to remove profile picture URL
      if (user) {
        setUser({
          ...user,
          profile_picture_url: null,
        });
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.detail || 'Failed to delete profile picture');
      throw err;
    }
  };

  const value: AuthContextType = {
    user,
    setUser,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    googleLogin,
    logout,
    uploadProfilePicture,
    deleteProfilePicture,
    error,
    clearError,
    getRoleDashboardPath,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Avoid build-time crashes during prerender; client will have provider.
    if (typeof window === 'undefined') {
      return {
        user: null,
        setUser: () => {},
        isLoading: true,
        isAuthenticated: false,
        login: async () => {},
        register: async () => {},
        googleLogin: async () => {},
        logout: async () => {},
        uploadProfilePicture: async () => {},
        deleteProfilePicture: async () => {},
        error: null,
        clearError: () => {},
        getRoleDashboardPath: () => '/dashboard',
        refreshUser: async () => {},
      };
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
