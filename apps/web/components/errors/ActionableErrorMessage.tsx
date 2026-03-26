'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';

interface ErrorAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary';
}

interface ActionableErrorMessageProps {
  errorCode: string;
  errorMessage?: string;
  context?: {
    productId?: number;
    shopId?: number;
  };
  onRetry?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

interface ErrorConfig {
  titleKey: string;
  descriptionKey: string;
  severity: 'error' | 'warning' | 'info';
  icon: React.ComponentType<{ className?: string }>;
  actions: { labelKey: string; href?: string; variant?: 'primary' | 'secondary' }[];
  documentation?: string;
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
  'ETSY_401': {
    titleKey: 'errors.etsy401.title',
    descriptionKey: 'errors.etsy401.description',
    severity: 'error',
    icon: XCircle,
    actions: [
      { labelKey: 'errors.etsy401.reconnectShop', href: '/settings?tab=shops', variant: 'primary' },
      { labelKey: 'errors.etsy401.learnMore', href: '/docs/authentication', variant: 'secondary' }
    ],
    documentation: '/docs/authentication#token-expiry'
  },
  'ETSY_403': {
    titleKey: 'errors.etsy403.title',
    descriptionKey: 'errors.etsy403.description',
    severity: 'error',
    icon: XCircle,
    actions: [
      { labelKey: 'errors.etsy403.reviewPermissions', href: 'https://www.etsy.com/your/account/apps', variant: 'primary' },
      { labelKey: 'errors.etsy403.contactSupport', href: '/support', variant: 'secondary' }
    ]
  },
  'ETSY_429': {
    titleKey: 'errors.etsy429.title',
    descriptionKey: 'errors.etsy429.description',
    severity: 'warning',
    icon: AlertTriangle,
    actions: [
      { labelKey: 'errors.etsy429.viewRateLimits', href: '/docs/rate-limits', variant: 'secondary' }
    ],
    documentation: '/docs/rate-limits'
  },
  'RATE_LIMIT_429_STORM': {
    titleKey: 'errors.rateLimitStorm.title',
    descriptionKey: 'errors.rateLimitStorm.description',
    severity: 'warning',
    icon: AlertTriangle,
    actions: [
      { labelKey: 'errors.rateLimitStorm.adjustSchedule', href: '/settings', variant: 'primary' },
      { labelKey: 'errors.rateLimitStorm.viewGuidelines', href: '/docs/best-practices', variant: 'secondary' }
    ]
  },
  'IMAGE_TOO_LARGE': {
    titleKey: 'errors.imageTooLarge.title',
    descriptionKey: 'errors.imageTooLarge.description',
    severity: 'error',
    icon: XCircle,
    actions: [
      { labelKey: 'errors.imageTooLarge.uploadNew', variant: 'primary' },
      { labelKey: 'errors.imageTooLarge.guidelines', href: '/docs/images', variant: 'secondary' }
    ],
    documentation: '/docs/images#size-limits'
  },
  'IMAGE_UPLOAD_FAILED': {
    titleKey: 'errors.imageUploadFailed.title',
    descriptionKey: 'errors.imageUploadFailed.description',
    severity: 'warning',
    icon: AlertTriangle,
    actions: [
      { labelKey: 'errors.imageUploadFailed.retryUpload', variant: 'primary' }
    ]
  },
  'RBAC_DENIED': {
    titleKey: 'errors.rbacDenied.title',
    descriptionKey: 'errors.rbacDenied.description',
    severity: 'error',
    icon: XCircle,
    actions: [
      { labelKey: 'errors.rbacDenied.viewPermissions', href: '/team', variant: 'secondary' }
    ]
  },
  'ETSY_500': {
    titleKey: 'errors.etsy500.title',
    descriptionKey: 'errors.etsy500.description',
    severity: 'warning',
    icon: AlertTriangle,
    actions: [
      { labelKey: 'errors.etsy500.checkStatus', href: 'https://status.etsy.com', variant: 'secondary' }
    ]
  },
  'INTERNAL_ERROR': {
    titleKey: 'errors.internalError.title',
    descriptionKey: 'errors.internalError.description',
    severity: 'error',
    icon: XCircle,
    actions: [
      { labelKey: 'errors.internalError.retry', variant: 'primary' },
      { labelKey: 'errors.internalError.contactSupport', href: '/support', variant: 'secondary' }
    ]
  },
  'INVALID_TAXONOMY': {
    titleKey: 'errors.invalidTaxonomy.title',
    descriptionKey: 'errors.invalidTaxonomy.description',
    severity: 'error',
    icon: AlertCircle,
    actions: [
      { labelKey: 'errors.invalidTaxonomy.updateCategory', variant: 'primary' },
      { labelKey: 'errors.invalidTaxonomy.browseCategories', href: '/docs/categories', variant: 'secondary' }
    ]
  },
  'UNKNOWN': {
    titleKey: 'errors.unknown.title',
    descriptionKey: 'errors.unknown.description',
    severity: 'error',
    icon: AlertCircle,
    actions: [
      { labelKey: 'errors.unknown.retry', variant: 'primary' }
    ]
  }
};

const RETRY_KEYS = new Set([
  'errors.internalError.retry',
  'errors.unknown.retry',
]);

const NAVIGATE_ACTIONS: Record<string, (ctx?: ActionableErrorMessageProps['context']) => string | undefined> = {
  'errors.etsy401.reconnectShop': () => '/settings?tab=shops',
};

const ActionableErrorMessage: React.FC<ActionableErrorMessageProps> = ({
  errorCode,
  errorMessage,
  context,
  onRetry,
  onDismiss,
  compact = false
}) => {
  const { t } = useLanguage();
  const config = ERROR_CONFIGS[errorCode] || ERROR_CONFIGS['UNKNOWN'];
  const Icon = config.icon;

  const getSeverityStyles = () => {
    switch (config.severity) {
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          icon: 'text-red-600',
          title: 'text-red-900',
          description: 'text-red-700'
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          icon: 'text-yellow-600',
          title: 'text-yellow-900',
          description: 'text-yellow-700'
        };
      case 'info':
        return {
          container: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-600',
          title: 'text-blue-900',
          description: 'text-blue-700'
        };
    }
  };

