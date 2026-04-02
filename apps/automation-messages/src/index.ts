import { Pool } from 'pg';
import { config } from './config';
import { StoreResolver } from './stores/resolver';
import { JobQueue } from './queue/setup';
import { EmailListener } from './email/listener';
import { createSyncWorker } from './queue/workers/syncConversation';
import { createInitialSyncWorker } from './queue/workers/initialSync';
import { createReplyWorker } from './queue/workers/sendReply';
import { createReviewReplyWorker } from './queue/workers/replyToReview';
import { createDiscountWorker } from './queue/workers/executeDiscount';
import { createApiServer } from './api/server';
import { DiscountRotationScheduler } from './scheduler/discountRotation';
import { DiscountTaskExecutor } from './scheduler/discountTaskExecutor';
import { OrderMessageScheduler } from './scheduler/orderMessageScheduler';
import { logger } from './utils/logger';

async function main() {
  logger.info('Starting Etsy Automation System...');

  const pool = new Pool({ connectionString: config.db.url });
  await pool.query('SELECT 1');
  logger.info('Database connected');

  // חיבור ל-etsy_platform (Python DB) לביצוע משימות הנחה
  let platformPool: Pool | undefined;
  if (config.platformDb.url) {
    platformPool = new Pool({ connectionString: config.platformDb.url });
    try {
      await platformPool.query('SELECT 1');
      logger.info('Platform database connected');
    } catch (e: any) {
      logger.warn(`Platform database connection failed: ${e.message} — discount tasks from Python API disabled`);
      platformPool = undefined;
    }
  } else {
    logger.warn('PLATFORM_DATABASE_URL not configured — discount tasks from Python API disabled');
  }

  const fs = await import('fs');
  const path = await import('path');
  for (const migration of ['001_initial.sql', '002_reviews_discounts.sql', '003_listing_previews.sql']) {
    const migrationPath = path.join(__dirname, 'db/migrations', migration);
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await pool.query(sql);
      logger.info(`Migration applied: ${migration}`);
    }
  }

  const resolver = new StoreResolver(pool);
  await resolver.loadAll();

  const jobQueue = new JobQueue();

  // Workers — הודעות
  const syncWorker = createSyncWorker(pool, jobQueue);
  const initialSyncWorker = createInitialSyncWorker(pool, jobQueue);
  const replyWorker = createReplyWorker(pool, jobQueue);

  // Workers — ביקורות + הנחות
  const reviewReplyWorker = createReviewReplyWorker(pool);
  const discountWorker = createDiscountWorker(pool, platformPool);

  logger.info('Workers started');

  const { fastify, io } = await createApiServer(pool, jobQueue, resolver);

  // Scheduler — רוטציית הנחות
  const discountScheduler = new DiscountRotationScheduler(pool, jobQueue.discountQueue, resolver);
  discountScheduler.start();
  logger.info('Discount rotation scheduler started');

  // Executor — משימות הנחה מה-API של Python (etsy_platform)
  let discountTaskExecutor: DiscountTaskExecutor | undefined;
  if (platformPool && config.platformDb.url) {
    discountTaskExecutor = new DiscountTaskExecutor(config.platformDb.url, jobQueue.discountQueue);
    discountTaskExecutor.start();
    logger.info('Discount task executor started (polling etsy_platform)');
  }

  // Scheduler — הודעות אוטומטיות לפי הזמנות
  if (platformPool) {
    const orderMsgScheduler = new OrderMessageScheduler(platformPool, pool, jobQueue);
    orderMsgScheduler.start();
    logger.info('Order message scheduler started');
  }

  if (config.imap.user && config.imap.password) {
    const emailListener = new EmailListener(resolver, jobQueue);
    await emailListener.start();
    logger.info('Email listener started');
  } else {
    logger.warn('IMAP not configured - email listener disabled');
  }

  const shutdown = async () => {
    logger.info('Shutting down...');
    discountScheduler.stop();
    if (discountTaskExecutor) discountTaskExecutor.stop();
    await syncWorker.close();
    await initialSyncWorker.close();
    await replyWorker.close();
    await reviewReplyWorker.close();
    await discountWorker.close();
    await fastify.close();
    await pool.end();
    if (platformPool) await platformPool.end().catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('=== Etsy Automation System is running ===');
  logger.info('Features: Messages | Reviews | Discounts | AI Replies');
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
