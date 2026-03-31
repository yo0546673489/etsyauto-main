import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { StoreResolver } from '../stores/resolver';

export async function discountRoutes(
  fastify: FastifyInstance,
  pool: Pool,
  discountQueue: Queue,
  resolver: StoreResolver
) {
  // רשימת משימות הנחה
  fastify.get('/api/discounts/:storeId', async (request) => {
    const { storeId } = request.params as { storeId: string };
    const { status, page = '1', limit = '20' } = request.query as any;

    let query = 'SELECT * FROM discount_tasks WHERE store_id = $1';
    const params: any[] = [parseInt(storeId)];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);
    return { tasks: result.rows };
  });

  // יצירת מבצע הנחה חדש
  fastify.post('/api/discounts/create', async (request, reply) => {
    const body = request.body as {
      storeId: number;
      saleName: string;
      discountPercent: number;
      targetScope: 'whole_shop' | 'specific_listings';
      listingIds?: string[];
      targetCountry: string;
      termsText?: string;
      startDate: string;
      endDate: string;
    };

    if (body.discountPercent < 5 || body.discountPercent > 75) {
      return reply.status(400).send({ error: 'Discount must be 5-75%' });
    }
    if (!/^[a-zA-Z0-9]+$/.test(body.saleName)) {
      return reply.status(400).send({ error: 'Sale name must be alphanumeric only' });
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) {
      return reply.status(400).send({ error: 'Sale duration max 30 days' });
    }
    if (body.termsText && body.termsText.length > 500) {
      return reply.status(400).send({ error: 'Terms max 500 characters' });
    }

    const result = await pool.query(
      `INSERT INTO discount_tasks
        (store_id, task_type, sale_name, discount_percent, target_scope,
         listing_ids, target_country, terms_text, start_date, end_date, status)
       VALUES ($1, 'create_sale', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id`,
      [
        body.storeId, body.saleName, body.discountPercent, body.targetScope,
        body.listingIds || [], body.targetCountry, body.termsText || null,
        body.startDate, body.endDate,
      ]
    );

    const taskId = result.rows[0].id;
    const store = await resolver.resolveById(body.storeId);
    if (!store) return reply.status(404).send({ error: 'Store not found' });

    await discountQueue.add('execute', {
      taskId,
      storeId: body.storeId,
      serialNumber: store.adspower_profile_id,
      taskType: 'create_sale',
      saleConfig: {
        saleName: body.saleName,
        discountPercent: body.discountPercent,
        startDate: body.startDate,
        endDate: body.endDate,
        targetCountry: body.targetCountry,
        termsText: body.termsText,
        targetScope: body.targetScope,
        listingIds: body.listingIds,
      },
    });

    return { success: true, taskId };
  });

  // ביטול מבצע
  fastify.post('/api/discounts/end', async (request, reply) => {
    const body = request.body as { storeId: number; saleName: string };
    const store = await resolver.resolveById(body.storeId);
    if (!store) return reply.status(404).send({ error: 'Store not found' });

    const result = await pool.query(
      `INSERT INTO discount_tasks
        (store_id, task_type, sale_name, status)
       VALUES ($1, 'end_sale', $2, 'pending') RETURNING id`,
      [body.storeId, body.saleName]
    );

    const taskId = result.rows[0].id;
    await discountQueue.add('execute', {
      taskId,
      storeId: body.storeId,
      serialNumber: store.adspower_profile_id,
      taskType: 'end_sale',
      saleName: body.saleName,
    });

    return { success: true, taskId };
  });

  // Health check
  fastify.get('/api/discounts/health', async () => {
    return { status: 'ok', service: 'etsy-discounts', timestamp: new Date().toISOString() };
  });
}
