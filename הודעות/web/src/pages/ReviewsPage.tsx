import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import ReviewCard from '../components/ReviewCard';

const api = axios.create({ baseURL: '/api' });

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

interface Store {
  id: number;
  store_name: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewReply[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // New reply form
  const [showForm, setShowForm] = useState(false);
  const [formStore, setFormStore] = useState<number>(0);
  const [formReviewer, setFormReviewer] = useState('');
  const [formRating, setFormRating] = useState(5);
  const [formReviewText, setFormReviewText] = useState('');
  const [formReplyText, setFormReplyText] = useState('');
  const [formGenerating, setFormGenerating] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (selectedStore) params.store_id = selectedStore;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/reviews', { params });
      setReviews(res.data.reviews);
    } catch (err) {
      console.error('Failed to load reviews', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStore, statusFilter]);

  useEffect(() => {
    api.get('/stores').then(r => setStores(r.data.stores || [])).catch(() => {});
    loadReviews();
  }, [loadReviews]);

  const handleAIGenerate = async () => {
    if (!formStore || !formReviewText) return;
    setFormGenerating(true);
    try {
      const res = await api.post('/reviews/ai-generate', {
        store_id: formStore,
        reviewer_name: formReviewer,
        review_rating: formRating,
        review_text: formReviewText,
      });
      if (res.data.success) {
        setFormReplyText(res.data.generatedReply);
      }
    } catch (err) {
      console.error('AI generation failed', err);
    } finally {
      setFormGenerating(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!formStore || !formReplyText) return;
    try {
      await api.post('/reviews', {
        store_id: formStore,
        reviewer_name: formReviewer,
        review_rating: formRating,
        review_text: formReviewText,
        reply_text: formReplyText,
      });
      setShowForm(false);
      setFormReviewer('');
      setFormRating(5);
      setFormReviewText('');
      setFormReplyText('');
      loadReviews();
    } catch (err) {
      console.error('Submit failed', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            {showForm ? 'Cancel' : '+ New Reply'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <select
            value={selectedStore || ''}
            onChange={e => setSelectedStore(e.target.value ? Number(e.target.value) : undefined)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All Stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.store_name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* New Reply Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="font-medium text-gray-900 mb-3">Reply to Review</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={formStore}
                onChange={e => setFormStore(Number(e.target.value))}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value={0}>Select Store</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
              <input
                value={formReviewer}
                onChange={e => setFormReviewer(e.target.value)}
                placeholder="Reviewer name"
                className="border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-gray-600">Rating:</span>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setFormRating(n)}
                  className={`text-lg ${n <= formRating ? 'text-yellow-500' : 'text-gray-300'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={formReviewText}
              onChange={e => setFormReviewText(e.target.value)}
              placeholder="Review text (what the customer wrote)"
              className="w-full border rounded px-3 py-2 text-sm mb-3 h-20"
            />
            <textarea
              value={formReplyText}
              onChange={e => setFormReplyText(e.target.value)}
              placeholder="Your reply"
              className="w-full border rounded px-3 py-2 text-sm mb-3 h-20"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAIGenerate}
                disabled={formGenerating || !formStore || !formReviewText}
                className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50"
              >
                {formGenerating ? 'Generating...' : '✨ AI Generate'}
              </button>
              <button
                onClick={handleSubmitReply}
                disabled={!formStore || !formReplyText}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
              >
                Send Reply
              </button>
            </div>
          </div>
        )}

        {/* Review List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No review replies yet
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(review => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
