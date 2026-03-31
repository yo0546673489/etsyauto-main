/**
 * API Client for Profitlymation Platform
 * Handles all HTTP requests to the FastAPI backend
 */

// Empty = same-origin; Next.js proxy forwards /api/* to backend
// In browser on localhost: always use same-origin (Docker hostname "api" doesn't resolve from host)
const _raw = process.env.NEXT_PUBLIC_API_URL ?? '';
const _useSameOrigin =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    /^https?:\/\/api([:\/]|\.)/.test(_raw));
export const API_BASE_URL = _useSameOrigin ? '' : _raw;

export interface ApiError {
  detail: string;
  status: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  tenant_name: string;
}

export interface GoogleAuthRequest {
  google_token: string;
  tenant_name?: string;
}

export interface AuthResponse {
  token_type: string;
  expires_in: number;
  user: {
    id: number;
    email: string;
    name: string;
    email_verified?: boolean;
    profile_picture_url?: string | null;
    is_new_user?: boolean;  // For post-login onboarding detection
  };
  tenant: {
    id: number;
    name: string;
    role: string;
    description?: string | null;
    onboarding_completed?: boolean;
    messaging_access?: string;
  };
}

export interface User {
  id: number;
  email: string;
  name: string;
  profile_picture_url?: string | null;
  tenant_id: number;
  tenant_name: string;
  role: string;
  tenant_description?: string | null;
  onboarding_completed?: boolean;
  /** Tenant messaging automation gate: only 'approved' may use messaging features */
  messaging_access?: string;
}

export interface TokenHealth {
  has_token: boolean;
  token_valid: boolean;
  expires_at: string | null;
  last_refreshed_at: string | null;
  refresh_count: number;
}

export interface Shop {
  id: number;
  etsy_shop_id: string;
  display_name: string;
  status: string;
  created_at: string;
  token_health?: TokenHealth;
}

export interface MessageThread {
  id: number;
  shop_id: number;
  customer_name?: string | null;
  customer_message_preview?: string | null;
  customer_message?: string | null;
  status: 'pending_read' | 'unread' | 'replied' | 'failed';
  created_at: string;
  replied_at?: string | null;
}

export interface MessageThreadDetail extends MessageThread {
  tenant_id: number;
  replied_text?: string | null;
  updated_at: string;
  etsy_conversation_url: string;
}

export interface MessageListResponse {
  threads: MessageThread[];
  total: number;
  page: number;
  limit: number;
}

/**
 * @deprecated No longer used ג€” auth tokens are now HttpOnly cookies.
 * Kept as no-ops for any lingering call-sites during migration.
 */
export function setAuthToken(_token: string): void { /* no-op */ }
export function removeAuthToken(): void { /* no-op */ }

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/** Mutex to prevent concurrent refresh attempts */
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Endpoints that establish a session ג€” never try refresh on 401 (would hide real auth errors) */
const AUTH_ESTABLISH_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/google'];

/**
 * Generic API request handler
 * Auth tokens are sent automatically via HttpOnly cookies (credentials: 'include').
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { skipRefreshOn401?: boolean } = {}
): Promise<T> {
  const { skipRefreshOn401, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  const method = (fetchOptions.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = generateIdempotencyKey();
  }

  const doFetch = () =>
    fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

  let response = await doFetch();

  // 401 interceptor ג€” attempt a silent token refresh once (skip for auth-establishing endpoints)
  const shouldSkipRefresh = skipRefreshOn401 ?? AUTH_ESTABLISH_ENDPOINTS.some((e) => endpoint.startsWith(e));
  if (response.status === 401 && !shouldSkipRefresh) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      response = await doFetch();
    } else {
      if (typeof window !== 'undefined') {
        const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/accept-invitation', '/messaging/activate', '/', '/oauth/etsy/callback', '/oauth/etsy/success', '/oauth/etsy/start'];
        const isPublicPage = publicPaths.includes(window.location.pathname);
        if (!isPublicPage) {
          window.location.href = '/login';
        }
      }
      const error: ApiError = { detail: 'Session expired', status: 401 };
      throw error;
    }
  }

  // Handle non-2xx responses as errors
  if (!response.ok) {
    const error: ApiError = {
      detail: 'An error occurred',
      status: response.status,
    };

    try {
      const errorData = await response.json();
      error.detail = errorData.detail || errorData.message || 'An error occurred';
    } catch (e) {
      error.detail = response.statusText || 'An error occurred';
    }

    throw error;
  }

  // Special handling for 202 Accepted (used for email verification required)
  // FastAPI's HTTPException returns {"detail": "..."} format
  if (response.status === 202) {
    const data = await response.json();
    const error: ApiError = {
      detail: data.detail || 'Action accepted, please check your email',
      status: 202,
    };
    throw error;
  }

  try {
    return await response.json();
  } catch (e) {
    const msg = e instanceof SyntaxError
      ? 'Invalid response from server. Please try again.'
      : (e instanceof Error ? e.message : 'Request failed');
    throw { detail: msg, status: response.status } as ApiError;
  }
}

/**
 * Auth API
 */
