import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { JobQueue } from '../../queue/setup';
import { StoreResolver } from '../../stores/resolver';

export function createStoreRoutes(pool: Pool, jobQueue: JobQueue, resolver: StoreResolver) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/', async () => {
      const result = await pool.query('SELECT * FROM stores ORDER BY store_number ASC');
      return { stores: result.rows };
    });

    fastify.post('/', async (request, reply) => {
      const { store_number, store_name, store_email, adspower_profile_id } = request.body as any;
      if (!store_number || !store_email || !adspower_profile_id) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }
      const result = await pool.query(
        `INSERT INTO stores (store_number, store_name, store_email, adspower_profile_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [store_number, store_name || `Store ${store_number}`, store_email, adspower_profile_id]
      );
      await resolver.loadAll();
      return result.rows[0];
    });

    fastify.post('/:id/initial-sync', async (request, reply) => {
      const { id } = request.params as any;
      const store = await resolver.resolveById(parseInt(id));
      if (!store) return reply.status(404).send({ error: 'Store not found' });
      if (store.initial_sync_completed) return reply.status(400).send({ error: 'Already synced' });
      await jobQueue.addInitialSyncJob({
        storeId: store.id,
        profileId: store.adspower_profile_id,
        storeName: store.store_name || `Store ${store.store_number}`,
      });
      return { success: true, message: 'Initial sync job queued' };
    });

    fastify.put('/:id', async (request, reply) => {
      const { id } = request.params as any;
      const { store_name, store_email, adspower_profile_id, status } = request.body as any;
      const result = await pool.query(
        `UPDATE stores SET store_name = COALESCE($1, store_name), store_email = COALESCE($2, store_email),
         adspower_profile_id = COALESCE($3, adspower_profile_id), status = COALESCE($4, status), updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [store_name, store_email, adspower_profile_id, status, id]
      );
      await resolver.loadAll();
      return result.rows[0];
    });
  };
}
