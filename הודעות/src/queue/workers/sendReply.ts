import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsySender } from '../../browser/etsySender';
import { EtsyScraper } from '../../browser/etsyScraper';
import { SyncEngine } from '../../sync/engine';
import { JobQueue, SendReplyJobData } from '../setup';
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

export function createReplyWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();
  const syncEngine = new SyncEngine(pool);

  return new Worker('send-reply', async (job: Job<SendReplyJobData>) => {
    const { replyQueueId, conversationId, storeId, profileId, conversationUrl, messageText } = job.data;

    if (jobQueue.isProfileLocked(profileId)) throw new Error('Profile locked');
    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      await pool.query('UPDATE reply_queue SET status = $1, attempts = attempts + 1 WHERE id = $2', ['sending', replyQueueId]);

      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) throw new Error(`Could not open profile ${profileId}`);

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
      const context = browser.contexts()[0];
      const page = context.pages()[0] || await context.newPage();

      const sender = new EtsySender(page);
      const success = await sender.sendReply(conversationUrl, messageText);
      if (!success) throw new Error('Message send verification failed');

      const storeName = await syncEngine.getStoreName(storeId);
      const scraper = new EtsyScraper(page, storeName);
      const conversation = await scraper.scrapeConversation(conversationUrl);
      await syncEngine.syncConversation(storeId, conversation);

      await pool.query('UPDATE reply_queue SET status = $1, sent_at = NOW() WHERE id = $2', ['sent', replyQueueId]);
      await pool.query('UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2', ['answered', conversationId]);

      logger.info(`Reply sent for conversation ${conversationId}`);
    } catch (error) {
      logger.error(`Reply failed for conversation ${conversationId}`, error);
      await pool.query('UPDATE reply_queue SET status = $1, error_message = $2 WHERE id = $3', ['failed', String(error), replyQueueId]);
      throw error;
    } finally {
      if (browser) { try { await browser.close(); } catch {} }
      await adspower.closeProfile(profileId);
      jobQueue.unlockProfile(profileId);
    }
  }, {
    connection: getRedisConnection(),
    concurrency: 2,
  });
}
