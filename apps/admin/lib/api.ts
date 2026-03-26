const BASE = '/api/admin'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export interface PlatformStats {
  total_tenants: number
  active_tenants: number
  total_shops: number
  total_users: number
  pending_messaging_requests: number
}

export interface LatestTokenInfo {
  token: string
  email: string
  expires_at: string | null
  used_at: string | null
  created_at: string | null
  activation_url: string
  seconds_remaining: number
  is_valid: boolean
}

export interface TenantMessageAccess {
  id: number
  name: string
  owner_email: string
  billing_tier: string
  status: string
  messaging_access: string
  shop_count: number
  member_count: number
  created_at: string
  latest_token: LatestTokenInfo | null
}

export async function getStats(): Promise<PlatformStats> {
  return request<PlatformStats>('/stats')
}

export async function getTenants(): Promise<TenantMessageAccess[]> {
  return request<TenantMessageAccess[]>('/tenants')
}

export async function getMessageAccess(): Promise<TenantMessageAccess[]> {
  return request<TenantMessageAccess[]>('/message-access')
}

export async function approveMessaging(tenantId: number): Promise<void> {
  return request(`/messaging-access/${tenantId}/approve`, { method: 'POST' })
}

export async function denyMessaging(tenantId: number): Promise<void> {
  return request(`/messaging-access/${tenantId}/deny`, { method: 'POST' })
}

export async function generateMessagingLink(
  tenantId: number,
  email?: string
): Promise<{ token: string; activation_url: string; expires_at: string; reused: boolean }> {
  return request(`/messaging-access/${tenantId}/generate-link`, {
    method: 'POST',
    body: JSON.stringify(email ? { email } : {}),
  })
}
