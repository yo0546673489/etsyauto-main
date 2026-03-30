'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notificationsApi, type Notification } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/language-context';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  ShoppingCart,
  FileText,
  AlertCircle,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings as SettingsIcon,
} from 'lucide-react';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
  onCountChange: (count: number) => void;
}

export function NotificationPanel({ isOpen, onClose, unreadCount, onCountChange }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const { showToast } = useToast();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, showUnreadOnly]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationsApi.getAll(0, 20, showUnreadOnly);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      showToast(t('notifications.loadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationsApi.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      // Update unread count
      const newCount = Math.max(0, unreadCount - 1);
      onCountChange(newCount);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onCountChange(0);
      showToast(t('notifications.markAllRead'), 'success');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      showToast(t('notifications.markAllFailed'), 'error');
    }
  };

  const handleDelete = async (notificationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      // Update unread count if the deleted notification was unread
      const deletedNotification = notifications.find((n) => n.id === notificationId);
      if (deletedNotification && !deletedNotification.read) {
        onCountChange(Math.max(0, unreadCount - 1));
      }
      showToast(t('notifications.deleted'), 'success');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      showToast(t('notifications.deleteFailed'), 'error');
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await handleMarkAsRead(notification.id, { stopPropagation: () => {} } as React.MouseEvent);
    }

    // Navigate if action URL exists
    if (notification.action_url) {
      router.push(notification.action_url);
      onClose();
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    const iconClasses = 'w-5 h-5';
    const typeStr = typeof type === 'string' ? type.toLowerCase() : type;
    switch (typeStr) {
      case 'success':
        return <CheckCircle className={`${iconClasses} text-[var(--success)]`} />;
      case 'error':
        return <XCircle className={`${iconClasses} text-[var(--danger)]`} />;
      case 'warning':
        return <AlertTriangle className={`${iconClasses} text-[var(--warning)]`} />;
      case 'order':
        return <ShoppingCart className={`${iconClasses} text-[var(--info)]`} />;
      case 'listing':
        return <FileText className={`${iconClasses} text-[var(--primary)]`} />;
      case 'team':
        return <CheckCircle className={`${iconClasses} text-[var(--success)]`} />;
      case 'system':
        return <SettingsIcon className={`${iconClasses} text-[var(--text-muted)]`} />;
      default:
        return <Info className={`${iconClasses} text-[var(--info)]`} />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.justNow');
    if (diffMins < 60) return `${diffMins}${t('notifications.minutesAgo')}`;
    if (diffHours < 24) return `${diffHours}${t('notifications.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays}${t('notifications.daysAgo')}`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute end-0 mt-2 w-96 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--background)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Bell className="w-5 h-5" />
              {t('notifications.title')}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--card-bg)] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Filter and Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showUnreadOnly
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background)] text-[var(--text-secondary)] hover:bg-[var(--card-bg)]'
              }`}
            >
              {showUnreadOnly ? t('notifications.unread') : t('notifications.all')}
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] hover:bg-[var(--card-bg)] rounded-lg text-sm font-medium text-[var(--text-secondary)] transition-colors"
                title={t('notifications.markAllRead')}
              >
                <CheckCheck className="w-4 h-4" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Bell className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-muted)]">
                {showUnreadOnly ? t('notifications.noneUnread') : t('notifications.none')}
              </p>
              <p className="text-[var(--text-muted)] text-sm mt-1">
                {showUnreadOnly ? t('notifications.allCaughtUp') : t('notifications.willAppear')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 transition-colors ${
                    notification.read
                      ? 'bg-[var(--card-bg)] hover:bg-[var(--background)]'
                      : 'bg-[var(--primary-bg)] hover:bg-[var(--primary-bg)]/80'
                  } ${notification.action_url ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          className={`font-semibold ${
                            notification.read ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-[var(--primary)] flex-shrink-0 mt-1.5" />
                        )}
                      </div>

                      <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
                        {notification.message}
                      </p>

                      {notification.action_label && (
                        <span className="inline-block mt-2 text-sm text-[var(--primary)] font-medium">
                          {notification.action_label} →
                        </span>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatTime(notification.created_at)}
                        </span>

                        {/* Actions */}
                        <div className="flex items-center gap-1 ms-auto">
                          {!notification.read && (
                            <button
                              onClick={(e) => handleMarkAsRead(notification.id, e)}
                              className="p-1.5 hover:bg-[var(--background)] rounded transition-colors"
                              title={t('notifications.markAsRead')}
                            >
                              <Check className="w-4 h-4 text-[var(--text-muted)]" />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(notification.id, e)}
                            className="p-1.5 hover:bg-[var(--danger-bg)] rounded transition-colors group"
                            title={t('notifications.delete')}
                          >
                            <Trash2 className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--danger)]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-3 border-t border-[var(--border-color)] bg-[var(--background)] text-center">
            <button
              onClick={() => {
                router.push('/settings?tab=notifications');
                onClose();
              }}
              className="text-sm text-[var(--primary)] hover:underline font-medium"
            >
              {t('notifications.viewAll')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