export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    return apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    return apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  googleAuth: async (data: GoogleAuthRequest): Promise<AuthResponse> => {
    return apiRequest<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCurrentUser: async (): Promise<User> => {
    return apiRequest<User>('/api/auth/me');
  },

  logout: async (): Promise<void> => {
    await apiRequest<void>('/api/auth/logout', { method: 'POST' });
  },

  uploadProfilePicture: async (file: File): Promise<{ message: string; profile_picture_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/auth/profile/upload-picture`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw {
        detail: error.detail || 'Profile picture upload failed',
        status: response.status,
      };
    }

    return response.json();
  },

  deleteProfilePicture: async (): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>('/api/auth/profile/delete-picture', {
      method: 'DELETE',
    });
  },
};

export type MessagingActivationValidateResponse =
  | { valid: true; tenant_name: string; email: string }
  | { valid: false; reason: 'expired' | 'used' | 'not_found' };

/**
 * Public GET + authenticated POST for token-based messaging activation.
 */
export const messagingActivationApi = {
  validateToken: async (token: string): Promise<MessagingActivationValidateResponse> => {
    const res = await fetch(
      `${API_BASE_URL}/api/messaging/activate?token=${encodeURIComponent(token)}`,
      { credentials: 'omit' }
    );
    return res.json();
  },

  activate: async (body: {
    token: string;
    imap_host: string;
    imap_email: string;
    imap_password: string;
    adspower_profile_id: string;
    accepted_terms: boolean;
  }): Promise<{ success: boolean }> => {
    return apiRequest<{ success: boolean }>('/api/messaging/activate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

/**
 * Shops API
 */
export const shopsApi = {
  getAll: async (): Promise<Shop[]> => {
    const response = await apiRequest<{ shops: Shop[] }>('/api/shops/');
    return response.shops;
  },

  getEtsyConnectUrl: async (shopName?: string): Promise<{ authorization_url: string }> => {
    const params = shopName ? `?shop_name=${encodeURIComponent(shopName)}` : '';
    return apiRequest<{ authorization_url: string }>(`/api/shops/etsy/connect${params}`);
  },

  createConnectLink: async (shopName?: string): Promise<{ connect_url: string; expires_in_minutes: number }> => {
    return apiRequest<{ connect_url: string; expires_in_minutes: number }>('/api/shops/connect-link', {
      method: 'POST',
      body: JSON.stringify({ shop_name: shopName || null }),
    });
  },

  connectEtsy: async (code: string, state: string): Promise<Shop> => {
    return apiRequest<Shop>('/api/shops/etsy/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  },

  disconnect: async (shopId: number): Promise<void> => {
    return apiRequest<void>(`/api/shops/${shopId}`, {
      method: 'DELETE',
    });
  },

  deletePermanently: async (shopId: number): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/api/shops/${shopId}/permanent`, {
      method: 'DELETE',
    });
  },

  updateDisplayName: async (shopId: number, displayName: string): Promise<Shop> => {
    return apiRequest<Shop>(`/api/shops/${shopId}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: displayName }),
    });
  },

  refreshConnection: async (
    shopId: number,
  ): Promise<{ message: string; expires_at?: string; refresh_count?: number }> => {
    return apiRequest(`/api/shops/${shopId}/refresh-token`, { method: 'POST' });
  },

  getMessagingConfig: async (shopId: number): Promise<{ imap_host?: string; imap_email?: string; adspower_profile_id?: string }> => {
    return apiRequest(`/api/shops/${shopId}/messaging-config`);
  },

  updateMessagingConfig: async (
    shopId: number,
    body: { imap_host?: string; imap_email?: string; imap_password?: string; adspower_profile_id?: string },
  ): Promise<void> => {
    return apiRequest(`/api/shops/${shopId}/messaging-config`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};

export const messagesApi = {
  list: async (
    page: number = 1,
    limit: number = 20,
    options: { shopId?: number | null; status?: string | null } = {},
  ): Promise<MessageListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (options.shopId) {
      params.append('shop_id', String(options.shopId));
    }
    if (options.status && options.status !== 'all') {
      params.append('status', options.status);
    }
    return apiRequest<MessageListResponse>(`/api/messages?${params.toString()}`);
  },

  getById: async (threadId: number): Promise<MessageThreadDetail> => {
    return apiRequest<MessageThreadDetail>(`/api/messages/${threadId}`);
  },

  sendReply: async (threadId: number, replyText: string): Promise<{ queued: boolean; thread_id: number }> => {
    return apiRequest(`/api/messages/${threadId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ reply_text: replyText }),
    });
  },

  retryScrape: async (threadId: number): Promise<{ queued: boolean; thread_id: number }> => {
    return apiRequest(`/api/messages/${threadId}/retry-scrape`, {
      method: 'POST',
    });
  },
};

/**
 * Products API
 */
export interface ProductVariant {
  sku?: string;
  option1_name?: string;
  option1_value?: string;
  option2_name?: string;
  option2_value?: string;
  price?: number;
  quantity?: number;
}

export interface Product {
  id: number;
  shop_id?: number | null;
  etsy_listing_id?: string | null;
  title_raw: string;
  description_raw: string;
  tags_raw: string[];
  images: string[];
  price: number | null;
  taxonomy_id?: number | null;
  who_made?: string | null;
  when_made?: string | null;
  materials?: string[] | null;
  cost_usd_cents?: number;
  views?: number;
  source: string;
  batch_id: string | null;
  created_at: string;
  variants?: ProductVariant[];
}

