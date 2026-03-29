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

  await fastify.listen({ port: config.api.port, host: config.api.host });
  logger.info(`API server running on port ${config.api.port}`);

  const io = new Server(fastify.server, { cors: { origin: config.frontend.url } });
  io.on('connection', (socket) => {
    socket.on('join-store', (storeId: number) => socket.join(`store-${storeId}`));
    socket.on('join-conversation', (conversationId: number) => socket.join(`conversation-${conversationId}`));
  });

  return { fastify, io };
}
