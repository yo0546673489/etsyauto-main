'use client';

import React from 'react';
import { Info, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NotificationVariant = 'info' | 'success' | 'error' | 'warning';

export interface NotificationBannerProps {
  variant: NotificationVariant;
  title: string;
  message: React.ReactNode;
  action?: React.ReactNode | { label: string; onClick: () => void } | { label: string; href: string };
  className?: string;
  compact?: boolean;
}

const VARIANT_STYLES: Record<
  NotificationVariant,
  { bg: string; border: string; icon: React.ComponentType<{ className?: string }>; button: string }
> = {
  info: {
    bg: 'bg-blue-900/90',
    border: 'border-l-4 border-l-blue-500',
    icon: Info,
    button: 'bg-blue-800 hover:bg-blue-700 text-white',
  },
  success: {
    bg: 'bg-emerald-900/90',
    border: 'border-l-4 border-l-emerald-500',
    icon: CheckCircle,
    button: 'bg-emerald-800 hover:bg-emerald-700 text-white',
  },
  error: {
    bg: 'bg-red-900/90',
    border: 'border-l-4 border-l-red-500',
    icon: XCircle,
    button: 'bg-red-800 hover:bg-red-700 text-white',
  },
  warning: {
    bg: 'bg-amber-900/90',
    border: 'border-l-4 border-l-amber-500',
    icon: AlertCircle,
    button: 'bg-amber-800 hover:bg-amber-700 text-white',
  },
};

export function NotificationBanner({ variant, title, message, action, className, compact }: NotificationBannerProps) {
  const styles = VARIANT_STYLES[variant];
  const Icon = styles.icon;

  return (
    <div
      className={cn(
        'rounded-xl flex items-start gap-3 shadow-sm',
        compact ? 'p-2' : 'p-4 gap-4',
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className={cn('flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center', compact ? 'w-6 h-6' : 'w-10 h-10')}>
        <Icon className={cn('text-white', compact ? 'w-3.5 h-3.5' : 'w-5 h-5')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-white', compact ? 'text-xs' : 'text-sm')}>{title}</p>
        <div className={cn('text-white/90', compact ? 'text-xs mt-0.5' : 'text-sm mt-1')}>{message}</div>
      </div>
      {action && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 justify-end">
          {typeof action === 'object' && action !== null && !React.isValidElement(action) && 'label' in action ? (
            'href' in action ? (
              <a
                href={action.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                  styles.button
                )}
              >
                {action.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                  styles.button
                )}
              >
                {action.label}
              </button>
            )
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
