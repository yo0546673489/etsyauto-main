import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { AIReplyGenerator } from '../../ai/replyGenerator';
import { StoreResolver } from '../../stores/resolver';

export async function reviewRoutes(
  fastify: FastifyInstance,
  pool: Pool,
  reviewQueue: Queue,
  resolver: StoreResolver
) {
  // שליפת ביקורות ששמורות בטבלה (עם סטטוס תגובה)
  fastify.get('/api/reviews/:storeId', async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const { status, page = '1', limit = '20' } = request.query as any;

    let query = 'SELECT * FROM review_replies WHERE store_id = $1';
    const params: any[] = [parseInt(storeId)];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM review_replies WHERE store_id = $1',
      [parseInt(storeId)]
    );

    return {
      reviews: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    };
  });

  // יצירת תגובה ידנית לביקורת
  fastify.post('/api/reviews/reply', async (request, reply) => {
    const body = request.body as {
      storeId: number;
      reviewerName: string;
      reviewRating: number;
      reviewText: string;
      listingTitle?: string;
      replyText: string;
    };

    // שמירה בטבלה
    const result = await pool.query(
      `INSERT INTO review_replies
        (store_id, reviewer_name, review_rating, review_text, reply_text, reply_source, status)
       VALUES ($1, $2, $3, $4, $5, 'manual', 'pending')
       RETURNING id`,
      [body.storeId, body.reviewerName, body.reviewRating, body.reviewText, body.replyText]
    );

    const replyId = result.rows[0].id;

    // שליפת פרופיל AdsPower
    const store = await resolver.resolveById(body.storeId);
    if (!store) return reply.status(404).send({ error: 'Store not found' });

    // הוספה לתור
    await reviewQueue.add('reply', {
      replyId,
      storeId: body.storeId,
      serialNumber: store.adspower_profile_id,
      storeName: store.store_name,
      reviewerName: body.reviewerName,
      reviewRating: body.reviewRating,
      reviewText: body.reviewText,
      listingTitle: body.listingTitle,
      replyText: body.replyText,
      useAI: false,
    });

    return { success: true, replyId };
  });

  // יצירת תגובה אוטומטית עם AI
  fastify.post('/api/reviews/reply-ai', async (request, reply) => {
    const body = request.body as {
      storeId: number;
      reviewerName: string;
      reviewRating: number;
      reviewText: string;
      listingTitle?: string;
    };

    const aiGenerator = new AIReplyGenerator(pool);

    // יצירת טקסט עם AI (preview — לא שולח עדיין)
    const aiReply = await aiGenerator.generateReviewReply(
      body.storeId,
      body.reviewerName,
      body.reviewRating,
      body.reviewText,
      body.listingTitle
    );

    if (!aiReply) {
      return reply.status(500).send({ error: 'AI failed to generate reply' });
    }

    return { success: true, generatedText: aiReply.text };
  });

  // שליחת תגובת AI שאושרה
  fastify.post('/api/reviews/reply-ai/send', async (request, reply) => {
    const body = request.body as {
      storeId: number;
      reviewerName: string;
      reviewRating: number;
      reviewText: string;
      listingTitle?: string;
      replyText: string; // הטקסט שאושר (אולי נערך ע"י המשתמש)
    };

    const result = await pool.query(
      `INSERT INTO review_replies
        (store_id, reviewer_name, review_rating, review_text, reply_text, reply_source, status)
       VALUES ($1, $2, $3, $4, $5, 'ai', 'pending')
       RETURNING id`,
      [body.storeId, body.reviewerName, body.reviewRating, body.reviewText, body.replyText]
    );

    const replyId = result.rows[0].id;
    const store = await resolver.resolveById(body.storeId);
    if (!store) return reply.status(404).send({ error: 'Store not found' });

    await reviewQueue.add('reply', {
      replyId,
      storeId: body.storeId,
      serialNumber: store.adspower_profile_id,
      storeName: store.store_name,
      reviewerName: body.reviewerName,
      reviewRating: body.reviewRating,
      reviewText: body.reviewText,
      listingTitle: body.listingTitle,
      replyText: body.replyText,
      useAI: false, // כבר יש טקסט — לא צריך AI שוב
    });

    return { success: true, replyId };
  });

  // הגדרות AI לביקורות
  fastify.get('/api/reviews/ai-settings/:storeId', async (request) => {
    const { storeId } = request.params as { storeId: string };
    const result = await pool.query(
      'SELECT * FROM ai_settings WHERE store_id = $1 AND feature = $2',
      [parseInt(storeId), 'reviews']
    );
    return result.rows[0] || { enabled: false };
  });

  fastify.put('/api/reviews/ai-settings/:storeId', async (request) => {
    const { storeId } = request.params as { storeId: string };
    const body = request.body as {
      enabled: boolean;
      systemPrompt: string;
      language: string;
      autoSend: boolean;
    };

    await pool.query(
      `INSERT INTO ai_settings (store_id, feature, enabled, system_prompt, language, auto_send)
       VALUES ($1, 'reviews', $2, $3, $4, $5)
       ON CONFLICT (store_id, feature)
       DO UPDATE SET enabled = $2, system_prompt = $3, language = $4, auto_send = $5, updated_at = NOW()`,
      [parseInt(storeId), body.enabled, body.systemPrompt, body.language, body.autoSend]
    );

    return { success: true };
  });
}
