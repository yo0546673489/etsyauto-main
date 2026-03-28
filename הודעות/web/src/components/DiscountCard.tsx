import { useState } from 'react';

interface DiscountTask {
  id: number;
  store_id: number;
  task_type: 'create_sale' | 'end_sale' | 'update_sale';
  sale_name: string;
  discount_percent: number;
  target_scope: string;
  target_country: string;
  terms_text?: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  executed_at?: string;
}

interface Props {
  task: DiscountTask;
  onRetry?: (id: number) => void;
}

const statusLabels: Record<string, { text: string; color: string }> = {
  pending: { text: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  processing: { text: 'Processing', color: 'bg-blue-100 text-blue-800' },
  completed: { text: 'Completed', color: 'bg-green-100 text-green-800' },
  failed: { text: 'Failed', color: 'bg-red-100 text-red-800' },
};

const taskTypeLabels: Record<string, string> = {
  create_sale: 'Create Sale',
  end_sale: 'End Sale',
  update_sale: 'Update Sale',
};

export default function DiscountCard({ task, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = statusLabels[task.status] || statusLabels.pending;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900">{task.sale_name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
              {taskTypeLabels[task.task_type] || task.task_type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
              {statusInfo.text}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {task.discount_percent && (
              <span className="font-semibold text-green-600">{task.discount_percent}% OFF</span>
            )}
            <span>{task.target_scope === 'whole_shop' ? 'Whole Shop' : 'Specific Listings'}</span>
            <span>{task.target_country}</span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 ml-2"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Start:</span>{' '}
              <span className="text-gray-700">{task.start_date}</span>
            </div>
            <div>
              <span className="text-gray-500">End:</span>{' '}
              <span className="text-gray-700">{task.end_date}</span>
            </div>
          </div>
          {task.terms_text && (
            <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded p-2">{task.terms_text}</p>
          )}
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span>Created: {new Date(task.created_at).toLocaleString()}</span>
            {task.executed_at && <span>Executed: {new Date(task.executed_at).toLocaleString()}</span>}
          </div>
          {task.status === 'failed' && (
            <div className="mt-2">
              {task.error_message && (
                <p className="text-xs text-red-500 mb-1">{task.error_message}</p>
              )}
              {onRetry && (
                <button
                  onClick={() => onRetry(task.id)}
                  className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
