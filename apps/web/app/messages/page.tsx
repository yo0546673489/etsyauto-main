'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  msgConversationsApi, msgMessagesApi, msgRepliesApi, msgStoresApi,
  MsgConversation, MsgMessage, MsgStore,
} from '@/lib/messages-api';
import { useShop } from '@/lib/shop-context';
import MsgAvatar from '@/components/messages/MsgAvatar';
import MsgConversationItem from '@/components/messages/MsgConversationItem';
import MsgBubble from '@/components/messages/MsgBubble';
import MsgDateSeparator from '@/components/messages/MsgDateSeparator';
import MsgSkeleton from '@/components/messages/MsgSkeleton';
import { MessageCircle, Search, Send, ChevronLeft, Smile, ChevronDown, Bot } from 'lucide-react';

type PendingMsg = MsgMessage & { _pending?: boolean; _failed?: boolean };

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

const statusLabels: Record<string, string> = {
  new: 'חדש', open: 'פתוח', answered: 'נענה', closed: 'סגור',
};

export default function MessagesPage() {
  const { selectedShops, shops } = useShop();
  const [msgStores, setMsgStores] = useState<MsgStore[]>([]);
  const [conversations, setConversations] = useState<MsgConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedConv, setSelectedConv] = useState<MsgConversation | null>(null);
  const [messages, setMessages] = useState<PendingMsg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [globalAiMode, setGlobalAiMode] = useState(false);
  const [aiToggling, setAiToggling] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [apiError, setApiError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages-system stores once for name-based mapping
  useEffect(() => {
    msgStoresApi.getAll().then(setMsgStores).catch(() => {});
    msgConversationsApi.getGlobalAiMode().then(r => setGlobalAiMode(r.ai_mode)).catch(() => {});
  }, []);

  // Map selected main-app shops → messages-system store IDs by exact name match
  const selectedMsgStoreIds = useMemo<Set<number> | null>(() => {
    if (!msgStores.length || selectedShops.length === 0) return null;
    // All shops selected → show everything (some may not have exact name match)
    if (selectedShops.length >= shops.length) return null;
    const ids = new Set<number>();
    for (const shop of selectedShops) {
      const shopName = shop.display_name.toLowerCase().trim();
      for (const ms of msgStores) {
        if (ms.store_name.toLowerCase().trim() === shopName) {
          ids.add(ms.id);
        }
      }
    }
    return ids.size > 0 ? ids : null;
  }, [selectedShops, shops, msgStores]);

  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    setApiError(false);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const data = await msgConversationsApi.getAll(params);
      setConversations(data);
    } catch {
      setApiError(true);
    } finally {
      setConvLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    msgMessagesApi.getByConversation(selectedId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
      // Mark as open if new — clears unread badge immediately
      if (conv.status === 'new') {
        await msgConversationsApi.updateStatus(id, 'open').catch(() => {});
        const updated = { ...conv, status: 'open' as const };
        setSelectedConv(updated);
        setConversations(prev => prev.map(c => c.id === id ? { ...c, status: 'open' as const } : c));
      } else {
        setSelectedConv(conv);
      }
    } catch {}
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedId || !selectedConv) return;
    await msgConversationsApi.updateStatus(selectedId, status).catch(() => {});
    const updated = { ...selectedConv, status: status as MsgConversation['status'] };
    setSelectedConv(updated);
    setConversations(prev => prev.map(c => c.id === selectedId ? updated : c));
  };

  const handleGlobalAiToggle = async () => {
    if (aiToggling) return;
    setAiToggling(true);
    const newMode = !globalAiMode;
    try {
      await msgConversationsApi.setGlobalAiMode(newMode);
      setGlobalAiMode(newMode);
    } catch {
      // ignore
    } finally {
      setAiToggling(false);
    }
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

  const displayedConversations = useMemo(() => {
    if (!selectedMsgStoreIds) return conversations;
    return conversations.filter(c => selectedMsgStoreIds.has(c.store_id));
  }, [conversations, selectedMsgStoreIds]);

  const unreadCount = displayedConversations.filter(c => c.status === 'new').length;

  return (
    <DashboardLayout>
      <div className="-m-6 flex h-full overflow-hidden bg-gray-50" dir="rtl" style={{ minHeight: 0 }}>

        {/* ── RIGHT PANEL: Conversation List ── */}
        <div className={`flex flex-col bg-white border-l border-gray-100 shadow-sm
          ${showMobileChat ? 'hidden md:flex' : 'flex'}
          w-full md:w-[320px] lg:w-[340px] flex-shrink-0`}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-black text-gray-800">הודעות</h1>
              {unreadCount > 0 && (
                <span className="bg-[#006d43] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} שלא נקראו
                </span>
              )}
            </div>
            {/* Global AI Toggle */}
            <button
              onClick={handleGlobalAiToggle}
              disabled={aiToggling}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border mb-3 transition-all ${
                globalAiMode
                  ? 'bg-[#006d43]/10 border-[#006d43]/30 text-[#006d43]'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              } ${aiToggling ? 'opacity-50 cursor-wait' : 'hover:border-[#006d43]/50'}`}
            >
              <div className="flex items-center gap-2">
                <Bot className={`w-4 h-4 ${globalAiMode ? 'text-[#006d43]' : 'text-gray-400'}`} />
                <span className="text-sm font-medium">מענה AI אוטומטי</span>
              </div>
              {/* Toggle Switch */}
              <div className={`relative w-10 h-5 rounded-full transition-colors ${globalAiMode ? 'bg-[#006d43]' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${globalAiMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש..."
                dir="rtl"
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#006d43]/20 focus:border-[#006d43]/40"
              />
            </div>
            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 text-gray-600 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="">כל הסטטוסים</option>
                <option value="new">חדש</option>
                <option value="open">פתוח</option>
                <option value="answered">נענה</option>
                <option value="closed">סגור</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {apiError ? (
              <div className="p-6 text-center text-sm text-gray-400">
                <p className="mb-2">לא ניתן להתחבר למערכת ההודעות</p>
                <button onClick={loadConversations} className="text-xs underline text-[#006d43]">נסה שוב</button>
              </div>
            ) : convLoading ? (
              <MsgSkeleton count={7} />
            ) : displayedConversations.length === 0 ? (
              <div className="p-6 text-center">
                <MessageCircle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">אין שיחות להצגה</p>
              </div>
            ) : (
              displayedConversations.map(conv => (
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

        {/* ── LEFT PANEL: Chat Window ── */}
        <div className={`flex flex-col flex-1 min-w-0 ${!showMobileChat ? 'hidden md:flex' : 'flex'}`}>
          {!selectedConv ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 bg-gray-50">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <MessageCircle className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-base font-semibold text-gray-500">בחר שיחה מהרשימה</p>
              <p className="text-sm text-gray-400 mt-1">כדי לצפות בהודעות ולשלוח תגובות</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-white flex-shrink-0 shadow-sm">
                <button onClick={() => setShowMobileChat(false)} className="md:hidden p-1 rounded hover:bg-gray-100">
                  <ChevronLeft className="w-5 h-5 text-gray-400" />
                </button>
                <MsgAvatar name={selectedConv.customer_name} size="md" />
                <div className="flex-1 min-w-0 text-right">
                  <h2 className="font-bold text-gray-800 text-sm">{selectedConv.customer_name}</h2>
                  <p className="text-xs text-gray-400">
                    {selectedConv.store_name || `חנות ${selectedConv.store_number}`}
                  </p>
                </div>

                <select
                  value={selectedConv.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 focus:outline-none"
                >
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto py-4" style={{ backgroundColor: '#f5f7f6' }}>
                {msgLoading ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="w-6 h-6 border-2 border-[#006d43] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex justify-center items-center h-full text-sm text-gray-400">
                    אין הודעות עדיין
                  </div>
                ) : (
                  <>
                    {(() => {
                      const seenUrls = new Set<string>();
                      return messages.map((msg, i) => {
                        const textUrls = (
                          msg.message_text.match(/https?:\/\/[^\s]*etsy\.com\/listing\/\d+[^\s]*/gi) || []
                        ).map((u: string) => u.startsWith('http') ? u : 'https://' + u);
                        const newCardUrls = textUrls.filter((u: string) => !seenUrls.has(u));
                        newCardUrls.forEach((u: string) => seenUrls.add(u));

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
                              imageUrls={msg.image_urls || []}
                              cardUrls={newCardUrls}
                              cardData={msg.card_data}
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
              <div className="flex-shrink-0 bg-white border-t border-gray-100 px-4 py-3">
                {globalAiMode && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-[#006d43] font-medium">
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI עונה אוטומטית — תוכל לכתוב ידנית בכל זמן</span>
                  </div>
                )}
                {sendFailed && (
                  <p className="text-xs text-red-500 mb-2">שליחה נכשלה ❌ — בדוק שהמערכת פועלת</p>
                )}
                <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-3 py-2">
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 flex-shrink-0">
                    <Smile className="w-5 h-5" />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={e => { setReplyText(e.target.value); setSendFailed(false); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="הקלד את ההודעה שלך כאן..."
                    disabled={sending}
                    rows={1}
                    dir="rtl"
                    className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-50"
                    style={{ minHeight: '24px', maxHeight: '100px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!replyText.trim() || sending}
                    className="w-9 h-9 rounded-full bg-[#006d43] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-opacity hover:bg-[#005a37]"
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
