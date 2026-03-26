'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { getTenants, type TenantMessageAccess as Tenant } from '@/lib/api'

const MESSAGING_BADGE: Record<string, string> = {
  none: 'bg-gray-800 text-gray-400',
  pending: 'bg-yellow-900 text-yellow-400',
  approved: 'bg-green-900 text-green-400',
  denied: 'bg-red-900 text-red-400',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-900 text-green-400',
  suspended: 'bg-red-900 text-red-400',
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getTenants()
      .then(setTenants)
      .catch(() => setError('Failed to load tenants.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AdminLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-1">Tenants</h1>
        <p className="text-gray-400 text-sm mb-8">
          All organizations on the platform
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
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Tier</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Shops</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Members</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Status</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Messaging</th>
                  <th className="text-left text-gray-400 font-medium px-5 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tenants.map(tenant => (
                  <tr key={tenant.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-4 text-white font-medium">{tenant.name}</td>
                    <td className="px-5 py-4 text-gray-300">{tenant.owner_email}</td>
                    <td className="px-5 py-4 text-gray-300 capitalize">{tenant.billing_tier}</td>
                    <td className="px-5 py-4 text-gray-300">{tenant.shop_count}</td>
                    <td className="px-5 py-4 text-gray-300">{tenant.member_count}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[tenant.status] || 'bg-gray-800 text-gray-400'}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${MESSAGING_BADGE[tenant.messaging_access] || 'bg-gray-800 text-gray-400'}`}>
                        {tenant.messaging_access}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-gray-500">
                      No tenants found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
