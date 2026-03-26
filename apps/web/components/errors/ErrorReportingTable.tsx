'use client';

import { useState, useEffect } from 'react';
import { 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  FunnelIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

interface ErrorItem {
  id: string;
  item_id: string;
  item_type: 'product' | 'listing' | 'order' | 'ingestion';
  error_type: 'validation' | 'api' | 'policy' | 'rate_limit' | 'network';
  error_code: string;
  error_message: string;
  actionable_message: string;
  retry_available: boolean;
  status: 'pending' | 'retrying' | 'failed' | 'resolved';
  created_at: string;
  metadata?: Record<string, any>;
}

export default function ErrorReportingTable() {
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    item_type: 'all',
    error_type: 'all',
    status: 'all',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchErrors();
  }, [filters]);

  const fetchErrors = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.item_type !== 'all') params.append('item_type', filters.item_type);
      if (filters.error_type !== 'all') params.append('error_type', filters.error_type);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`/api/errors?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setErrors(data);
      }
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (errorId: string) => {
    try {
      const response = await fetch(`/api/errors/${errorId}/retry`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        // Update status locally
        setErrors(errors.map(e => 
          e.id === errorId ? { ...e, status: 'retrying' } : e
        ));
        
        // Refresh after a delay
        setTimeout(fetchErrors, 2000);
      }
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  const handleDownloadCSV = () => {
    const csvContent = [
      ['Item ID', 'Item Type', 'Error Type', 'Error Code', 'Error Message', 'Actionable Message', 'Status', 'Created At'],
      ...errors.map(e => [
        e.item_id,
        e.item_type,
        e.error_type,
        e.error_code,
        e.error_message,
        e.actionable_message,
        e.status,
        e.created_at
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `errors_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getErrorTypeColor = (type: string) => {
    const colors = {
      validation: 'bg-yellow-100 text-yellow-800',
      api: 'bg-red-100 text-red-800',
      policy: 'bg-orange-100 text-orange-800',
      rate_limit: 'bg-purple-100 text-purple-800',
      network: 'bg-blue-100 text-blue-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      retrying: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      resolved: 'bg-green-100 text-green-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Error Reports</h2>
            <p className="mt-1 text-sm text-gray-600">
              Track and resolve issues across ingestion, publishing, and sync
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <FunnelIcon className="w-5 h-5" />
              Filters
            </button>
            <button
              onClick={handleDownloadCSV}
              disabled={errors.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Download CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Type</label>
              <select
                value={filters.item_type}
                onChange={(e) => setFilters({ ...filters, item_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="all">All Types</option>
                <option value="product">Product</option>
                <option value="listing">Listing</option>
                <option value="order">Order</option>
                <option value="ingestion">Ingestion</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Error Type</label>
              <select
                value={filters.error_type}
                onChange={(e) => setFilters({ ...filters, error_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="all">All Errors</option>
                <option value="validation">Validation</option>
                <option value="api">API</option>
                <option value="policy">Policy</option>
                <option value="rate_limit">Rate Limit</option>
                <option value="network">Network</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="retrying">Retrying</option>
                <option value="failed">Failed</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by item ID or message..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading errors...</p>
          </div>
        ) : errors.length === 0 ? (
          <div className="p-12 text-center">
            <ExclamationTriangleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No errors found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Steps</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {errors.map((error) => (
                <tr key={error.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{error.item_id}</div>
                      <div className="text-sm text-gray-500 capitalize">{error.item_type}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getErrorTypeColor(error.error_type)}`}>
                      {error.error_type.replace('_', ' ')}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">{error.error_code}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-md">{error.error_message}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(error.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-blue-600 max-w-md">
                      {error.actionable_message}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(error.status)}`}>
                      {error.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {error.retry_available && error.status !== 'retrying' && error.status !== 'resolved' && (
                      <button
                        onClick={() => handleRetry(error.id)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {errors.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">1</span> to <span className="font-medium">{errors.length}</span> of{' '}
              <span className="font-medium">{errors.length}</span> errors
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

