import { Worker, Job } from 'bullmq';
import { config } from '../../config';
import { InitialSyncJobData } from '../setup';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';

function getRedisConnection() {
  try {
    const url = new URL(config.redis.url);
    return { host: url.hostname || 'localhost', port: parseInt(url.port || '6379') };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export function createInitialSyncWorker(pool: Pool): Worker {
  return new Worker('initial-sync', async (job: Job<InitialSyncJobData>) => {
    const { storeId } = job.data;

    // Email-driven architecture: no list scraping needed.
    // New conversations arrive via Gmail IMAP notifications from Etsy.
    // Mark store as ready so future email-triggered syncs can proceed.
    await pool.query(
      'UPDATE stores SET initial_sync_completed = TRUE, updated_at = NOW() WHERE id = $1',
      [storeId]
    );

    logger.info(`Store ${storeId} marked as ready (email-driven sync)`);
  }, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
}
