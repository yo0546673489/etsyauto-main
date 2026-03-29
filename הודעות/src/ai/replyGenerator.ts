import axios from 'axios';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface AISettings {
  enabled: boolean;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number;
  language: string;
  auto_send: boolean;
}

interface GeneratedReply {
  text: string;
  source: 'ai';
}

export class AIReplyGenerator {
  private pool: Pool;
  private apiKey: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * טוען הגדרות AI לחנות ופיצ'ר ספציפי
   */
  async getSettings(storeId: number, feature: 'messages' | 'reviews'): Promise<AISettings | null> {
    const result = await this.pool.query(
      'SELECT * FROM ai_settings WHERE store_id = $1 AND feature = $2',
      [storeId, feature]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * יוצר תגובה להודעת לקוח
   */
  async generateMessageReply(
    storeId: number,
    customerName: string,
    customerMessage: string,
    conversationHistory: { sender: string; text: string }[]
  ): Promise<GeneratedReply | null> {
    const settings = await this.getSettings(storeId, 'messages');
    if (!settings || !settings.enabled) return null;

    const historyText = conversationHistory
      .slice(-10) // עד 10 הודעות אחרונות
      .map(m => `${m.sender}: ${m.text}`)
      .join('\n');

    const userPrompt = `
היסטוריית שיחה:
${historyText}

הודעה חדשה מ-${customerName}:
"${customerMessage}"

כתוב תגובה מתאימה בשפה: ${settings.language}
`;

    return await this.callAPI(settings, userPrompt);
  }

  /**
   * יוצר תגובה לביקורת
   */
  async generateReviewReply(
    storeId: number,
    reviewerName: string,
    reviewRating: number,
    reviewText: string,
    productName?: string
  ): Promise<GeneratedReply | null> {
    const settings = await this.getSettings(storeId, 'reviews');
    if (!settings || !settings.enabled) return null;

    const userPrompt = `
ביקורת מ-${reviewerName}:
דירוג: ${'⭐'.repeat(reviewRating)} (${reviewRating}/5)
${productName ? `מוצר: ${productName}` : ''}
תוכן: "${reviewText}"

כתוב תגובה מתאימה מטעם החנות בשפה: ${settings.language}
`;

    return await this.callAPI(settings, userPrompt);
  }

  /**
   * קריאה ל-Anthropic API
   */
  private async callAPI(settings: AISettings, userPrompt: string): Promise<GeneratedReply | null> {
    if (!this.apiKey) {
      logger.error('ANTHROPIC_API_KEY not configured');
      return null;
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: settings.model,
          max_tokens: settings.max_tokens,
          system: settings.system_prompt,
          messages: [{ role: 'user', content: userPrompt }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 30000,
        }
      );

      const text = response.data.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      if (!text) {
        logger.warn('AI returned empty response');
        return null;
      }

      logger.info(`AI generated reply: ${text.substring(0, 50)}...`);
      return { text: text.trim(), source: 'ai' };
    } catch (error: any) {
      logger.error('AI API call failed', error?.response?.data || error.message);
      return null;
    }
  }
}
