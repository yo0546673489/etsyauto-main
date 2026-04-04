import { Pool } from 'pg';
import { ScrapedConversation, ScrapedMessage } from '../browser/etsyScraper';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { JobQueue } from '../queue/setup';

export class SyncEngine {
  private pool: Pool;
  private jobQueue: JobQueue | null = null;

  constructor(pool: Pool, jobQueue?: JobQueue) {
    this.pool = pool;
    this.jobQueue = jobQueue || null;
  }

  private hashMessage(msg: ScrapedMessage, conversationId?: number): string {
    // Hash by content only (not timestamp) to avoid duplicates when same message is scraped twice
    return createHash('sha256')
      .update(`${conversationId || 0}|${msg.senderType}|${msg.messageText.trim()}`)
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
      // Normalize URL — strip query params to get clean conversation ID for matching
      // e.g. https://www.etsy.com/messages/1635070082?from_email=... → https://www.etsy.com/messages/1635070082
      const normalizedUrl = scraped.conversationUrl.split('?')[0];
      // Search by exact URL, normalized URL (no query params), or by ablink + customer name
      const existing = await client.query(
        `SELECT id, etsy_conversation_url FROM conversations
         WHERE store_id = $1 AND (
           etsy_conversation_url = $2
           OR etsy_conversation_url = $3
           OR (etsy_conversation_url LIKE '%' || split_part($2, '?', 1) || '%' AND $2 LIKE '%etsy.com%')
           OR (etsy_conversation_url LIKE '%ablink%' AND customer_name = $4 AND $4 NOT IN ('Unknown Customer', 'Unknown Buyer', ''))
         )
         ORDER BY id DESC LIMIT 1`,
        [storeId, scraped.conversationUrl, normalizedUrl, scraped.customerName]
      );

      if (existing.rows.length > 0) {
        conversationId = existing.rows[0].id;
        // Update URL: always prefer the clean normalized URL (without query params)
        const preferredUrl = normalizedUrl.includes('etsy.com') ? normalizedUrl : scraped.conversationUrl;
        if (existing.rows[0].etsy_conversation_url !== preferredUrl && preferredUrl.includes('etsy.com')) {
          await client.query(
            'UPDATE conversations SET etsy_conversation_url = $1 WHERE id = $2',
            [preferredUrl, conversationId]
          );
          logger.info(`Updated conversation ${conversationId} URL to: ${preferredUrl}`);
        }
        // Update subject listing if we newly scraped it
        if (scraped.subjectListing?.image) {
          await client.query(
            `UPDATE conversations
             SET subject_listing_url = COALESCE(subject_listing_url, $1),
                 subject_listing_image = COALESCE(subject_listing_image, $2),
                 subject_listing_title = COALESCE(subject_listing_title, $3)
             WHERE id = $4`,
            [scraped.subjectListing.url || null, scraped.subjectListing.image, scraped.subjectListing.title || null, conversationId]
          );
        }
      } else {
        const inserted = await client.query(
          `INSERT INTO conversations (store_id, etsy_conversation_url, customer_name, status,
             subject_listing_url, subject_listing_image, subject_listing_title)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            storeId,
            scraped.conversationUrl,
            scraped.customerName,
            'new',
            scraped.subjectListing?.url || null,
            scraped.subjectListing?.image || null,
            scraped.subjectListing?.title || null,
          ]
        );
        conversationId = inserted.rows[0].id;
      }

      let newMessages = 0;
      for (const msg of scraped.messages) {
        const hash = this.hashMessage(msg, conversationId);
        const imageUrlsVal = (msg.imageUrls && msg.imageUrls.length > 0) ? msg.imageUrls : null;
        const result = await client.query(
          `INSERT INTO messages (conversation_id, sender_type, sender_name, message_text, sent_at, message_hash, image_urls)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (message_hash) DO NOTHING
           RETURNING id`,
          [conversationId, msg.senderType, msg.senderName, msg.messageText, msg.sentAt, hash, imageUrlsVal]
        );
        if (result.rows.length > 0) newMessages++;
      }

      if (scraped.messages.length > 0) {
        const lastMsg = scraped.messages[scraped.messages.length - 1];
        await client.query(
          `UPDATE conversations
           SET last_message_text = $1, last_message_at = $2,
               customer_name = CASE
                 WHEN $3 NOT IN ('', 'Unknown Customer', 'Unknown Buyer')
                      AND $3 NOT ILIKE '%read message%'
                      AND $3 NOT ILIKE '%unread message%'
                      AND $3 NOT ILIKE 'mark as%'
                 THEN $3
                 ELSE customer_name
               END,
               status = CASE WHEN $4 = 'customer' AND status != 'closed' THEN 'new' ELSE status END,
               updated_at = NOW()
           WHERE id = $5`,
          [lastMsg.messageText, lastMsg.sentAt, scraped.customerName, lastMsg.senderType, conversationId]
        );
      }

      await client.query('COMMIT');
      if (scraped.messages.length === 0) {
        logger.warn(`[SyncEngine] ⚠️ Synced conversation ${conversationId} but scraper returned 0 messages — profile may need re-authentication`);
      } else {
        logger.info(`[SyncEngine] ✓ Synced conversation ${conversationId}: ${newMessages} new messages out of ${scraped.messages.length} scraped`);
      }

      // If new customer messages arrived AND ai_mode is ON → trigger auto-reply
      if (newMessages > 0 && this.jobQueue) {
        const lastMsg = scraped.messages[scraped.messages.length - 1];
        if (lastMsg.senderType === 'customer') {
          const convResult = await this.pool.query(
            `SELECT c.ai_mode, c.etsy_conversation_url, s.adspower_profile_id
             FROM conversations c JOIN stores s ON c.store_id = s.id WHERE c.id = $1`,
            [conversationId]
          );
          const conv = convResult.rows[0];
          if (conv?.ai_mode) {
            logger.info(`[AutoReply] ai_mode ON for conversation ${conversationId} — triggering AI reply`);
            const { AutoReplyService } = await import('../ai/autoReplyService');
            const autoReply = new AutoReplyService(this.pool, this.jobQueue);
            // Small delay so the message is already in DB
            setTimeout(() => {
              autoReply.handleNewCustomerMessage(
                conversationId,
                storeId,
                scraped.customerName,
                lastMsg.messageText,
                conv.etsy_conversation_url,
                conv.adspower_profile_id
              );
            }, 2000);
          }
        }
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
