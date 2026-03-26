/**
 * Alert Component
 * A reusable alert/banner component for warnings and info messages
 * Always uses red color scheme with close and optional action buttons
 */

import { X, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface AlertProps {
  children: React.ReactNode;
  onAction?: () => void;
  actionLabel?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({
  children,
  onAction,
  actionLabel = 'Learn More',
  dismissible = true,
  onDismiss,
  className = '',
}: AlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <div
      className={`bg-red-50 border-2 border-red-300 rounded-lg p-4 flex items-start gap-3 ${className}`}
    >
      {/* Icon */}
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-red-800 leading-relaxed">{children}</div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {onAction && (
          <button
            onClick={onAction}
            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
          >
            {actionLabel}
          </button>
        )}
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
            aria-label="Dismiss alert"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