export const productsApi = {
  getAll: async (page: number = 1, limit: number = 20, batchId?: string, options: ShopQueryOptions = {}) => {
    const params = new URLSearchParams({
      skip: String((page - 1) * limit),
      limit: String(limit),
    });

    if (batchId) {
      params.append('batch_id', batchId);
    }
    _appendShopParams(params, options);

    return apiRequest<{
      products: Product[];
      total: number;
    }>(`/api/products/?${params.toString()}`);
  },

  getById: async (id: number) => {
    return apiRequest<Product>(`/api/products/${id}`);
  },

  importSingle: async (data: any) => {
    return apiRequest<any>('/api/products/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  importBatch: async (products: any[]) => {
    return apiRequest<any>('/api/products/import/batch', {
      method: 'POST',
      body: JSON.stringify({ products }),
    });
  },

  importCsv: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/products/import/csv`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('CSV import failed');
    }

    return response.json();
  },

  update: async (productId: number, data: any) => {
    return apiRequest<any>(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  syncFromEtsy: async (shopId: number): Promise<{ message: string; shop_id: number; task_id?: string }> => {
    return apiRequest<{ message: string; shop_id: number; task_id?: string }>(
      `/api/products/sync/etsy?shop_id=${shopId}`,
      { method: 'POST', body: JSON.stringify({ shop_id: shopId }) }
    );
  },

  delete: async (productId: number) => {
    return apiRequest<void>(`/api/products/${productId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Orders API
 */
export interface Order {
  id: number;
  order_id: string;
  etsy_receipt_id: string | null;
  shop_id: number;
  supplier_user_id?: number | null;
  supplier_name?: string | null;
  supplier_email?: string | null;
  buyer_name: string;
  buyer_email: string;
  total_price: number | null;
  currency: string;
  status: string;
  lifecycle_status?: string;
  payment_status: string;
  fulfillment_status?: string;
  tracking_code?: string | null;
  item_image?: string | null;
  item_title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderDetail extends Order {
  shipping_address: any;
  items: any[];
  synced_at: string | null;
  shipments?: any[];
}

export interface OrderStats {
  order_status: {
    processing: number;
    in_transit: number;
    completed: number;
    cancelled: number;
    refunded: number;
  };
  payment_status: {
    paid: number;
    unpaid: number;
  };
  total: number;
}

export interface OrderQueryOptions {
  shopId?: number | null;
}

export interface OrderSyncOptions {
  forceFullSync?: boolean;
}

export interface ShopQueryOptions {
  shopId?: number | null;
  shopIds?: number[];
  startDate?: string;  // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
}

function _appendShopParams(params: URLSearchParams, options: ShopQueryOptions) {
  if (options.shopIds && options.shopIds.length > 0) {
    params.append('shop_ids', options.shopIds.join(','));
  } else if (options.shopId) {
    params.append('shop_id', String(options.shopId));
  }
  if (options.startDate) params.append('start_date', options.startDate);
  if (options.endDate)   params.append('end_date', options.endDate);
}

export const ordersApi = {
  getStats: async (options: ShopQueryOptions = {}): Promise<OrderStats> => {
    const params = new URLSearchParams();
    _appendShopParams(params, options);
    const url = params.toString() ? `/api/orders/stats?${params.toString()}` : '/api/orders/stats';
    return apiRequest<OrderStats>(url);
  },

  getAll: async (
    page: number = 1,
    limit: number = 20,
    status?: string,
    paymentStatus?: string,
    options: ShopQueryOptions = {}
  ) => {
    const params = new URLSearchParams({
      skip: String((page - 1) * limit),
      limit: String(limit),
    });

    if (status) {
      params.append('status', status);
    }
    if (paymentStatus) {
      params.append('payment_status', paymentStatus);
    }
    _appendShopParams(params, options);

    return apiRequest<{
      orders: Order[];
      total: number;
      skip: number;
      limit: number;
    }>(`/api/orders/?${params.toString()}`);
  },

  getById: async (id: number): Promise<OrderDetail> => {
    return apiRequest<OrderDetail>(`/api/orders/${id}`);
  },

  assignSupplier: async (orderId: number, supplierUserId: number): Promise<any> => {
    return apiRequest(`/api/orders/${orderId}/assign-supplier`, {
      method: 'POST',
      body: JSON.stringify({ supplier_user_id: supplierUserId }),
    });
  },

  fulfill: async (
    orderId: number,
    payload: {
      tracking_code: string;
      carrier_name?: string;
      ship_date?: string;
      note?: string;
      send_bcc?: boolean;
    }
  ): Promise<any> => {
    return apiRequest(`/api/orders/${orderId}/fulfill`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  recordTracking: async (
    orderId: number,
    payload: {
      tracking_code: string;
      carrier_name?: string;
      ship_date?: string;
      note?: string;
    }
  ): Promise<any> => {
    return apiRequest(`/api/orders/${orderId}/tracking`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  sync: async (options: OrderSyncOptions & ShopQueryOptions = {}) => {
    const params = new URLSearchParams();
    if (options.forceFullSync) {
      params.append('force_full_sync', 'true');
    }
    _appendShopParams(params, options);

    const url = params.toString() ? `/api/orders/sync?${params.toString()}` : '/api/orders/sync';
    return apiRequest<any>(url, {
      method: 'POST',
    });
  },
  markViewed: async (): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>('/api/orders/mark-viewed', {
      method: 'POST',
    });
  },
};

/**
 * Tasks API - Celery task status polling
 */
export interface TaskStatus {
  task_id: string;
  state: string;
  ready: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: Record<string, any>;
  progress?: Record<string, any>;
  error?: string;
}

export const tasksApi = {
  getStatus: async (taskId: string): Promise<TaskStatus> => {
    return apiRequest<TaskStatus>(`/api/tasks/${taskId}/status`);
  },

  pollUntilComplete: async (
    taskId: string,
    onProgress?: (status: TaskStatus) => void,
    intervalMs: number = 2000,
    maxAttempts: number = 60
  ): Promise<TaskStatus> => {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await tasksApi.getStatus(taskId);
      if (onProgress) onProgress(status);
      if (status.ready) return status;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { task_id: taskId, state: 'TIMEOUT', ready: true, status: 'failed', error: 'Task polling timed out' };
  },
};

/**
 * Team Management API
 */
export interface TeamMember {
  id: number;
  user_id: number;
  email: string;
  name: string;
  role: string;
  invitation_status: string;  // pending, accepted, rejected
  joined_at: string;
  last_login: string | null;
  allowed_shop_ids?: number[];
}

export interface InviteMemberRequest {
  email: string;
  name: string;
  role: string;
}

export interface UserPermissions {
  can_invite_members: boolean;
  can_manage_roles: boolean;
  can_remove_members: boolean;
  can_manage_settings: boolean;
  can_create_products: boolean;

  can_publish_listings: boolean;
  can_assign_orders?: boolean;
  can_update_fulfillment?: boolean;
  is_owner: boolean;
}

export const teamApi = {
  getMembers: async (): Promise<TeamMember[]> => {
    return apiRequest<TeamMember[]>('/api/team/members');
  },

  inviteMember: async (data: InviteMemberRequest): Promise<any> => {
    return apiRequest<any>('/api/team/members/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRole: async (userId: number, role: string): Promise<any> => {
    return apiRequest<any>(`/api/team/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  removeMember: async (userId: number): Promise<any> => {
    return apiRequest<any>(`/api/team/members/${userId}`, {
      method: 'DELETE',
    });
  },

  updateShopAccess: async (userId: number, shopIds: number[]): Promise<any> => {
    return apiRequest<any>(`/api/team/members/${userId}/shops`, {
      method: 'PATCH',
      body: JSON.stringify({ shop_ids: shopIds }),
    });
  },

  getMyRole: async (): Promise<{
    user_id: number;
    tenant_id: number;
    role: string;
    permissions: UserPermissions;
  }> => {
    return apiRequest('/api/team/me/role');
  },
};

/**
 * Onboarding API
 */
export const onboardingApi = {
  getStatus: async (): Promise<{ needs_onboarding: boolean; [key: string]: any }> => {
    return apiRequest('/api/onboarding/status');
  },

  complete: async (shopName: string, description: string | null): Promise<any> => {
    return apiRequest('/api/onboarding/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shop_name: shopName,
        description: description,
      }),
    });
  },

  skip: async (): Promise<any> => {
    return apiRequest('/api/onboarding/skip', {
      method: 'POST',
    });
  },
};

/**
 * Dashboard API
 */
export interface DashboardStats {
  total_products: number;
  published_products?: number;
  total_views: number;
  today_visits: number;
  total_customers: number;
  total_orders: number;
  active_listings: number;
  new_orders_unread: number;
  available_for_payout?: number;
  available_for_deposit?: number | null;
  payout_currency?: string;
  payout_label?: string;
  date_filtered?: boolean;
  changes: {
    products: number;
    customers: number;
    orders: number;
    listings: number;
  };
}

export interface DashboardOrder {
  id: number;
  order_id: string;
  buyer_name: string;
  customer: string;
  customer_email: string;
  item_title?: string;
  date: string;
  amount: string;
  total_price?: number | null;
  currency?: string;
  converted_total_price?: number;
  converted_currency?: string;
  conversion_rate_stale?: boolean;
  status: string;
  payment_status: string;
  lifecycle_status?: string;
}

export const dashboardApi = {
  getStats: async (options: ShopQueryOptions = {}): Promise<DashboardStats> => {
    const params = new URLSearchParams();
    _appendShopParams(params, options);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<DashboardStats>(`/api/dashboard/stats${query}`);
  },

  getRecentOrders: async (limit: number = 5, options: ShopQueryOptions = {}): Promise<{ orders: DashboardOrder[]; total: number }> => {
    const params = new URLSearchParams({ limit: String(limit) });
    _appendShopParams(params, options);
    return apiRequest<{ orders: DashboardOrder[]; total: number }>(`/api/dashboard/recent-orders?${params.toString()}`);
  },
};

/**
 * Notifications API
 */
export interface Notification {
  id: number;
  type: 'info' | 'success' | 'warning' | 'error' | 'order' | 'listing' | 'system';
  title: string;
  message: string;
  action_url?: string;
  action_label?: string;
  read: boolean;
  read_at?: string;
  created_at: string;
}

export const notificationsApi = {
  getAll: async (skip: number = 0, limit: number = 50, unreadOnly: boolean = false): Promise<Notification[]> => {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(limit),
      unread_only: String(unreadOnly),
    });
    return apiRequest<Notification[]>(`/api/notifications/?${params.toString()}`);
  },

  getUnreadCount: async (type?: string): Promise<{ count: number }> => {
    const params = new URLSearchParams();
    if (type) {
      params.append('type', type);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ count: number }>(`/api/notifications/unread-count${query}`);
  },

  markAsRead: async (notificationId: number): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  markAllAsRead: async (): Promise<{ message: string; count: number }> => {
    return apiRequest<{ message: string; count: number }>('/api/notifications/mark-all-read', {
      method: 'POST',
    });
  },
  markReadByType: async (type: string): Promise<{ message: string; count: number }> => {
    const query = `?type=${encodeURIComponent(type)}`;
    return apiRequest<{ message: string; count: number }>(`/api/notifications/mark-read-by-type${query}`, {
      method: 'POST',
    });
  },

  delete: async (notificationId: number): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },

  deleteAll: async (): Promise<{ message: string; count: number }> => {
    return apiRequest<{ message: string; count: number }>('/api/notifications/', {
      method: 'DELETE',
    });
  },

  create: async (notification: {
    type: Notification['type'];
    title: string;
    message: string;
    action_url?: string;
    action_label?: string;
  }): Promise<Notification> => {
    return apiRequest<Notification>('/api/notifications/create', {
      method: 'POST',
      body: JSON.stringify(notification),
    });
  },
};

/**
 * Analytics API (Owner/Admin/Viewer only)
 */
export interface OverviewAnalytics {
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  orders_7d: number;
  orders_30d: number;
  revenue_7d: number;
  revenue_30d: number;
  orders_7d_trend: number;
  orders_30d_trend: number;
  revenue_7d_trend: number;
  revenue_30d_trend: number;
  computed_at: string;
  /** Currency conversion (when user prefers non-USD) */
  converted_currency?: string;
  converted_total_revenue?: number;
  converted_revenue_7d?: number;
  converted_revenue_30d?: number;
  converted_avg_order_value?: number;
}

export interface OrderAnalytics {
  status_breakdown: {
    processing: number;
    in_transit: number;
    completed: number;
    cancelled: number;
    refunded: number;
  };
  payment_breakdown: {
    paid: number;
    unpaid: number;
  };
  computed_at: string;
}

export interface ProductAnalytics {
  total_products: number;
  published_products: number;
  draft_products: number;
  listing_jobs: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
  };
  computed_at: string;
}

export interface FulfillmentAnalytics {
  state_breakdown: {
    processing: number;
    shipped: number;
    in_transit: number;
    delivered: number;
    delayed: number;
    cancelled: number;
  };
  source_breakdown: {
    manual: number;
    etsy_sync: number;
    auto: number;
  };
  avg_fulfillment_time_hours: number;
  supplier_performance: {
    [supplierId: string]: {
      shipment_count: number;
    };
  };
  computed_at: string;
}

function _analyticsParams(
  shopId?: number,
  forceRefresh?: boolean,
  shopIds?: number[],
  startDate?: string,
  endDate?: string
): URLSearchParams {
  const params = new URLSearchParams();
  if (shopIds && shopIds.length > 0) {
    params.append('shop_ids', shopIds.join(','));
  } else if (shopId) {
    params.append('shop_id', String(shopId));
  }
  if (forceRefresh) params.append('force_refresh', 'true');
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return params;
}

export const analyticsApi = {
  getOverview: async (
    shopId?: number,
    forceRefresh?: boolean,
    shopIds?: number[],
    startDate?: string,
    endDate?: string
  ): Promise<OverviewAnalytics> => {
    return apiRequest<OverviewAnalytics>(
      `/api/analytics/overview?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`
    );
  },

  getOrders: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[], startDate?: string, endDate?: string): Promise<OrderAnalytics> => {
    return apiRequest<OrderAnalytics>(`/api/analytics/orders?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`);
  },

  getProducts: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[], startDate?: string, endDate?: string): Promise<ProductAnalytics> => {
    return apiRequest<ProductAnalytics>(`/api/analytics/products?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`);
  },

  getFulfillment: async (shopId?: number, forceRefresh?: boolean, shopIds?: number[], startDate?: string, endDate?: string): Promise<FulfillmentAnalytics> => {
    return apiRequest<FulfillmentAnalytics>(`/api/analytics/fulfillment?${_analyticsParams(shopId, forceRefresh, shopIds, startDate, endDate).toString()}`);
  },

  invalidateCache: async (shopId?: number): Promise<{ message: string }> => {
    const params = new URLSearchParams();
    if (shopId) params.append('shop_id', String(shopId));
    return apiRequest<{ message: string }>(`/api/analytics/invalidate?${params.toString()}`, {
      method: 'POST',
    });
  },

  getComparison: async (shopIds: number[], forceRefresh?: boolean): Promise<{
    shops: Record<string, { overview: OverviewAnalytics; orders: OrderAnalytics }>;
    shop_ids: number[];
  }> => {
    const params = new URLSearchParams();
    params.append('shop_ids', shopIds.join(','));
    if (forceRefresh) params.append('force_refresh', 'true');
    return apiRequest(`/api/analytics/comparison?${params.toString()}`);
  },
};

/* ================================================================== */
/*  Financial Analytics API                                            */
/* ================================================================== */

export interface ProfitAndLoss {
  total_revenue: number;
  total_fees: number;
  total_refunds: number;
  total_shipping_labels: number;
  total_advertising: number;
  total_tax: number;
  net_profit: number;
  currency: string;
  period_start: string;
  period_end: string;
  warning?: string;
  unmapped_count?: number;
  unmapped_types?: string[];
}

export interface PayoutEstimate {
  current_balance: number;
  reserve_held: number;
  available_for_payout: number;
  currency: string;
  converted_currency?: string;
  converted_current_balance?: number;
  converted_reserve_held?: number;
  converted_available_for_payout?: number;
  recent_payouts: { amount: number; date: string | null }[];
  as_of: string;
}

export interface FeeBreakdown {
  total_fees: number;
  converted_total_fees?: number;
  categories: { category: string; amount: number; count: number }[];
  currency: string;
  converted_currency?: string;
  period_start: string;
  period_end: string;
}

export interface OrderProfitability {
  orders: {
    payment_id: number;
    etsy_receipt_id: string;
    buyer_name: string | null;
    order_total: number | null;
    amount_gross: number;
    amount_fees: number;
    amount_net: number;
    adjusted_net: number | null;
    final_net: number;
    currency: string;
    posted_at: string | null;
  }[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface TimelinePoint {
  date: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface RevenueTimeline {
  timeline: TimelinePoint[];
  granularity: string;
  period_start: string;
  period_end: string;
}

export interface LedgerEntryData {
  id: number;
  entry_type: string;
  description: string;
  amount: number;
  balance: number;
  currency: string;
  etsy_receipt_id: string | null;
  entry_created_at: string;
}

export interface LedgerResponse {
  entries: LedgerEntryData[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface BillingScopeStatus {
  has_billing_scope: boolean;
  reconnect_url: string | null;
}

export interface FinancialSummary {
  revenue: number;
  etsy_fees: number;
  advertising_expenses: number;
  product_costs: number;
  invoice_expenses: number;
  shipping_labels: number;
  refunds: number;
  total_discounts?: number;
  total_expenses: number;
  net_profit: number;
  currency: string;
  converted_currency?: string;
  original_currency?: string;
  converted_revenue?: number;
  converted_refunds?: number;
  converted_etsy_fees?: number;
  converted_advertising_expenses?: number;
  converted_product_costs?: number;
  converted_invoice_expenses?: number;
  converted_total_expenses?: number;
  converted_net_profit?: number;
  period_start: string;
  period_end: string;
  /** When unmapped ledger types exist, profit may not match Etsy */
  warning?: string;
  unmapped_count?: number;
  unmapped_types?: string[];
}

export interface SyncStatusPerShop {
  ledger_last_sync_at: string | null;
  payment_last_sync_at: string | null;
  ledger_last_error: string | null;
  payment_last_error: string | null;
  /** True when token refresh fails or 401; show Reconnect Etsy banner */
  has_auth_error?: boolean;
}

export interface SyncStatusResponse {
  shops: Record<string, SyncStatusPerShop>;
  unmapped_ledger_types?: boolean;
  unmapped_count?: number;
  unmapped_types?: string[];
}

export interface DiscountSummary {
  total_discounts: number;
  converted_total_discounts?: number;
  order_count_with_discounts: number;
  currency: string;
  converted_currency?: string;
  period_start: string;
  period_end: string;
}

function _financialParams(shopIds?: number[], shopId?: number): URLSearchParams {
  const params = new URLSearchParams();
  if (shopIds && shopIds.length > 0) {
    params.append('shop_ids', shopIds.join(','));
  } else if (shopId) {
    params.append('shop_id', String(shopId));
  }
  return params;
}

export const financialsApi = {
  getScopeStatus: async (shopId?: number): Promise<BillingScopeStatus> => {
    const params = new URLSearchParams();
    if (shopId) params.append('shop_id', String(shopId));
    return apiRequest<BillingScopeStatus>(`/api/financials/scope-status?${params.toString()}`);
  },

  getSummary: async (
    opts: { shopIds?: number[]; shopId?: number; startDate?: string; endDate?: string; forceRefresh?: boolean } = {},
  ): Promise<FinancialSummary> => {
    const params = _financialParams(opts.shopIds, opts.shopId);
    if (opts.startDate) params.append('start_date', opts.startDate);
    if (opts.endDate) params.append('end_date', opts.endDate);
    if (opts.forceRefresh) params.append('force_refresh', 'true');
    return apiRequest<FinancialSummary>(`/api/financials/summary?${params.toString()}`);
  },

  getProfitAndLoss: async (
    shopId?: number,
    startDate?: string,
    endDate?: string,
    shopIds?: number[],
  ): Promise<ProfitAndLoss> => {
    const params = _financialParams(shopIds, shopId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return apiRequest<ProfitAndLoss>(`/api/financials/profit-and-loss?${params.toString()}`);
  },

  getPayoutEstimate: async (shopId?: number, shopIds?: number[]): Promise<PayoutEstimate> => {
    const params = _financialParams(shopIds, shopId);
    return apiRequest<PayoutEstimate>(`/api/financials/payout-estimate?${params.toString()}`);
  },

  getFeeBreakdown: async (
    shopId?: number,
    startDate?: string,
    endDate?: string,
    shopIds?: number[],
  ): Promise<FeeBreakdown> => {
    const params = _financialParams(shopIds, shopId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return apiRequest<FeeBreakdown>(`/api/financials/fee-breakdown?${params.toString()}`);
  },

  getOrderProfitability: async (
    shopId?: number,
    limit?: number,
    offset?: number,
    shopIds?: number[],
  ): Promise<OrderProfitability> => {
    const params = _financialParams(shopIds, shopId);
    if (limit) params.append('limit', String(limit));
    if (offset) params.append('offset', String(offset));
    return apiRequest<OrderProfitability>(`/api/financials/order-profitability?${params.toString()}`);
  },

  getTimeline: async (
    shopId?: number,
    startDate?: string,
    endDate?: string,
    granularity?: string,
    shopIds?: number[],
  ): Promise<RevenueTimeline> => {
    const params = _financialParams(shopIds, shopId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (granularity) params.append('granularity', granularity);
    return apiRequest<RevenueTimeline>(`/api/financials/timeline?${params.toString()}`);
  },

  getLedger: async (
    shopId?: number,
    entryType?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    offset?: number,
    shopIds?: number[],
  ): Promise<LedgerResponse> => {
    const params = _financialParams(shopIds, shopId);
    if (entryType) params.append('entry_type', entryType);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (limit) params.append('limit', String(limit));
    if (offset) params.append('offset', String(offset));
    return apiRequest<LedgerResponse>(`/api/financials/ledger?${params.toString()}`);
  },

  triggerSync: async (shopId?: number, forceFullSync?: boolean): Promise<{ status: string; shop_id: number | null }> => {
    const params = new URLSearchParams();
    if (shopId) params.append('shop_id', String(shopId));
    if (forceFullSync) params.append('force_full_sync', 'true');
    return apiRequest(`/api/financials/sync?${params.toString()}`, { method: 'POST' });
  },

  getComparison: async (shopIds: number[], startDate?: string, endDate?: string): Promise<{
    shops: Record<string, FinancialSummary>;
    shop_ids: number[];
  }> => {
    const params = new URLSearchParams();
    params.append('shop_ids', shopIds.join(','));
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return apiRequest(`/api/financials/comparison?${params.toString()}`);
  },

  getSyncStatus: async (shopId?: number, shopIds?: number[]): Promise<SyncStatusResponse> => {
    const params = _financialParams(shopIds, shopId);
    return apiRequest<SyncStatusResponse>(`/api/financials/sync-status?${params.toString()}`);
  },

  getEntryTypes: async (): Promise<{
    entry_types: Array<{ entry_type: string; category: string | null; mapped: boolean; first_seen_at: string | null; last_seen_at: string | null }>;
    unmapped_count: number;
    unmapped_types: string[];
  }> => {
    return apiRequest(`/api/financials/entry-types`);
  },

  updateEntryTypeMapping: async (entryType: string, category: string): Promise<{ entry_type: string; category: string; mapped: boolean }> => {
    const params = new URLSearchParams();
    params.append('entry_type', entryType);
    params.append('category', category);
    return apiRequest(`/api/financials/entry-types/map?${params.toString()}`, { method: 'PATCH' });
  },

  getDiscounts: async (
    opts: { shopIds?: number[]; shopId?: number; startDate?: string; endDate?: string } = {},
  ): Promise<DiscountSummary> => {
    const params = _financialParams(opts.shopIds, opts.shopId);
    if (opts.startDate) params.append('start_date', opts.startDate);
    if (opts.endDate) params.append('end_date', opts.endDate);
    return apiRequest<DiscountSummary>(`/api/financials/discounts?${params.toString()}`);
  },
};


/* ================================================================== */
/*  Invoice API                                                        */
/* ================================================================== */

export interface InvoiceLineItem {
  id: number;
  description: string | null;
  amount: number;
  category: string | null;
  quantity: number;
}

export interface Invoice {
  id: number;
  tenant_id: number;
  shop_id: number | null;
  uploaded_by_user_id: number;
  file_name: string;
  file_type: string;
  file_size_bytes: number | null;
  vendor_name: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  currency: string;
  category: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  parsed_at: string | null;
  created_at: string | null;
  line_items: InvoiceLineItem[];
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  total_count: number;
  limit: number;
  offset: number;
}

export const invoicesApi = {
  upload: async (file: File, metadata: Record<string, string>): Promise<{ message: string; invoice: Invoice }> => {
    const formData = new FormData();
    formData.append('file', file);
    for (const [key, value] of Object.entries(metadata)) {
      if (value) formData.append(key, value);
    }
    return apiRequest<{ message: string; invoice: Invoice }>('/api/financials/invoices/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  list: async (opts: {
    shopId?: number;
    shopIds?: number[];
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<InvoiceListResponse> => {
    const params = new URLSearchParams();
    if (opts.shopIds && opts.shopIds.length > 0) {
      params.append('shop_ids', opts.shopIds.join(','));
    } else if (opts.shopId) {
      params.append('shop_id', String(opts.shopId));
    }
    if (opts.status) params.append('status', opts.status);
    if (opts.limit) params.append('limit', String(opts.limit));
    if (opts.offset) params.append('offset', String(opts.offset));
    return apiRequest<InvoiceListResponse>(`/api/financials/invoices/?${params.toString()}`);
  },

  update: async (invoiceId: number, data: Partial<Invoice>): Promise<{ message: string; invoice: Invoice }> => {
    return apiRequest<{ message: string; invoice: Invoice }>(`/api/financials/invoices/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete: async (invoiceId: number): Promise<{ message: string }> => {
    return apiRequest<{ message: string }>(`/api/financials/invoices/${invoiceId}`, { method: 'DELETE' });
  },
};

/**
 * User Preferences API (currency, etc.)
 */
export interface UserPreferences {
  preferred_currency_code: string;
  last_updated_at: string;
}

export const userPreferencesApi = {
  get: async (): Promise<UserPreferences> => {
    return apiRequest<UserPreferences>('/api/user-preferences');
  },
  update: async (preferred_currency_code: string): Promise<UserPreferences> => {
    return apiRequest<UserPreferences>('/api/user-preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferred_currency_code }),
    });
  },
};

/**
 * Currency API
 */
export const currencyApi = {
  getSupported: async (): Promise<{ currencies: string[] }> => {
    return apiRequest<{ currencies: string[] }>('/api/currency/supported');
  },
  convert: async (params: {
    from_currency: string;
    to_currency: string;
    amount: number;
    date?: string;
  }): Promise<{
    from: { value: number; currency: string };
    to: { value: number; currency: string };
    rate: number;
    timestamp: string;
    rate_stale?: boolean;
  }> => {
    const search = new URLSearchParams({
      from_currency: params.from_currency,
      to_currency: params.to_currency,
      amount: String(params.amount),
    });
    if (params.date) search.append('date', params.date);
    return apiRequest(`/api/currency/convert?${search.toString()}`);
  },
};

// ============ Reviews API ============

export interface Review {
  id: number;
  shop_id: number;
  etsy_review_id: number;
  etsy_listing_id?: number;
  rating: number;
  review_text?: string;
  language?: string;
  buyer_name?: string;
  listing_title?: string;
  listing_image_url?: string;
  created_at?: string;
  seller_response?: string | null;
  seller_response_at?: string | null;
}

export interface ReviewStats {
  total_reviews: number;
  average_rating: number;
  average_rating_display: string;
  rating_distribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
  reviews_last_30_days: number;
  avg_rating_last_30_days: number;
  last_review_at?: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const reviewsApi = {
  getReviews: async (params?: {
    shop_id?: number; shop_ids?: string; rating?: number;
    min_rating?: number; max_rating?: number; has_text?: boolean;
    limit?: number; offset?: number; sort_by?: string;
  }): Promise<ReviewsResponse> => {
    const query = new URLSearchParams();
    if (params?.shop_id) query.set('shop_id', String(params.shop_id));
    if (params?.shop_ids) query.set('shop_ids', params.shop_ids);
    if (params?.rating) query.set('rating', String(params.rating));
    if (params?.min_rating) query.set('min_rating', String(params.min_rating));
    if (params?.max_rating) query.set('max_rating', String(params.max_rating));
    if (params?.has_text !== undefined) query.set('has_text', String(params.has_text));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    if (params?.sort_by) query.set('sort_by', params.sort_by);
    return apiRequest<ReviewsResponse>('/api/reviews?' + query.toString());
  },

  getStats: async (params?: { shop_id?: number; shop_ids?: string }): Promise<ReviewStats> => {
    const query = new URLSearchParams();
    if (params?.shop_id) query.set('shop_id', String(params.shop_id));
    if (params?.shop_ids) query.set('shop_ids', params.shop_ids);
    return apiRequest<ReviewStats>('/api/reviews/stats?' + query.toString());
  },

  syncReviews: async (shopId: number, fullSync: boolean = false) => {
    return apiRequest<{ new_reviews: number; updated_reviews: number; total_processed: number }>(
      '/api/reviews/sync?shop_id=' + shopId + '&full_sync=' + fullSync,
      { method: 'POST' }
    );
  },

  setResponse: async (reviewId: number, response: string) => {
    return apiRequest<{ id: number; seller_response: string | null; seller_response_at: string | null }>(
      `/api/reviews/${reviewId}/response`,
      { method: 'PUT', body: JSON.stringify({ response }) }
    );
  },

  deleteResponse: async (reviewId: number) => {
    return apiRequest<{ ok: boolean }>(`/api/reviews/${reviewId}/response`, { method: 'DELETE' });
  },
};

// ===== DISCOUNTS API =====

export interface RotationItem {
  day_of_week: number;
  discount_value: number;
}

export interface DiscountRule {
  id: number;
  shop_id: number;
  name: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  scope: 'entire_shop' | 'specific_listings' | 'category';
  listing_ids?: number[];
  category_id?: string;
  is_scheduled: boolean;
  schedule_type?: 'one_time' | 'rotating';
  start_date?: string;
  end_date?: string;
  rotation_config?: RotationItem[];
  target_country?: string;
  terms_text?: string;
  etsy_sale_name?: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface DiscountTask {
  id: number;
  rule_id: number;
  shop_id: number;
  action: 'apply_discount' | 'remove_discount';
  discount_value?: number;
  scope: string;
  listing_ids?: number[];
  scheduled_for: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  completed_at?: string;
  error_message?: string;
  retry_count: number;
}

export const discountsApi = {
  getRules: (shopId: number, status?: string) => {
    const params = new URLSearchParams({ shop_id: shopId.toString() });
    if (status) params.set('status', status);
    return apiRequest<DiscountRule[]>(`/api/discounts/rules?${params}`);
  },

  createRule: (shopId: number, data: Partial<DiscountRule>) =>
    apiRequest<DiscountRule>(`/api/discounts/rules?shop_id=${shopId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRule: (shopId: number, ruleId: number, data: Partial<DiscountRule>) =>
    apiRequest<DiscountRule>(`/api/discounts/rules/${ruleId}?shop_id=${shopId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRule: (shopId: number, ruleId: number) =>
    apiRequest<{ success: boolean }>(`/api/discounts/rules/${ruleId}?shop_id=${shopId}`, { method: 'DELETE' }),

  toggleRule: (shopId: number, ruleId: number) =>
    apiRequest<DiscountRule>(`/api/discounts/rules/${ruleId}/toggle?shop_id=${shopId}`, { method: 'POST' }),

  getTasks: (shopId: number, ruleId?: number, status?: string, limit = 50) => {
    const params = new URLSearchParams({ shop_id: shopId.toString(), limit: limit.toString() });
    if (ruleId) params.set('rule_id', ruleId.toString());
    if (status) params.set('status', status);
    return apiRequest<DiscountTask[]>(`/api/discounts/tasks?${params}`);
  },
};
