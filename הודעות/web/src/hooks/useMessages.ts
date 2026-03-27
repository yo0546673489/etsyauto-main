import { useState, useEffect } from 'react';
import { messageApi, Message } from '../api/client';

export function useMessages(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    messageApi.getByConversation(conversationId)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [conversationId]);

  const addMessage = (msg: Message) => setMessages(prev => [...prev, msg]);
  const updateMessage = (id: number, updates: Partial<Message>) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));

  return { messages, loading, addMessage, updateMessage };
}
