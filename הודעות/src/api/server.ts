import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import { config } from '../config';
import { JobQueue } from '../queue/setup';
import { StoreResolver } from '../stores/resolver';
import { createStoreRoutes } from './routes/stores';
import { createConversationRoutes } from './routes/conversations';
import { createMessageRoutes } from './routes/messages';
import { createReplyRoutes } from './routes/replies';
import { reviewRoutes } from './routes/reviews';
import { discountRoutes } from './routes/discounts';
import { logger } from '../utils/logger';

export async function createApiServer(pool: Pool, jobQueue: JobQueue, resolver: StoreResolver) {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: config.frontend.url, methods: ['GET', 'POST', 'PUT', 'DELETE'] });

  fastify.register(createStoreRoutes(pool, jobQueue, resolver), { prefix: '/api/stores' });
  fastify.register(createConversationRoutes(pool), { prefix: '/api/conversations' });
  fastify.register(createMessageRoutes(pool), { prefix: '/api/messages' });
  fastify.register(createReplyRoutes(pool, jobQueue, resolver), { prefix: '/api/replies' });

  await reviewRoutes(fastify, pool, jobQueue.reviewReplyQueue, resolver);
  await discountRoutes(fastify, pool, jobQueue.discountQueue, resolver);

  fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Link preview endpoint for Etsy product cards (uses microlink.io headless browser)
  const previewCache = new Map<string, any>();
  fastify.get('/api/link-preview', async (request, reply) => {
    const { url } = request.query as any;
    if (!url || !url.includes('etsy.com/listing/')) {
      return reply.code(400).send({ error: 'Invalid URL' });
    }
    if (previewCache.has(url)) return previewCache.get(url);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      // microlink.io free tier - no API key needed for basic usage
      const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=false&meta=false&video=false`;
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timer);
      const data: any = await res.json();
      if (data.status === 'success' && data.data) {
        const result = {
          image: data.data.image?.url || data.data.logo?.url || '',
          title: data.data.title || '',
          price: data.data.price || '',
          originalPrice: '',
        };
        previewCache.set(url, result);
        return result;
      }
      return { image: '', title: '', price: '', originalPrice: '' };
    } catch (e: any) {
      return { error: e.message || 'fetch failed' };
    }
  });

  await fastify.listen({ port: config.api.port, host: config.api.host });
  logger.info(`API server running on port ${config.api.port}`);

  const io = new Server(fastify.server, { cors: { origin: config.frontend.url } });
  io.on('connection', (socket) => {
    socket.on('join-store', (storeId: number) => socket.join(`store-${storeId}`));
    socket.on('join-conversation', (conversationId: number) => socket.join(`conversation-${conversationId}`));
  });

  return { fastify, io };
}
