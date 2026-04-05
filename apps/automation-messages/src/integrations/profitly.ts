import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface ProfixMessage {
  sender_type: 'customer' | 'store';
  sender_name: string;
  message_text: string;
  sent_at: string;
}

export interface ProfixConversationPayload {
  store_id: number;
  store_number: number;
  store_email: string;
  customer_name: string;
  etsy_conversation_url: string;
  status: string;
  messages: ProfixMessage[];
  synced_at: string;
}

export class ProfixNotifier {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    const baseURL = process.env.PROFITLY_API_URL || 'http://localhost:8000';
    const apiKey = process.env.PROFITLY_API_KEY || '';
    this.enabled = !!(baseURL && apiKey && apiKey !== 'internal-key-here');

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
      },
      timeout: 10000,
    });
  }

  async notifyConversation(payload: ProfixConversationPayload): Promise<void> {
    if (!this.enabled) {
      logger.debug('Profix notifier disabled (no API key configured)');
      return;
    }
    try {
      await this.client.post('/api/etsy/conversations', payload);
      logger.info(`Profix notified: store ${payload.store_number} / ${payload.customer_name}`);
    } catch (error: any) {
      // Non-fatal: log but don't throw — Profix outage shouldn't break the sync
      logger.warn(`Profix notification failed: ${error?.message || error}`);
    }
  }
}
