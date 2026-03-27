import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyScraper } from '../../browser/etsyScraper';
import { SyncEngine } from '../../sync/engine';
import { JobQueue, InitialSyncJobData } from '../setup';
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

export function createInitialSyncWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();
  const syncEngine = new SyncEngine(pool);

  return new Worker('initial-sync', async (job: Job<InitialSyncJobData>) => {
    const { storeId, profileId, storeName } = job.data;

    if (jobQueue.isProfileLocked(profileId)) throw new Error('Profile locked');
    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) throw new Error(`Could not open profile ${profileId}`);

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
      const context = browser.contexts()[0];
      const page = context.pages()[0] || await context.newPage();

      const scraper = new EtsyScraper(page, storeName);
      const conversationList = await scraper.scrapeConversationList();
      logger.info(`Found ${conversationList.length} conversations for initial sync`);

      for (let i = 0; i < conversationList.length; i++) {
        await job.updateProgress(Math.round((i / conversationList.length) * 100));
        const conversation = await scraper.scrapeConversation(conversationList[i].url);
        await syncEngine.syncConversation(storeId, conversation);

        const waitTime = 3000 + Math.random() * 5000;
        await new Promise(r => setTimeout(r, waitTime));
        logger.info(`Initial sync: ${i + 1}/${conversationList.length}`);
      }

      await pool.query(
        'UPDATE stores SET initial_sync_completed = TRUE, updated_at = NOW() WHERE id = $1',
        [storeId]
      );
      logger.info(`Initial sync completed for store ${storeId}`);
    } catch (error) {
      logger.error(`Initial sync failed for store ${storeId}`, error);
      throw error;
    } finally {
      if (browser) { try { await browser.close(); } catch {} }
      await adspower.closeProfile(profileId);
      jobQueue.unlockProfile(profileId);
    }
  }, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
}
