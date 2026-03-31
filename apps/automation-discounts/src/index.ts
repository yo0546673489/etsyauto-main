/**
 * Etsy Discount Automation — Entry Point
 * תיקייה: C:\etsy\הנחות\
 *
 * מה זה עושה:
 * 1. מפעיל BullMQ worker שמבצע מבצעי הנחה ב-Etsy דרך AdsPower
 * 2. מפעיל Executor שסורק etsy_platform DB כל 5 דקות למשימות pending
 * 3. מפעיל Fastify API server על פורט 3510
 */

import { Pool } from 'pg';
import { Queue } from 'bullmq';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { logger } from './utils/logger';
import { StoreResolver } from './stores/resolver';
import { createDiscountWorker } from './workers/executeDiscount';
import { DiscountTaskExecutor } from './scheduler/discountTaskExecutor';
import { discountRoutes } from './api/discounts';

async function main() {
  logger.info('Starting Etsy Discount Automation...');

  // DB connections
  const pool = new Pool({ connectionString: config.db.url });
  const platformPool = new Pool({ connectionString: config.platformDb.url });

  await pool.query('SELECT 1');
  logger.info('etsy_messages DB connected');

  await platformPool.query('SELECT 1');
  logger.info('etsy_platform DB connected');

  // Redis Queue
  function getRedisConnection() {
    try {
      const url = new URL(config.redis.url);
      return { host: url.hostname || 'localhost', port: parseInt(url.port || '6379') };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }

  const discountQueue = new Queue('discount-execute', {
    connection: getRedisConnection(),
  });

  // Store resolver
  const resolver = new StoreResolver(pool);
  await resolver.loadAll();

  // BullMQ Worker
  const worker = createDiscountWorker(pool, platformPool);
  logger.info('Discount worker started');

  // Executor (polls etsy_platform)
  const executor = new DiscountTaskExecutor(config.platformDb.url, discountQueue);
  executor.start(5 * 60 * 1000); // every 5 minutes
  logger.info('Discount task executor started');

  // API Server
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });
  await discountRoutes(fastify, pool, discountQueue, resolver, platformPool);

  await fastify.listen({ port: config.api.port, host: config.api.host });
  logger.info(`Discount API running on port ${config.api.port}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    executor.stop();
    await worker.close();
    await discountQueue.close();
    await pool.end();
    await platformPool.end();
    process.exit(0);
  });
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
