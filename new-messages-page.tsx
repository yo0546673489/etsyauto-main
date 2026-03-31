'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  msgConversationsApi, msgMessagesApi, msgRepliesApi,
  MsgConversation, MsgMessage,
} from '@/lib/messages-api';
import { useShop } from '@/lib/shop-context';
import MsgAvatar from '@/components/messages/MsgAvatar';
import MsgConversationItem from '@/components/messages/MsgConversationItem';
import MsgBubble from '@/components/messages/MsgBubble';
import MsgDateSeparator from '@/components/messages/MsgDateSeparator';
import MsgSkeleton from '@/components/messages/MsgSkeleton';
import { MessageCircle, Search, Send, ChevronLeft } from 'lucide-react';

type PendingMsg = MsgMessage & { _pending?: boolean; _failed?: boolean };

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

const statusLabels: Record<string, string> = {
  new: 'חדש', open: 'פתוח', answered: 'נענה', closed: 'סגור',
};

export default function MessagesPage() {
  const { selectedShopIds } = useShop();
  const [conversations, setConversations] = useState<MsgConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedConv, setSelectedConv] = useState<MsgConversation | null>(null);
  const [messages, setMessages] = useState<PendingMsg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [apiError, setApiError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations — filtered by globally selected shops
  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    setApiError(false);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      // Always fetch all then filter client-side by selected shop IDs
      // This ensures stores 9, 13, etc. are never shown unless explicitly selected
      const data = await msgConversationsApi.getAll(params);

      if (selectedShopIds.length > 0) {
        // Filter to only conversations belonging to selected shops
        setConversations(data.filter(c => selectedShopIds.includes(c.store_id)));
      } else {
        // No shop context yet (loading) — show all temporarily
        setConversations(data);
      }
    } catch {
      setApiError(true);
    } finally {
      setConvLoading(false);
    }
  }, [selectedShopIds, statusFilter, search]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    msgMessagesApi.getByConversation(selectedId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [replyText]);

  const selectConversation = async (id: number) => {
    setSelectedId(id);
    setShowMobileChat(true);
    setSendFailed(false);
    setReplyText('');
    try {
      const conv = await msgConversationsApi.getOne(id);
      setSelectedConv(conv);
    } catch {}
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedId || !selectedConv) return;
    await msgConversationsApi.updateStatus(selectedId, status).catch(() => {});
    const updated = { ...selectedConv, status: status as MsgConversation['status'] };
    setSelectedConv(updated);
    setConversations(prev => prev.map(c => c.id === selectedId ? updated : c));
  };

  const handleSend = async () => {
    if (!replyText.trim() || !selectedId || !selectedConv || sending) return;
    const text = replyText.trim();
    setReplyText('');
    setSendFailed(false);
    setSending(true);

    const tempMsg: PendingMsg = {
      id: Date.now() * -1,
      conversation_id: selectedId,
      sender_type: 'store',
      sender_name: selectedConv.store_name || `חנות ${selectedConv.store_number}`,
      message_text: text,
      sent_at: new Date().toISOString(),
      _pending: true,
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await msgRepliesApi.send(selectedId, text);
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, _pending: false } : m));
    } catch {
      setSendFailed(true);
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, _pending: false, _failed: true } : m));
      setReplyText(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      {/* -m-6 cancels DashboardLayout p-6, h-full fills remaining space */}
      <div className="-m-6 flex h-full overflow-hidden" dir="rtl" style={{ minHeight: 0 }}>

        {/* ── RIGHT PANEL: Conversation List (35%) ── */}
        <div className={`flex flex-col border-l border-[var(--border-color)] bg-[var(--card-bg)]
          ${showMobileChat ? 'hidden md:flex' : 'flex'}
          w-full md:w-[35%] lg:w-[30%] min-w-0`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h1 className="text-lg font-bold text-[var(--text-primary)]">הודעות</h1>
            </div>
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש..."
                className="w-full pr-9 pl-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--background)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                dir="rtl"
              />
            </div>
            {/* Status filter only — store filter removed (uses global store selector) */}
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--background)] text-[var(--text-secondary)] focus:outline-none"
              >
                <option value="">כל הסטטוסים</option>
                <option value="new">חדש</option>
                <option value="open">פתוח</option>
                <option value="answered">נענה</option>
                <option value="closed">סגור</option>
              </select>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {apiError ? (
              <div className="p-4 text-center text-sm text-[var(--text-muted)]">
                <p className="mb-2">לא ניתן להתחבר למערכת ההודעות</p>
                <p className="text-xs">ודא שהשרת רץ על פורט 3500</p>
                <button onClick={loadConversations} className="mt-2 text-xs underline" style={{ color: 'var(--primary)' }}>
                  נסה שוב
                </button>
              </div>
            ) : convLoading ? (
              <MsgSkeleton count={7} />
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">
                אין שיחות להצגה
              </div>
            ) : (
              conversations.map(conv => (
                <MsgConversationItem
                  key={conv.id}
                  conv={conv}
                  isSelected={selectedId === conv.id}
                  onClick={() => selectConversation(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── LEFT PANEL: Chat Window (65%) ── */}
        <div className={`flex flex-col flex-1 min-w-0 bg-[var(--background)]
          ${!showMobileChat ? 'hidden md:flex' : 'flex'}`}
        >
          {!selectedConv ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center px-4"
              style={{ backgroundColor: 'var(--card-bg)' }}>
              <MessageCircle className="w-16 h-16 mb-4 opacity-10" style={{ color: 'var(--primary)' }} />
              <p className="text-base font-medium text-[var(--text-secondary)]">בחר שיחה מהרשימה</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">כדי לצפות בהודעות ולשלוח תגובות</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[var(--card-bg)] flex-shrink-0">
                {/* Mobile back */}
                <button
                  onClick={() => setShowMobileChat(false)}
                  className="md:hidden p-1 rounded hover:bg-[var(--card-hover)]"
                >
                  <ChevronLeft className="w-5 h-5 text-[var(--text-muted)]" />
                </button>
                <MsgAvatar name={selectedConv.customer_name} />
                <div className="flex-1 min-w-0 text-right">
                  <h2 className="font-semibold text-[var(--text-primary)] text-sm">
                    {selectedConv.customer_name}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {selectedConv.store_name || `חנות ${selectedConv.store_number}`}
                  </p>
                </div>
                <select
                  value={selectedConv.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--background)] text-[var(--text-secondary)] focus:outline-none"
                >
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto py-3" style={{ backgroundColor: '#f7f9f8' }}>
                {msgLoading ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex justify-center items-center h-full text-sm text-[var(--text-muted)]">
                    אין הודעות עדיין
                  </div>
                ) : (
                  <>
                    {(() => {
                    const seenUrls = new Set<string>();
                    return messages.map((msg, i) => {
                      // Extract etsy listing URLs from this message
                      const allUrls = (
                        msg.message_text.match(/https?:\/\/[^\s]*etsy\.com\/listing\/\d+[^\s]*/gi) ||
                        msg.message_text.match(/www\.etsy\.com\/listing\/\d+[^\s]*/gi) ||
                        []
                      ).map((u: string) => u.startsWith('http') ? u : 'https://' + u);

                      // Only show card for URLs we haven't shown yet in this conversation
                      const newUrls = allUrls.filter((u: string) => !seenUrls.has(u));
                      newUrls.forEach((u: string) => seenUrls.add(u));

                      return (
                        <div key={msg.id}>
                          {(i === 0 || !isSameDay(messages[i - 1].sent_at, msg.sent_at)) && (
                            <MsgDateSeparator date={msg.sent_at} />
                          )}
                          <MsgBubble
                            senderType={msg.sender_type}
                            senderName={msg.sender_name}
                            text={msg.message_text}
                            sentAt={msg.sent_at}
                            pending={msg._pending}
                            failed={msg._failed}
                            cardUrls={newUrls}
                          />
                        </div>
                      );
                    });
                  })()}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {/* Reply Input */}
              <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--card-bg)] px-4 py-3">
                {sendFailed && (
                  <p className="text-xs text-red-500 mb-2">שליחה נכשלה ❌ — בדוק שהמערכת פועלת</p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={e => { setReplyText(e.target.value); setSendFailed(false); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="כתוב הודעה... (Enter לשליחה)"
                    disabled={sending}
                    rows={1}
                    dir="rtl"
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--background)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
                    style={{ minHeight: '40px', maxHeight: '100px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!replyText.trim() || sending}
                    className="p-2.5 rounded-xl text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 transition-opacity"
                    style={{ backgroundColor: 'var(--primary)', minWidth: '44px', minHeight: '40px' }}
                  >
                    {sending
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
