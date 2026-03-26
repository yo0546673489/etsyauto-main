'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import DashboardCard from '@/components/dashboard/DashboardCard';
import { messagesApi, type MessageThreadDetail } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useShop } from '@/lib/shop-context';
import { ArrowLeft, MessageCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

function statusBadgeClasses(status: MessageThreadDetail['status']): string {
  switch (status) {
    case 'unread':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'replied':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border border-red-200';
    case 'pending_read':
    default:
      return 'bg-gray-50 text-gray-700 border border-gray-200';
  }
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function MessageThreadPage() {
  const router = useRouter();
  const params = useParams();
  const { shops } = useShop();
  const { showToast } = useToast();

  const threadId =
    typeof params?.id === 'string' ? parseInt(params.id, 10) : Array.isArray(params?.id) ? parseInt(params.id[0], 10) : null;

  const [thread, setThread] = useState<MessageThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadThread = async () => {
    if (!threadId) return;
    try {
      setLoading(true);
      const data = await messagesApi.getById(threadId);
      setThread(data);
      if (data.status === 'unread' && !replyText) {
        setReplyText('');
      }
    } catch (err: any) {
      console.error('Failed to load message thread', err);
      showToast(err.detail || 'Failed to load message', 'error');
      setError(err.detail || 'Failed to load message');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const handleSendReply = async () => {
    if (!thread || !threadId) return;
    if (!replyText.trim()) {
      setError('Reply text is required');
      return;
    }
    if (replyText.length > 1000) {
      setError('Reply must be 1000 characters or less');
      return;
    }
    setError(null);
    try {
      setSending(true);
      await messagesApi.sendReply(threadId, replyText.trim());
      showToast('Reply queued to send on Etsy', 'success');
      await loadThread();
    } catch (err: any) {
      console.error('Failed to send reply', err);
      setError(err.detail || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleRetryScrape = async () => {
    if (!threadId) return;
    try {
      setRetrying(true);
      await messagesApi.retryScrape(threadId);
      showToast('Conversation scrape re-queued', 'success');
    } catch (err: any) {
      console.error('Failed to retry scrape', err);
      setError(err.detail || 'Failed to retry');
    } finally {
      setRetrying(false);
    }
  };

  const shopName =
    thread && shops.find((s) => s.id === thread.shop_id)?.display_name
      ? shops.find((s) => s.id === thread.shop_id)!.display_name
      : thread
      ? `Shop #${thread.shop_id}`
      : '';

  return (
    <DashboardLayout>
      <div className="max-w-[900px] mx-auto space-y-4">
        <button
          type="button"
          onClick={() => router.push('/messages')}
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to inbox
        </button>

        <DashboardCard
          title={thread?.customer_name || 'Message Thread'}
          subtitle={shopName}
          icon={<MessageCircle className="w-5 h-5" />}
          action={
            thread && (
              <span
                className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide',
                  statusBadgeClasses(thread.status),
                )}
              >
                {thread.status === 'pending_read'
                  ? 'Pending'
                  : thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
              </span>
            )
          }
        >
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            </div>
          ) : !thread ? (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              Message thread not found.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Customer message */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">Customer message</span>
                <div className="inline-block max-w-full rounded-2xl bg-[var(--primary-bg)] px-4 py-3 text-sm text-[var(--text-primary)]">
                  {thread.customer_message || 'No message text available yet.'}
                </div>
                {thread.created_at && (
                  <span className="text-[10px] text-[var(--text-muted)] mt-1">
                    Received {formatDateTime(thread.created_at)}
                  </span>
                )}
              </div>

              {/* Reply bubble if replied */}
              {thread.status === 'replied' && thread.replied_text && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Your reply</span>
                  <div className="inline-block max-w-full rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 border border-emerald-100">
                    {thread.replied_text}
                  </div>
                  {thread.replied_at && (
                    <span className="text-[10px] text-[var(--text-muted)] mt-1">
                      Sent {formatDateTime(thread.replied_at)}
                    </span>
                  )}
                </div>
              )}

              {/* Error / retry for failed */}
              {thread.status === 'failed' && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span>
                    Automation failed to scrape this conversation. You can retry scraping to pull the latest message.
                  </span>
                  <button
                    type="button"
                    onClick={handleRetryScrape}
                    disabled={retrying}
                    className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white/40 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-white/70 disabled:opacity-60"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {retrying ? 'Retrying…' : 'Retry scrape'}
                  </button>
                </div>
              )}

              {/* Reply composer for unread */}
              {thread.status === 'unread' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-muted)]">Reply</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {replyText.length}/1000
                    </span>
                  </div>
                  <textarea
                    className="w-full min-h-[120px] max-h-[260px] rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] resize-vertical"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    maxLength={1000}
                    rows={4}
                    placeholder="Write your reply to the customer…"
                  />
                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSendReply}
                      disabled={sending}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--primary)]/90 disabled:opacity-60"
                    >
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}

