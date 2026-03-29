import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { JobQueue } from '../../queue/setup';
import { StoreResolver } from '../../stores/resolver';
import { AIReplyGenerator } from '../../ai/replyGenerator';

export function createReplyRoutes(pool: Pool, jobQueue: JobQueue, resolver: StoreResolver) {
  return async function (fastify: FastifyInstance) {
    fastify.post('/', async (request, reply) => {
      const { conversation_id, message_text } = request.body as any;
      if (!conversation_id || !message_text) return reply.status(400).send({ error: 'Missing fields' });

      const convoResult = await pool.query(
        `SELECT c.*, s.adspower_profile_id FROM conversations c JOIN stores s ON c.store_id = s.id WHERE c.id = $1`,
        [conversation_id]
      );
      if (convoResult.rows.length === 0) return reply.status(404).send({ error: 'Conversation not found' });
      const convo = convoResult.rows[0];

      const queueResult = await pool.query(
        `INSERT INTO reply_queue (conversation_id, message_text, source, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        [conversation_id, message_text, 'manual', 'pending']
      );

      await jobQueue.addSendReplyJob({
        replyQueueId: queueResult.rows[0].id,
        conversationId: conversation_id,
        storeId: convo.store_id,
        profileId: convo.adspower_profile_id,
        conversationUrl: convo.etsy_conversation_url,
        messageText: message_text,
      });

      return { success: true, replyQueueId: queueResult.rows[0].id, status: 'pending' };
    });

    fastify.get('/:id/status', async (request) => {
      const { id } = request.params as any;
      const result = await pool.query('SELECT * FROM reply_queue WHERE id = $1', [id]);
      return result.rows[0] || { error: 'Not found' };
    });

    // AI — יצירת תגובה להודעה (preview)
    fastify.post('/ai-generate', async (request) => {
      const body = request.body as {
        storeId: number;
        conversationId: number;
        customerName: string;
        customerMessage: string;
      };

      // טעינת היסטוריית השיחה
      const historyResult = await pool.query(
        'SELECT sender_name as sender, message_text as text FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 10',
        [body.conversationId]
      );

      const aiGenerator = new AIReplyGenerator(pool);
      const aiReply = await aiGenerator.generateMessageReply(
        body.storeId,
        body.customerName,
        body.customerMessage,
        historyResult.rows
      );

      if (!aiReply) return { success: false, error: 'AI generation failed' };
      return { success: true, generatedText: aiReply.text };
    });

    // AI settings — שליפה
    fastify.get('/ai-settings/:storeId', async (request) => {
      const { storeId } = request.params as { storeId: string };
      const result = await pool.query(
        'SELECT * FROM ai_settings WHERE store_id = $1 AND feature = $2',
        [parseInt(storeId), 'messages']
      );
      return result.rows[0] || { enabled: false };
    });

    // AI settings — שמירה
    fastify.put('/ai-settings/:storeId', async (request) => {
      const { storeId } = request.params as { storeId: string };
      const body = request.body as {
        enabled: boolean;
        systemPrompt: string;
        language: string;
        autoSend: boolean;
      };

      await pool.query(
        `INSERT INTO ai_settings (store_id, feature, enabled, system_prompt, language, auto_send)
         VALUES ($1, 'messages', $2, $3, $4, $5)
         ON CONFLICT (store_id, feature)
         DO UPDATE SET enabled = $2, system_prompt = $3, language = $4, auto_send = $5, updated_at = NOW()`,
        [parseInt(storeId), body.enabled, body.systemPrompt, body.language, body.autoSend]
      );
      return { success: true };
    });
  };
}
