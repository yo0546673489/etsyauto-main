import { useState } from 'react';

interface ReviewReply {
  id: number;
  store_id: number;
  reviewer_name: string;
  review_rating: number;
  review_text: string;
  etsy_listing_id?: string;
  reply_text: string;
  reply_source: 'manual' | 'ai';
  status: 'pending' | 'processing' | 'sent' | 'failed';
  error_message?: string;
  created_at: string;
  sent_at?: string;
}

interface Props {
  review: ReviewReply;
  onRetry?: (id: number) => void;
}

const statusLabels: Record<string, { text: string; color: string }> = {
  pending: { text: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  processing: { text: 'Processing', color: 'bg-blue-100 text-blue-800' },
  sent: { text: 'Sent', color: 'bg-green-100 text-green-800' },
  failed: { text: 'Failed', color: 'bg-red-100 text-red-800' },
};

function Stars({ count }: { count: number }) {
  return (
    <span className="text-yellow-500">
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  );
}

export default function ReviewCard({ review, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = statusLabels[review.status] || statusLabels.pending;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900">{review.reviewer_name}</span>
            <Stars count={review.review_rating} />
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
              {statusInfo.text}
            </span>
            {review.reply_source === 'ai' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                AI
              </span>
            )}
          </div>
          {review.review_text && (
            <p className="text-sm text-gray-600 mb-2">"{review.review_text}"</p>
          )}
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
          <p className="text-sm font-medium text-gray-700 mb-1">Reply:</p>
          <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{review.reply_text}</p>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
            <span>Created: {new Date(review.created_at).toLocaleString()}</span>
            {review.sent_at && <span>Sent: {new Date(review.sent_at).toLocaleString()}</span>}
          </div>
          {review.status === 'failed' && (
            <div className="mt-2">
              {review.error_message && (
                <p className="text-xs text-red-500 mb-1">{review.error_message}</p>
              )}
              {onRetry && (
                <button
                  onClick={() => onRetry(review.id)}
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
