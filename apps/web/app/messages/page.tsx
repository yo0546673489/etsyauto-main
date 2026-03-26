'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import DashboardCard from '@/components/dashboard/DashboardCard';
import { useShop } from '@/lib/shop-context';
import { useToast } from '@/lib/toast-context';
import { messagesApi, type MessageThread, type MessageListResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';

type StatusFilter = 'all' | 'pending_read' | 'unread' | 'replied' | 'failed';

function formatTimeAgo(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function statusBadgeClasses(status: MessageThread['status']): string {
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

export default function MessagesInboxPage() {
  const router = useRouter();
  const { shops, selectedShopId } = useShop();
  const { showToast } = useToast();

  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);

  const shopOptions = useMemo(
    () => [{ id: 0, display_name: 'All shops' as string }, ...shops],
    [shops],
  );
  const [shopFilterId, setShopFilterId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedShopId) {
      setShopFilterId(selectedShopId);
    }
  }, [selectedShopId]);

  const loadThreads = async () => {
    try {
      setLoading(true);
      const res: MessageListResponse = await messagesApi.list(page, limit, {
        shopId: shopFilterId || undefined,
        status: statusFilter === 'all' ? null : statusFilter,
      });
      setThreads(res.threads);
      setTotal(res.total);
    } catch (error: any) {
      console.error('Failed to load message threads', error);
      showToast(error.detail || 'Failed to load messages', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThreads();
    // Auto-refresh every 30 seconds
    const id = setInterval(loadThreads, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, shopFilterId, statusFilter]);

  const handleRowClick = (threadId: number) => {
    router.push(`/messages/${threadId}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <DashboardLayout>
      <div className="max-w-[1200px] mx-auto space-y-6">
        <DashboardCard
          title="Messages"
          subtitle="View and reply to customer conversations from Etsy."
          icon={<MessageCircle className="w-5 h-5" />}
        >
          {/* Filters */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-[var(--text-muted)]">
                Shop
              </label>
              <select
                className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--background)] text-sm text-[var(--text-primary)]"
                value={shopFilterId ?? 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setShopFilterId(val === 0 ? null : val);
                  setPage(1);
                }}
              >
                {shopOptions.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: 'all', label: 'All' },
                { key: 'unread', label: 'Unread' },
                { key: 'replied', label: 'Replied' },
                { key: 'failed', label: 'Failed' },
              ] as const).map((btn) => {
                const active = statusFilter === btn.key;
                return (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(btn.key);
                      setPage(1);
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      active
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--card-hover)]',
                    )}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              No messages yet. Once customers contact you on Etsy, new conversations will appear here.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {threads.map((thread) => {
                const shopName =
                  shops.find((s) => s.id === thread.shop_id)?.display_name ?? `Shop #${thread.shop_id}`;
                const isReplied = thread.status === 'replied';
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleRowClick(thread.id)}
                    className="w-full text-left py-3 px-2 hover:bg-[var(--card-hover)] transition-colors flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-[var(--text-muted)] truncate">
                            {shopName}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {thread.customer_name || 'Unknown customer'}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                            statusBadgeClasses(thread.status),
                          )}
                        >
                          {thread.status === 'pending_read'
                            ? 'Pending'
                            : thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          'text-xs truncate',
                          isReplied ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {thread.customer_message_preview || 'No message text yet'}
                      </p>
                    </div>
                    {thread.created_at && (
                      <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap ml-2">
                        {formatTimeAgo(thread.created_at)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-[var(--text-muted)]">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={cn(
                    'px-2 py-1 rounded border border-[var(--border-color)]',
                    page <= 1 && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={cn(
                    'px-2 py-1 rounded border border-[var(--border-color)]',
                    page >= totalPages && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </DashboardLayout>
  );
}

