import { useState, useEffect, useCallback } from 'react';
import { conversationApi, Conversation } from '../api/client';

export function useConversations(filters?: { store_id?: number; status?: string; search?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationApi.getAll(filters);
      setConversations(data);
    } catch {
      setError('שגיאה בטעינת שיחות');
    } finally {
      setLoading(false);
    }
  }, [filters?.store_id, filters?.status, filters?.search]);

  useEffect(() => { load(); }, [load]);

  const updateConversationStatus = (id: number, status: Conversation['status']) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const prependOrUpdate = (conv: Conversation) => {
    setConversations(prev => {
      const exists = prev.find(c => c.id === conv.id);
      if (exists) return prev.map(c => c.id === conv.id ? conv : c);
      return [conv, ...prev];
    });
  };

  return { conversations, loading, error, reload: load, updateConversationStatus, prependOrUpdate };
}
