import { Pool } from 'pg';
import { ScrapedConversation, ScrapedMessage } from '../browser/etsyScraper';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

export class SyncEngine {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private hashMessage(msg: ScrapedMessage): string {
    return createHash('sha256')
      .update(`${msg.senderName}|${msg.senderType}|${msg.messageText}|${msg.sentAt}`)
      .digest('hex');
  }

  async getStoreName(storeId: number): Promise<string> {
    const result = await this.pool.query('SELECT store_name FROM stores WHERE id = $1', [storeId]);
    return result.rows[0]?.store_name || '';
  }

  async syncConversation(storeId: number, scraped: ScrapedConversation): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      let conversationId: number;
      const existing = await client.query(
        'SELECT id FROM conversations WHERE store_id = $1 AND etsy_conversation_url = $2',
        [storeId, scraped.conversationUrl]
      );

      if (existing.rows.length > 0) {
        conversationId = existing.rows[0].id;
      } else {
        const inserted = await client.query(
          `INSERT INTO conversations (store_id, etsy_conversation_url, customer_name, status)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [storeId, scraped.conversationUrl, scraped.customerName, 'new']
        );
        conversationId = inserted.rows[0].id;
      }

      let newMessages = 0;
      for (const msg of scraped.messages) {
        const hash = this.hashMessage(msg);
        const result = await client.query(
          `INSERT INTO messages (conversation_id, sender_type, sender_name, message_text, sent_at, message_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (message_hash) DO NOTHING
           RETURNING id`,
          [conversationId, msg.senderType, msg.senderName, msg.messageText, msg.sentAt, hash]
        );
        if (result.rows.length > 0) newMessages++;
      }

      if (scraped.messages.length > 0) {
        const lastMsg = scraped.messages[scraped.messages.length - 1];
        await client.query(
          `UPDATE conversations
           SET last_message_text = $1, last_message_at = $2,
               customer_name = COALESCE(NULLIF($3, ''), customer_name),
               status = CASE WHEN $4 = 'customer' AND status != 'closed' THEN 'new' ELSE status END,
               updated_at = NOW()
           WHERE id = $5`,
          [lastMsg.messageText, lastMsg.sentAt, scraped.customerName, lastMsg.senderType, conversationId]
        );
      }

      await client.query('COMMIT');
      logger.info(`Synced conversation ${conversationId}: ${newMessages} new messages`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
