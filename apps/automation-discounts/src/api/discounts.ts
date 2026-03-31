import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { StoreResolver } from '../stores/resolver';

// ─── Utility functions ───────────────────────────────────────────────────────

export function getNextDiscountPercent(min: number, max: number, lastPercent: number | null): number {
  let percent: number;
  do {
    percent = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (percent === lastPercent);
  return percent;
}

export function generateSaleName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const prefix = 'SALE';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function discountRoutes(
  fastify: FastifyInstance,
  pool: Pool,
  discountQueue: Queue,
  resolver: StoreResolver,
  platformPool?: Pool
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
      saleName?: string;        // אופציונלי — נוצר אוטומטית אם לא סופק
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
    if (!body.startDate) {
      return reply.status(400).send({ error: 'Start date is required' });
    }
    if (!body.endDate) {
      return reply.status(400).send({ error: 'End date is required' });
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

    // שם אוטומטי אם לא סופק
    const saleName = (body.saleName && /^[a-zA-Z0-9]+$/.test(body.saleName))
      ? body.saleName.toUpperCase()
      : generateSaleName();

    const result = await pool.query(
      `INSERT INTO discount_tasks
        (store_id, task_type, sale_name, discount_percent, target_scope,
         listing_ids, target_country, terms_text, start_date, end_date, status)
       VALUES ($1, 'create_sale', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING id`,
      [
        body.storeId, saleName, body.discountPercent, body.targetScope,
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
        saleName,
        discountPercent: body.discountPercent,
        startDate: body.startDate,
        endDate: body.endDate,
        targetCountry: body.targetCountry,
        termsText: body.termsText,
        targetScope: body.targetScope,
        listingIds: body.listingIds,
      },
    });

    return { success: true, taskId, saleName };
  });

  // ─── trigger-rotation — הפעל סבב הנחה אוטומטי ידנית ────────────────────────
  fastify.post('/api/discounts/rules/:ruleId/trigger-rotation', async (request, reply) => {
    if (!platformPool) {
      return reply.status(503).send({ error: 'Platform DB not available' });
    }
    const { ruleId } = request.params as { ruleId: string };

    const ruleResult = await platformPool.query(
      `SELECT dr.*, s.adspower_profile_id
       FROM discount_rules dr
       JOIN shops s ON s.id = dr.shop_id
       WHERE dr.id = $1`,
      [parseInt(ruleId)]
    );
    const rule = ruleResult.rows[0];
    if (!rule) return reply.status(404).send({ error: 'Rule not found' });
    if (!rule.auto_rotate) return reply.status(400).send({ error: 'Rule is not in auto mode' });

    const newPercent = getNextDiscountPercent(
      rule.auto_min_percent ?? 20,
      rule.auto_max_percent ?? 30,
      rule.last_discount_percent ?? null
    );
    const saleName = generateSaleName();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (rule.auto_interval_days ?? 2) * 24 * 60 * 60 * 1000);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr   = endDate.toISOString().split('T')[0];

    // עדכן rule
    await platformPool.query(
      `UPDATE discount_rules
       SET last_discount_percent = $1, next_rotation_at = $2
       WHERE id = $3`,
      [newPercent, endDate.toISOString(), parseInt(ruleId)]
    );

    // צור discount_task
    const taskResult = await platformPool.query(
      `INSERT INTO discount_tasks
        (rule_id, shop_id, action, discount_value, scope, listing_ids,
         scheduled_for, status, started_at)
       VALUES ($1, $2, 'apply_discount', $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [
        parseInt(ruleId), rule.shop_id, newPercent,
        rule.scope || 'entire_shop', rule.listing_ids || [],
        startDate.toISOString(), startDate.toISOString(),
      ]
    );
    const platformTaskId = taskResult.rows[0].id;

    // Enqueue
    if (rule.adspower_profile_id) {
      await discountQueue.add('execute', {
        taskId: platformTaskId,
        storeId: rule.shop_id,
        serialNumber: rule.adspower_profile_id,
        taskType: 'create_sale',
        platformTaskId,
        saleConfig: {
          saleName,
          discountPercent: newPercent,
          startDate: startDateStr,
          endDate: endDateStr,
          targetCountry: rule.target_country || 'Everywhere',
          termsText: rule.terms_text || undefined,
          targetScope: (rule.scope === 'specific_listings' ? 'specific_listings' : 'whole_shop') as 'whole_shop' | 'specific_listings',
          listingIds: rule.listing_ids?.map(String) || undefined,
        },
      });
    }

    return { new_percent: newPercent, sale_name: saleName, next_rotation_at: endDate.toISOString() };
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
