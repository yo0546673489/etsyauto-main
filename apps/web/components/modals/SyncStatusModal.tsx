'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { tasksApi, type TaskStatus } from '@/lib/api';
import { useLanguage } from '@/lib/language-context';
import { Loader2, CheckCircle, XCircle, X } from 'lucide-react';

interface SyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  syncType: 'orders' | 'products';
  onComplete?: () => void;
}

const LAST_SYNC_KEY_PREFIX = 'lastSync_';

export function SyncStatusModal({ isOpen, onClose, taskId, syncType, onComplete }: SyncStatusModalProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pollingRef = useRef(false);
  // Guard: if set to true (modal closed mid-poll) the polling callback must not
  // call onComplete or update component state.
  const cancelledRef = useRef(false);

  const poll = useCallback(async () => {
    if (!taskId || pollingRef.current) return;
    pollingRef.current = true;
    cancelledRef.current = false;
    setPolling(true);
    try {
      const finalStatus = await tasksApi.pollUntilComplete(
        taskId,
        (s) => {
          if (!cancelledRef.current) setStatus(s);
        },
        2000,
        60
      );
      if (cancelledRef.current) return;
      setStatus(finalStatus);
      if (finalStatus.status === 'completed') {
        localStorage.setItem(`${LAST_SYNC_KEY_PREFIX}${syncType}`, Date.now().toString());
        onCompleteRef.current?.();
      }
    } catch {
      if (cancelledRef.current) return;
      setStatus({
        task_id: taskId,
        state: 'ERROR',
        ready: true,
        status: 'failed',
        error: t('sync.checkFailed'),
      });
    } finally {
      setPolling(false);
      pollingRef.current = false;
    }
  }, [taskId, syncType]);

  useEffect(() => {
    if (isOpen && taskId) {
      cancelledRef.current = false;
      setStatus(null);
      poll();
    }
    // When the modal closes, mark any in-flight poll as cancelled.
    return () => {
      if (!isOpen) {
        cancelledRef.current = true;
      }
    };
  }, [isOpen, taskId, poll]);

  if (!isOpen) return null;

  const result = status?.result as Record<string, any> | undefined;
  const isComplete = status?.ready;
  const isSuccess = status?.status === 'completed';
  const isFailed = status?.status === 'failed';

  const created = result?.orders_created ?? result?.products_created ?? 0;
  const updated = result?.orders_updated ?? result?.products_updated ?? 0;
  const skipped = result?.orders_skipped ?? result?.skipped ?? 0;
  const totalProcessed = created + updated + skipped;
  const isAlreadySynced = isSuccess && created === 0 && updated === 0;

  const label = syncType === 'orders' ? t('sync.orders') : t('sync.products');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] max-w-md w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {label} {t('sync.title')}
          </h3>
          {isComplete && (
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-col items-center text-center py-4 space-y-4">
          {!isComplete && (
            <>
              <Loader2 className="w-12 h-12 text-[var(--primary)] animate-spin" />
              <div>
                <p className="text-[var(--text-primary)] font-medium">{t('sync.syncing')} {label.toLowerCase()}...</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {status?.state === 'PENDING' ? t('sync.waitingWorker') : t('sync.processing')}
                </p>
              </div>
            </>
          )}

          {isComplete && isSuccess && isAlreadySynced && (
            <>
              <CheckCircle className="w-12 h-12 text-green-400" />
              <div>
                <p className="text-[var(--text-primary)] font-medium">{t('sync.alreadyUpToDate')}</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {label} {t('sync.alreadySyncedMessage')}
                </p>
              </div>
            </>
          )}

          {isComplete && isSuccess && !isAlreadySynced && (
            <>
              <CheckCircle className="w-12 h-12 text-green-400" />
              <div>
                <p className="text-[var(--text-primary)] font-medium">{t('sync.complete')}</p>
                <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-400">{created}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('sync.new')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-400">{updated}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('sync.updated')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-muted)]">{skipped}</p>
                    <p className="text-xs text-[var(--text-muted)]">{t('sync.skipped')}</p>
                  </div>
                </div>
                {totalProcessed > 0 && (
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    {totalProcessed} {label.toLowerCase()} {t('sync.processed')}
                  </p>
                )}
              </div>
            </>
          )}

          {isComplete && isFailed && (
            <>
              <XCircle className="w-12 h-12 text-red-400" />
              <div>
                <p className="text-[var(--text-primary)] font-medium">{t('sync.failed')}</p>
                <p className="text-sm text-red-400 mt-1">{status?.error || t('sync.unknownError')}</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {isComplete && (
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-[var(--primary)] text-white rounded-lg hover:opacity-90"
            >
              {t('common.close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to check if a recent sync was done.
 * Returns true if sync was done within the given window (default 5 min).
 */
export function useRecentSync(syncType: 'orders' | 'products', windowMs: number = 5 * 60 * 1000) {
  const key = `${LAST_SYNC_KEY_PREFIX}${syncType}`;
  const lastSync = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  const lastSyncTime = lastSync ? parseInt(lastSync, 10) : 0;
  const wasSyncedRecently = Date.now() - lastSyncTime < windowMs;
  return { wasSyncedRecently, lastSyncTime };
}
