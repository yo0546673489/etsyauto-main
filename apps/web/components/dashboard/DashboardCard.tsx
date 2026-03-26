'use client';

/**
 * Dashboard Card Component - Vuexy Style
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function DashboardCard({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  noPadding = false,
}: DashboardCardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl',
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 rounded-lg bg-[var(--primary-bg)] flex items-center justify-center text-[var(--primary)]">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={cn(!noPadding && 'p-5')}>{children}</div>
    </div>
  );
}

export default DashboardCard;
