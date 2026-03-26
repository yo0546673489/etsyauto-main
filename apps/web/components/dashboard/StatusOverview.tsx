'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/solid';

interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'pending' | 'processing';
  label: string;
  count?: number;
}

function StatusBadge({ status, label, count }: StatusBadgeProps) {
  const config = {
    success: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: CheckCircleIcon,
      iconColor: 'text-green-600'
    },
    error: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: XCircleIcon,
      iconColor: 'text-red-600'
    },
    warning: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      icon: ExclamationTriangleIcon,
      iconColor: 'text-yellow-600'
    },
    pending: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      icon: ClockIcon,
      iconColor: 'text-gray-600'
    },
    processing: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: ArrowPathIcon,
      iconColor: 'text-blue-600'
    }
  };

  const { bg, text, icon: Icon, iconColor } = config[status];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bg} ${text}`}>
      <Icon className={`w-5 h-5 ${iconColor}`} />
      <span className="font-medium">{label}</span>
      {count !== undefined && (
        <span className="ml-1 px-2 py-0.5 bg-white rounded-full text-xs font-bold">
          {count}
        </span>
      )}
    </div>
  );
}

interface StepStatus {
  id: string;
  name: string;
  status: 'completed' | 'error' | 'pending' | 'processing';
  message: string;
  error?: string;
  retryable?: boolean;
  onRetry?: () => void;
}

export default function StatusOverview() {
  const [steps, setSteps] = useState<StepStatus[]>([
    {
      id: 'shop-connection',
      name: 'Shop Connection',
      status: 'completed',
      message: 'Connected to Test Shop'
    },
    {
      id: 'product-ingestion',
      name: 'Product Ingestion',
      status: 'completed',
      message: '1,234 products imported'
    },
    {
      id: 'order-sync',
      name: 'Order Sync',
      status: 'completed',
      message: 'Last synced 5 minutes ago (23 orders)'
    }
  ]);

  const handleRetry = async (stepId: string) => {
    setSteps(steps.map(step => 
      step.id === stepId ? { ...step, status: 'processing', message: 'Retrying...' } : step
    ));

    // Simulate retry
    setTimeout(() => {
      setSteps(steps.map(step => 
        step.id === stepId ? { ...step, status: 'completed', message: 'Retry successful!' } : step
      ));
    }, 2000);
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const errorCount = steps.filter(s => s.status === 'error').length;
  const processingCount = steps.filter(s => s.status === 'processing').length;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Automation Status</h2>
        
        {/* Summary Badges */}
        <div className="flex flex-wrap gap-3 mb-6">
          <StatusBadge status="success" label="Completed" count={completedCount} />
          <StatusBadge status="processing" label="In Progress" count={processingCount} />
          {errorCount > 0 && <StatusBadge status="error" label="Errors" count={errorCount} />}
        </div>
      </div>

      {/* Step-by-Step Status */}
      <div className="p-6">
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start gap-4">
              {/* Step Number */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                {index + 1}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-gray-900">{step.name}</h3>
                  <div>
                    {step.status === 'completed' && (
                      <CheckCircleIcon className="w-6 h-6 text-green-600" />
                    )}
                    {step.status === 'error' && (
                      <XCircleIcon className="w-6 h-6 text-red-600" />
                    )}
                    {step.status === 'processing' && (
                      <div className="w-6 h-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                    {step.status === 'pending' && (
                      <ClockIcon className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                </div>

                <p className={`text-sm ${
                  step.status === 'error' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {step.message}
                </p>

                {step.error && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{step.error}</p>
                    {step.retryable && (
                      <button
                        onClick={() => handleRetry(step.id)}
                        className="mt-2 flex items-center gap-1 text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {step.status === 'processing' && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: '45%' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-6 border-t border-gray-200 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            View Errors
          </button>
          <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sync Now
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Publish Listing
          </button>
        </div>
      </div>
    </div>
  );
}

