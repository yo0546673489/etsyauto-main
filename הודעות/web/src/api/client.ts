import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export interface Store {
  id: number;
  store_number: number;
  store_name: string;
  store_email: string;
  adspower_profile_id: string;
  initial_sync_completed: boolean;
  status: string;
}

export interface Conversation {
  id: number;
  store_id: number;
  store_number: number;
  store_name: string;
  etsy_conversation_url: string;
  customer_name: string;
  last_message_text: string;
  last_message_at: string | null;
  status: 'new' | 'open' | 'answered' | 'closed';
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_type: 'customer' | 'store';
  sender_name: string;
  message_text: string;
  sent_at: string;
}

export const storeApi = {
  getAll: () => api.get<{ stores: Store[] }>('/stores').then(r => r.data.stores),
  triggerInitialSync: (id: number) => api.post(`/stores/${id}/initial-sync`).then(r => r.data),
  update: (id: number, data: Partial<Store>) => api.put(`/stores/${id}`, data).then(r => r.data),
};

export const conversationApi = {
  getAll: (params?: { store_id?: number; status?: string; search?: string }) =>
    api.get<{ conversations: Conversation[] }>('/conversations', { params }).then(r => r.data.conversations),
  getOne: (id: number) => api.get<Conversation>(`/conversations/${id}`).then(r => r.data),
  updateStatus: (id: number, status: string) => api.put(`/conversations/${id}/status`, { status }),
};

export const messageApi = {
  getByConversation: (conversationId: number) =>
    api.get<{ messages: Message[] }>(`/messages/conversation/${conversationId}`).then(r => r.data.messages),
};

export const replyApi = {
  send: (conversation_id: number, message_text: string, source?: string) =>
    api.post<{ success: boolean; replyQueueId: number; status: string }>('/replies', { conversation_id, message_text, source }).then(r => r.data),
  aiGenerate: (conversation_id: number) =>
    api.post<{ success: boolean; generatedReply: string; source: string }>('/replies/ai-generate', { conversation_id }).then(r => r.data),
};

export interface ReviewReply {
  id: number;
  store_id: number;
  reviewer_name: string;
  review_rating: number;
  review_text: string;
  reply_text: string;
  reply_source: 'manual' | 'ai';
  status: string;
  created_at: string;
  sent_at?: string;
}

export const reviewApi = {
  getAll: (params?: { store_id?: number; status?: string }) =>
    api.get<{ reviews: ReviewReply[] }>('/reviews', { params }).then(r => r.data.reviews),
  create: (data: { store_id: number; reviewer_name?: string; review_rating?: number; review_text?: string; reply_text: string }) =>
    api.post('/reviews', data).then(r => r.data),
  aiGenerate: (data: { store_id: number; reviewer_name?: string; review_rating?: number; review_text: string; product_name?: string }) =>
    api.post<{ success: boolean; generatedReply: string }>('/reviews/ai-generate', data).then(r => r.data),
};

export interface DiscountTask {
  id: number;
  store_id: number;
  task_type: string;
  sale_name: string;
  discount_percent: number;
  status: string;
  created_at: string;
  executed_at?: string;
}

export const discountApi = {
  getTasks: (params?: { store_id?: number; status?: string }) =>
    api.get<{ tasks: DiscountTask[] }>('/discounts/tasks', { params }).then(r => r.data.tasks),
  createTask: (data: any) =>
    api.post('/discounts/tasks', data).then(r => r.data),
  getSchedules: (params?: { store_id?: number }) =>
    api.get('/discounts/schedules', { params }).then(r => r.data.schedules),
  createSchedule: (data: any) =>
    api.post('/discounts/schedules', data).then(r => r.data),
};
