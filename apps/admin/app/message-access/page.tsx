'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import {
  getMessageAccess,
  generateMessagingLink,
  type TenantMessageAccess,
} from '@/lib/api'

const STATUS_BADGE: Record<string, string> = {
  none: 'bg-gray-800 text-gray-400',
  pending: 'bg-yellow-900 text-yellow-400',
  approved: 'bg-green-900 text-green-400',
  denied: 'bg-red-900 text-red-400',
}

function formatLabel(status: string): string {
  if (status === 'none') return 'No Access'
  if (status === 'approved') return 'Approved'
  if (status === 'denied') return 'Denied'
  if (status === 'pending') return 'Pending'
  return status
}

export default function MessageAccessPage() {
  const [tenants, setTenants] = useState<TenantMessageAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalTenant, setModalTenant] = useState<TenantMessageAccess | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState('')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [reused, setReused] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getMessageAccess()
      setTenants(data)
    } catch {
      setError('Failed to load message access data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openModal(t: TenantMessageAccess) {
    setModalTenant(t)
    setEmailInput(t.owner_email || '')
    setGenError('')
    const lt = t.latest_token
    if (lt?.is_valid && lt.activation_url) {
      setResultUrl(lt.activation_url)
      setExpiresAt(lt.expires_at)
      setReused(true)
    } else {
      setResultUrl(null)
      setExpiresAt(null)
      setReused(false)
    }
  }

  function closeModal() {
    setModalTenant(null)
    setResultUrl(null)
    setGenError('')
  }

  async function handleGenerate() {
    if (!modalTenant) return
    setGenLoading(true)
    setGenError('')
    try {
      const res = await generateMessagingLink(
        modalTenant.id,
        emailInput.trim() || undefined
      )
      setResultUrl(res.activation_url)
      setExpiresAt(res.expires_at)
      setReused(res.reused)
      await load()
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate link')
    } finally {
      setGenLoading(false)
    }
  }

  async function copyUrl() {
    if (resultUrl) {
      await navigator.clipboard.writeText(resultUrl)
    }
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-1">Message Access</h1>
        <p className="text-gray-400 text-sm mb-8">
          All tenants, messaging status, and activation links
        </p>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        {loading && <p className="text-gray-400 text-sm">Loading...</p>}

        {!loading && !error && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Organization</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Owner</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Status</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tenants.map(tenant => (
                  <tr key={tenant.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-4 text-white font-medium">{tenant.name}</td>
                    <td className="px-5 py-4 text-gray-300">{tenant.owner_email}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          STATUS_BADGE[tenant.messaging_access] || 'bg-gray-800 text-gray-400'
                        }`}
                      >
                        {formatLabel(tenant.messaging_access)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {tenant.messaging_access === 'approved' && (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                      {tenant.messaging_access === 'denied' && (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                      {(tenant.messaging_access === 'none' ||
                        tenant.messaging_access === 'pending') && (
                        <button
                          type="button"
                          onClick={() => openModal(tenant)}
                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium rounded-lg"
                        >
                          Generate Access Link
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                      No tenants found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {modalTenant && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-1">Generate access link</h2>
              <p className="text-gray-400 text-sm mb-4">Tenant: {modalTenant.name}</p>

              <label className="block text-sm text-gray-300 mb-2">Email to send link to</label>
              <input
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-4"
                placeholder="owner@example.com"
              />

              {genError && <p className="text-red-400 text-sm mb-3">{genError}</p>}

              {resultUrl && (
                <div className="mb-4 space-y-2">
                  <p className="text-sm text-gray-400">
                    {reused
                      ? 'An unused link already exists (expires in 24h from creation):'
                      : 'Activation link (copy and send manually):'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={resultUrl}
                      className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
                    />
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
                    >
                      Copy
                    </button>
                  </div>
                  {expiresAt && (
                    <p className="text-xs text-gray-500">
                      Expires: {new Date(expiresAt).toLocaleString()}
                    </p>
                  )}
                  <p className="text-xs text-yellow-600/90">
                    Link expires in 24 hours. Send this to the tenant manually.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={genLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
                >
                  {genLoading
                    ? 'Working…'
                    : resultUrl
                      ? reused
                        ? 'Refresh from server'
                        : 'Regenerate link'
                      : 'Generate link'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
