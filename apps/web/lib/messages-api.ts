// API client for the new messages system (port 3500)
const MESSAGES_API = process.env.NEXT_PUBLIC_MESSAGES_API_URL || 'http://localhost:3500';

export interface MsgConversation {
  id: number;
  store_id: number;
  store_number: number;
  store_name: string;
  etsy_conversation_url: string;
  customer_name: string;
  last_message_text: string | null;
  last_message_at: string | null;
  status: 'new' | 'open' | 'answered' | 'closed';
  ai_mode?: boolean;
}

export interface MsgCardData {
  image?: string;
  title?: string;
  salePrice?: string;
  origPrice?: string;
  url?: string;
}

export interface MsgMessage {
  id: number;
  conversation_id: number;
  sender_type: 'customer' | 'store';
  sender_name: string;
  message_text: string;
  sent_at: string;
  image_urls?: string[];
  card_data?: MsgCardData;
}

export interface MsgStore {
  id: number;
  store_number: number;
  store_name: string;
  store_email: string;
  adspower_profile_id: string;
  initial_sync_completed: boolean;
  status: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${MESSAGES_API}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const msgConversationsApi = {
  getAll: (params?: { store_id?: number; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.store_id) q.set('store_id', String(params.store_id));
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return apiFetch<{ conversations: MsgConversation[] }>(`/conversations${qs ? `?${qs}` : ''}`).then(r => r.conversations);
  },
  getOne: (id: number) => apiFetch<MsgConversation>(`/conversations/${id}`),
  updateStatus: (id: number, status: string) =>
    apiFetch(`/conversations/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  setAiMode: (id: number, ai_mode: boolean) =>
    apiFetch<{ success: boolean; ai_mode: boolean }>(`/conversations/${id}/ai-mode`, {
      method: 'PUT', body: JSON.stringify({ ai_mode }),
    }),
  getGlobalAiMode: () =>
    apiFetch<{ ai_mode: boolean; enabled: number; total: number }>('/conversations/ai-mode/global'),
  setGlobalAiMode: (ai_mode: boolean) =>
    apiFetch<{ success: boolean; ai_mode: boolean }>('/conversations/ai-mode/global', {
      method: 'PUT', body: JSON.stringify({ ai_mode }),
    }),
};

export const msgMessagesApi = {
  getByConversation: (id: number) =>
    apiFetch<{ messages: MsgMessage[] }>(`/messages/conversation/${id}`).then(r => r.messages),
};

export const msgRepliesApi = {
  send: (conversation_id: number, message_text: string) =>
    apiFetch<{ success: boolean; replyQueueId: number; status: string }>('/replies', {
      method: 'POST',
      body: JSON.stringify({ conversation_id, message_text }),
    }),
};

export const msgStoresApi = {
  getAll: () => apiFetch<{ stores: MsgStore[] }>('/stores').then(r => r.stores),
};
