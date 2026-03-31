import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyScraper } from '../../browser/etsyScraper';
import { ListingScraper, extractListingUrls } from '../../browser/listingScraper';
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

      // Wait for AdsPower browser to be fully ready before connecting
      await new Promise(r => setTimeout(r, 5000));
      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer, { timeout: 60000 });
      const context = browser.contexts()[0];

      // Close all extra tabs — keep only one to avoid slowdowns
      const allPages = context.pages();
      for (let i = 1; i < allPages.length; i++) {
        await allPages[i].close().catch(() => {});
      }
      const page = allPages[0] || await context.newPage();

      const storeName = await syncEngine.getStoreName(storeId);
      const scraper = new EtsyScraper(page, storeName);
      const conversation = await scraper.scrapeConversation(conversationUrl, job.data.buyerName);
      await syncEngine.syncConversation(storeId, conversation);

      // Scrape product previews from listing URLs found in messages (automation, not Etsy API)
      const listingUrls = extractListingUrls(conversation.messages);
      if (listingUrls.length > 0) {
        logger.info(`Found ${listingUrls.length} listing URL(s) — scraping previews...`);
        const listingScraper = new ListingScraper(page);
        await listingScraper.scrapeAndSave(pool, listingUrls);
      }

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
    lockDuration: 300000,
    limiter: { max: 5, duration: 60000 },
  });
}