  const styles = getSeverityStyles();

  const handleAction = (action: { labelKey: string }) => {
    if (RETRY_KEYS.has(action.labelKey) && onRetry) {
      onRetry();
      return;
    }
    const navFn = NAVIGATE_ACTIONS[action.labelKey];
    if (navFn) {
      const url = navFn(context);
      if (url) window.location.href = url;
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded border ${styles.container}`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${styles.icon}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${styles.title}`}>{t(config.titleKey)}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex-shrink-0 text-sm font-medium hover:underline"
          >
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${styles.container}`}>
      <div className="flex gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 ${styles.icon}`} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className={`text-sm font-semibold ${styles.title}`}>
                {t(config.titleKey)}
              </h3>
              <p className={`mt-1 text-sm ${styles.description}`}>
                {errorMessage || t(config.descriptionKey)}
              </p>
            </div>
            
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={t('sidebar.dismiss')}
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>{t('errors.code')} {errorCode}</span>
          </div>

          {config.actions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {config.actions.map((action, idx) => {
                const isPrimary = action.variant === 'primary';
                const label = t(action.labelKey);
                const isRetry = RETRY_KEYS.has(action.labelKey);
                
                if (action.href) {
                  return (
                    <a
                      key={idx}
                      href={action.href}
                      target={action.href.startsWith('http') ? '_blank' : undefined}
                      rel={action.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                        isPrimary
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                      {action.href.startsWith('http') && (
                        <ExternalLink className="w-3 h-3" />
                      )}
                    </a>
                  );
                }
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleAction(action)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                      isPrimary
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {isRetry && <RefreshCw className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {config.documentation && (
            <div className="mt-3 text-xs">
              <a
                href={config.documentation}
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                {t('errors.viewDocumentation')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionableErrorMessage;
