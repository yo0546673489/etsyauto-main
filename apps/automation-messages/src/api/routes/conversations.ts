import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

export function createConversationRoutes(pool: Pool) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/', async (request) => {
      const { store_id, status, search, page = 1, limit = 50 } = request.query as any;
      const offset = ((page || 1) - 1) * (limit || 50);
      let query = `SELECT c.*, s.store_number, s.store_name FROM conversations c JOIN stores s ON c.store_id = s.id WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (store_id) { query += ` AND c.store_id = $${idx++}`; params.push(store_id); }
      if (status) { query += ` AND c.status = $${idx++}`; params.push(status); }
      if (search) { query += ` AND (c.customer_name ILIKE $${idx} OR c.last_message_text ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

      query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${idx++} OFFSET $${idx}`;
      params.push(limit || 50, offset);

      const result = await pool.query(query, params);
      return { conversations: result.rows, page, limit };
    });

    fastify.get('/:id', async (request, reply) => {
      const { id } = request.params as any;
      const result = await pool.query(
        `SELECT c.*, s.store_number, s.store_name FROM conversations c JOIN stores s ON c.store_id = s.id WHERE c.id = $1`, [id]
      );
      if (result.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
      return result.rows[0];
    });

    fastify.put('/:id/status', async (request) => {
      const { id } = request.params as any;
      const { status } = request.body as any;
      await pool.query('UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
      return { success: true };
    });

    // Toggle AI mode for a single conversation
    fastify.put('/:id/ai-mode', async (request) => {
      const { id } = request.params as any;
      const { ai_mode } = request.body as any;
      await pool.query('UPDATE conversations SET ai_mode = $1, updated_at = NOW() WHERE id = $2', [!!ai_mode, id]);
      return { success: true, ai_mode: !!ai_mode };
    });

    // Global AI mode — GET current status
    fastify.get('/ai-mode/global', async () => {
      const result = await pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN ai_mode THEN 1 ELSE 0 END) as enabled FROM conversations`);
      const total = parseInt(result.rows[0].total);
      const enabled = parseInt(result.rows[0].enabled || '0');
      return { ai_mode: total > 0 && enabled === total, enabled, total };
    });

    // Global AI mode — SET all conversations at once
    fastify.put('/ai-mode/global', async (request) => {
      const { ai_mode } = request.body as any;
      await pool.query('UPDATE conversations SET ai_mode = $1', [!!ai_mode]);
      return { success: true, ai_mode: !!ai_mode };
    });
  };
}
