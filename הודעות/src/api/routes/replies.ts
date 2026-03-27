import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { JobQueue } from '../../queue/setup';
import { StoreResolver } from '../../stores/resolver';

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
  };
}
