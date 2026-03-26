'use client';

import React, { useState } from 'react';
import { Filter, Download, RefreshCw, Search, Calendar, AlertCircle } from 'lucide-react';
import ActionableErrorMessage from './ActionableErrorMessage';

interface ErrorItem {
  id: number;
  jobId: number;
  productId?: number;
  shopId?: number;
  listingId?: string;
  errorCode: string;
  errorMessage: string;
  status: string;
  createdAt: string;
  productName?: string;
  shopName?: string;
}

interface ErrorListTableProps {
  errors: ErrorItem[];
  onRetry?: (jobId: number) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

const ErrorListTable: React.FC<ErrorListTableProps> = ({
  errors,
  onRetry,
  onRefresh,
  loading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [expandedError, setExpandedError] = useState<number | null>(null);

  // Filter errors
  const filteredErrors = errors.filter(error => {
    const matchesSearch = 
      error.errorCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      error.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      error.productName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || error.status === filterStatus;
    
    const matchesSeverity = filterSeverity === 'all' || 
      (filterSeverity === 'error' && error.errorCode.includes('ERROR')) ||
      (filterSeverity === 'warning' && error.errorCode.includes('429')) ||
      (filterSeverity === 'policy' && error.errorCode.includes('POLICY'));
    
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  // Group by error code
  const errorCounts = errors.reduce((acc, error) => {
    acc[error.errorCode] = (acc[error.errorCode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const exportToCSV = () => {
    const headers = ['Job ID', 'Product', 'Shop', 'Error Code', 'Error Message', 'Status', 'Date'];
    const rows = filteredErrors.map(error => [
      error.jobId,
      error.productName || 'N/A',
      error.shopName || 'N/A',
      error.errorCode,
      error.errorMessage.replace(/,/g, ';'),
      error.status,
      new Date(error.createdAt).toLocaleString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `errors_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Errors</p>
              <p className="text-2xl font-bold text-gray-900">{errors.length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-red-600">
                {errors.filter(e => e.status === 'failed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Policy Violations</p>
              <p className="text-2xl font-bold text-orange-600">
                {errors.filter(e => e.errorCode.includes('POLICY')).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Rate Limits</p>
              <p className="text-2xl font-bold text-yellow-600">
                {errors.filter(e => e.errorCode.includes('429')).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search errors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="failed">Failed</option>
              <option value="policy_blocked">Policy Blocked</option>
            </select>

            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severity</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="policy">Policy</option>
            </select>

            <button
              onClick={exportToCSV}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Error Code Distribution */}
        {Object.keys(errorCounts).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Error Distribution:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(errorCounts).map(([code, count]) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {code}: <span className="font-semibold">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {filteredErrors.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">
              {searchQuery || filterStatus !== 'all' || filterSeverity !== 'all'
                ? 'No errors match your filters'
                : 'No errors found'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredErrors.map((error) => (
              <div key={error.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        Job #{error.jobId}
                      </span>
                      {error.productName && (
                        <span className="text-sm text-gray-600">
                          {error.productName}
                        </span>
                      )}
                      {error.shopName && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {error.shopName}
                        </span>
                      )}
                    </div>

                    {expandedError === error.id ? (
                      <div className="mt-3">
                        <ActionableErrorMessage
                          errorCode={error.errorCode}
                          errorMessage={error.errorMessage}
                          context={{
                            productId: error.productId,
                            shopId: error.shopId,
                          }}
                          onRetry={onRetry ? () => onRetry(error.jobId) : undefined}
                          onDismiss={() => setExpandedError(null)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm text-gray-700 font-medium">{error.errorCode}</p>
                        <p className="text-sm text-gray-600 line-clamp-1">{error.errorMessage}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(error.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedError(expandedError === error.id ? null : error.id)}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {expandedError === error.id ? 'Collapse' : 'Details'}
                    </button>
                    {onRetry && (
                      <button
                        onClick={() => onRetry(error.jobId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorListTable;

