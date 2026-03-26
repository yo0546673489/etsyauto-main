export const ADMIN_SESSION_COOKIE = 'admin_session'

export async function verifyPassword(password: string): Promise<boolean> {
  const res = await fetch('/api/admin/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.ok
}

export function logout() {
  document.cookie = `${ADMIN_SESSION_COOKIE}=; Max-Age=0; path=/`
  window.location.href = '/login'
}
