import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeApi, conversationApi, Store, Conversation } from '../api/client';
import { useConversations } from '../hooks/useConversations';
import { useMessages } from '../hooks/useMessages';
import { useSendReply } from '../hooks/useSendReply';
import ConversationList from '../components/ConversationList';
import ChatWindow from '../components/ChatWindow';
import ChatHeader from '../components/ChatHeader';
import EmptyState from '../components/EmptyState';
import SearchBar from '../components/SearchBar';
import StoreFilter from '../components/StoreFilter';
import StatusFilter from '../components/StatusFilter';

export default function MessagesPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [storeFilter, setStoreFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [isMobileChat, setIsMobileChat] = useState(false);

  const filters = {
    store_id: storeFilter ?? undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  };

  const { conversations, loading, updateConversationStatus } = useConversations(filters);
  const { messages, loading: msgLoading, addMessage } = useMessages(selectedId);
  const { status: replyStatus, sendReply, reset: resetReply } = useSendReply();

  useEffect(() => {
    storeApi.getAll().then(setStores).catch(console.error);
  }, []);

  const handleSelectConversation = useCallback(async (id: number) => {
    setSelectedId(id);
    setIsMobileChat(true);
    try {
      const conv = await conversationApi.getOne(id);
      setSelectedConv(conv);
    } catch {}
  }, []);

  const handleStatusChange = async (status: string) => {
    if (!selectedId || !selectedConv) return;
    await conversationApi.updateStatus(selectedId, status);
    const updated = { ...selectedConv, status: status as Conversation['status'] };
    setSelectedConv(updated);
    updateConversationStatus(selectedId, status as Conversation['status']);
  };

  const handleSend = async (text: string) => {
    if (!selectedId || !selectedConv) return;
    const tempId = Date.now() * -1;
    addMessage({
      id: tempId,
      conversation_id: selectedId,
      sender_type: 'store',
      sender_name: selectedConv.store_name || `חנות ${selectedConv.store_number}`,
      message_text: text,
      sent_at: new Date().toISOString(),
      _status: 'sending',
    } as any);
    await sendReply(selectedId, text);
  };

  return (
    <div className="flex flex-col h-screen bg-white" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">הודעות</h1>
        <div className="flex-1 max-w-sm">
          <SearchBar value={search} onChange={setSearch} />
        </div>
        <StoreFilter stores={stores} selected={storeFilter} onSelect={setStoreFilter} />
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <button
          onClick={() => navigate('/stores')}
          className="text-sm text-blue-600 hover:underline whitespace-nowrap"
        >
          חנויות
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation List - RIGHT panel (RTL) */}
        <div
          className={`border-r border-gray-200 flex flex-col overflow-hidden
            ${isMobileChat ? 'hidden md:flex' : 'flex'}
            w-full md:w-[35%] lg:w-[30%]`}
          style={{ minWidth: 0 }}
        >
          <div className="text-xs text-gray-400 px-4 py-2 border-b border-gray-100 bg-gray-50">
            {conversations.length} שיחות
          </div>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            loading={loading}
            onSelect={handleSelectConversation}
          />
        </div>

        {/* Chat Window - LEFT panel */}
        <div
          className={`flex flex-col flex-1 overflow-hidden
            ${!isMobileChat ? 'hidden md:flex' : 'flex'}`}
        >
          {selectedConv ? (
            <>
              {/* Mobile back button */}
              <div className="md:hidden">
                <button
                  onClick={() => setIsMobileChat(false)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-blue-600 border-b border-gray-200 w-full"
                >
                  ← חזרה לרשימה
                </button>
              </div>
              <ChatHeader conversation={selectedConv} onStatusChange={handleStatusChange} />
              <div className="flex-1 overflow-hidden">
                <ChatWindow
                  messages={messages}
                  loading={msgLoading}
                  replyStatus={replyStatus}
                  onSend={handleSend}
                  onRetry={resetReply}
                />
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}
