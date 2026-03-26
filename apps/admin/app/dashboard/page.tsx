'use client'
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'
import StatCard from '@/components/StatCard'
import { getStats, type PlatformStats } from '@/lib/api'

export default function DashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setError('Failed to load stats.'))
  }, [])

  return (
    <AdminLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
        <p className="text-gray-400 text-sm mb-8">Platform overview</p>

        {error && (
          <p className="text-red-400 text-sm mb-6">{error}</p>
        )}

        {stats ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Tenants" value={stats.total_tenants} />
            <StatCard label="Active Tenants" value={stats.active_tenants} />
            <StatCard label="Connected Shops" value={stats.total_shops} />
            <StatCard label="Total Users" value={stats.total_users} />
            <StatCard
              label="Pending Messaging Requests"
              value={stats.pending_messaging_requests}
              highlight={stats.pending_messaging_requests > 0}
            />
          </div>
        ) : (
          !error && <p className="text-gray-400 text-sm">Loading...</p>
        )}
      </div>
    </AdminLayout>
  )
}
