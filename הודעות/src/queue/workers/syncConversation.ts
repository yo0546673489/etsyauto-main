import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyScraper } from '../../browser/etsyScraper';
import { SyncEngine } from '../../sync/engine';
import { JobQueue, SyncConversationJobData } from '../setup';
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

export function createSyncWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();
  const syncEngine = new SyncEngine(pool);

  return new Worker('sync-conversation', async (job: Job<SyncConversationJobData>) => {
    const { storeId, profileId, conversationUrl } = job.data;

    if (jobQueue.isProfileLocked(profileId)) {
      throw new Error('Profile locked - retry later');
    }

    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) throw new Error(`Could not open profile ${profileId}`);

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
      const context = browser.contexts()[0];
      const page = context.pages()[0] || await context.newPage();

      const storeName = await syncEngine.getStoreName(storeId);
      const scraper = new EtsyScraper(page, storeName);
      const conversation = await scraper.scrapeConversation(conversationUrl, job.data.buyerName);
      await syncEngine.syncConversation(storeId, conversation);

      logger.info(`Synced conversation for store ${storeId}`);
    } catch (error) {
      logger.error(`Sync failed for store ${storeId}`, error);
      throw error;
    } finally {
      if (browser) { try { await browser.close(); } catch {} }
      await adspower.closeProfile(profileId);
      jobQueue.unlockProfile(profileId);
    }
  }, {
    connection: getRedisConnection(),
    concurrency: 3,
    limiter: { max: 5, duration: 60000 },
  });
}
