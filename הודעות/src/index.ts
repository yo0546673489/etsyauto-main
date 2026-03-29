import { Pool } from 'pg';
import { config } from './config';
import { StoreResolver } from './stores/resolver';
import { JobQueue } from './queue/setup';
import { EmailListener } from './email/listener';
import { createSyncWorker } from './queue/workers/syncConversation';
import { createInitialSyncWorker } from './queue/workers/initialSync';
import { createReplyWorker } from './queue/workers/sendReply';
import { createApiServer } from './api/server';
import { logger } from './utils/logger';

async function main() {
  logger.info('Starting Etsy Messaging System...');

  const pool = new Pool({ connectionString: config.db.url });
  await pool.query('SELECT 1');
  logger.info('Database connected');

  const fs = await import('fs');
  const path = await import('path');
  for (const migration of ['001_initial.sql', '002_reviews_discounts.sql']) {
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

  const syncWorker = createSyncWorker(pool, jobQueue);
  const initialSyncWorker = createInitialSyncWorker(pool, jobQueue);
  const replyWorker = createReplyWorker(pool, jobQueue);
  logger.info('Workers started');

  const { fastify, io } = await createApiServer(pool, jobQueue, resolver);

  if (config.imap.user && config.imap.password) {
    const emailListener = new EmailListener(resolver, jobQueue);
    await emailListener.start();
    logger.info('Email listener started');
  } else {
    logger.warn('IMAP not configured - email listener disabled');
  }

  const shutdown = async () => {
    logger.info('Shutting down...');
    await syncWorker.close();
    await initialSyncWorker.close();
    await replyWorker.close();
    await fastify.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('=== Etsy Messaging System is running ===');
}

main().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
