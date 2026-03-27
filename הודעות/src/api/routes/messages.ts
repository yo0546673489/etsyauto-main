import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

export function createMessageRoutes(pool: Pool) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/conversation/:conversationId', async (request) => {
      const { conversationId } = request.params as any;
      const result = await pool.query(
        `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC, created_at ASC`, [conversationId]
      );
      return { messages: result.rows };
    });

    fastify.get('/search', async (request) => {
      const { q, store_id, limit = 20 } = request.query as any;
      if (!q) return { messages: [] };
      let query = `SELECT m.*, c.customer_name, s.store_number, s.store_name
        FROM messages m JOIN conversations c ON m.conversation_id = c.id JOIN stores s ON c.store_id = s.id
        WHERE to_tsvector('english', m.message_text) @@ plainto_tsquery('english', $1)`;
      const params: any[] = [q];
      let idx = 2;
      if (store_id) { query += ` AND c.store_id = $${idx++}`; params.push(store_id); }
      query += ` ORDER BY m.sent_at DESC LIMIT $${idx}`;
      params.push(limit);
      const result = await pool.query(query, params);
      return { messages: result.rows };
    });
  };
}
