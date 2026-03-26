/**
 * Sentry Configuration for Next.js Frontend
 * Client and server-side error tracking with PII scrubbing
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENVIRONMENT = process.env.NEXT_PUBLIC_ENVIRONMENT || 'development';
const RELEASE_VERSION = process.env.NEXT_PUBLIC_RELEASE_VERSION || 'unknown';

// Sensitive keys to redact
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'api_key', 'access_token', 'refresh_token',
  'authorization', 'cookie', 'csrf', 'jwt', 'key', 'apikey', 'auth',
  'client_secret', 'private_key', 'encryption_key', 'bearer'
]);

// PII keys to scrub
const PII_KEYS = new Set([
  'email', 'phone', 'ssn', 'credit_card', 'card_number', 'cvv',
  'address', 'first_name', 'last_name', 'full_name', 'name',
  'ip_address', 'user_agent', 'location', 'zip', 'postal_code'
]);

/**
 * Scrub sensitive data from objects
 */
function scrubSensitiveData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(scrubSensitiveData);
  }

  const scrubbed: any = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (Array.from(SENSITIVE_KEYS).some(sensitive => lowerKey.includes(sensitive))) {
      scrubbed[key] = '[REDACTED]';
    } else if (Array.from(PII_KEYS).some(pii => lowerKey.includes(pii))) {
      scrubbed[key] = '[PII]';
    } else {
      scrubbed[key] = scrubSensitiveData(value);
    }
  }

  return scrubbed;
}

/**
 * Initialize Sentry for client-side
 */
export function initSentryClient() {
  if (!SENTRY_DSN) {
    console.warn('⚠️  Sentry DSN not configured');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: `etsy-automation-web@${RELEASE_VERSION}`,
    
    // Performance monitoring
    tracesSampleRate: 0.1,
    
    // Session replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Don't send PII
    sendDefaultPii: false,
    
    // Before send hook
    beforeSend(event, hint) {
      // Scrub request data
      if (event.request) {
        if (event.request.data) {
          event.request.data = scrubSensitiveData(event.request.data);
        }
        if (event.request.headers) {
          event.request.headers = scrubSensitiveData(event.request.headers);
        }
        if (event.request.cookies) {
          event.request.cookies = scrubSensitiveData(event.request.cookies);
        }
      }

      // Scrub extra context
      if (event.extra) {
        event.extra = scrubSensitiveData(event.extra);
      }

      // Scrub breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => ({
          ...breadcrumb,
          data: scrubSensitiveData(breadcrumb.data)
        }));
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'Network request failed',
      'Failed to fetch'
    ],
  });
}

/**
 * Set user context in Sentry
 */
export function setSentryUser(userId: string, tenantId?: string) {
  Sentry.setUser({
    id: userId,
    tenant_id: tenantId
  });
}

/**
 * Clear user context
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Set Sentry context tags
 */
export function setSentryContext(context: {
  tenantId?: string;
  shopId?: string;
  page?: string;
  [key: string]: any;
}) {
  if (context.tenantId) {
    Sentry.setTag('tenant_id', context.tenantId);
  }
  if (context.shopId) {
    Sentry.setTag('shop_id', context.shopId);
  }
  if (context.page) {
    Sentry.setTag('page', context.page);
  }
  
  // Add custom context
  const { tenantId, shopId, page, ...extra } = context;
  if (Object.keys(extra).length > 0) {
    Sentry.setContext('custom', scrubSensitiveData(extra));
  }
}

/**
 * Capture exception with context
 */
export function captureSentryException(
  error: Error,
  context?: {
    tenantId?: string;
    shopId?: string;
    [key: string]: any;
  }
) {
  if (context) {
    setSentryContext(context);
  }
  
  Sentry.captureException(error);
}

/**
 * Add breadcrumb
 */
export function addSentryBreadcrumb(
  message: string,
  category: string = 'custom',
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data: data ? scrubSensitiveData(data) : undefined
  });
}

