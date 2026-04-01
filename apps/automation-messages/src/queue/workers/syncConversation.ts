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

// Error codes that signal the profile needs manual re-authentication
const AUTH_ERRORS = ['ETSY_NOT_LOGGED_IN', 'REDIRECT_FAILED', 'WRONG_PAGE'];

export function createSyncWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();
  const syncEngine = new SyncEngine(pool, jobQueue);

  return new Worker('sync-conversation', async (job: Job<SyncConversationJobData>) => {
    const { storeId, profileId, conversationUrl } = job.data;

    logger.info(`[SyncWorker] Starting sync — store ${storeId}, profile ${profileId}`);
    logger.info(`[SyncWorker] URL: ${conversationUrl.substring(0, 100)}`);

    // ── Profile lock: prevent two workers from opening the same profile ───────
    if (jobQueue.isProfileLocked(profileId)) {
      logger.warn(`[SyncWorker] Profile ${profileId} is locked — requeueing in 30s`);
      await new Promise(r => setTimeout(r, 30000));
      throw new Error('Profile locked - retry later');
    }

    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      // ── Open AdsPower profile ───────────────────────────────────────────────
      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) {
        throw new Error(`Could not open AdsPower profile ${profileId}`);
      }
      logger.info(`[SyncWorker] Profile ${profileId} opened`);

      // Wait for browser to be fully ready
      await new Promise(r => setTimeout(r, 5000));

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer, { timeout: 60000 });
      const context = browser.contexts()[0];

      // Close extra tabs
      const allPages = context.pages();
      for (let i = 1; i < allPages.length; i++) {
        await allPages[i].close().catch(() => {});
      }
      const page = allPages[0] || await context.newPage();

      const storeName = await syncEngine.getStoreName(storeId);
      const scraper = new EtsyScraper(page, storeName);

      // ── Pre-check: verify Etsy login ────────────────────────────────────────
      logger.info(`[SyncWorker] Checking Etsy login status for profile ${profileId}...`);
      const isLoggedIn = await scraper.checkEtsyLogin();

      if (!isLoggedIn) {
        // Mark store as needing re-authentication
        await pool.query(
          `UPDATE stores SET status = 'needs_reauth', updated_at = NOW() WHERE id = $1`,
          [storeId]
        ).catch(() => {});
        throw new Error(
          `ETSY_NOT_LOGGED_IN: Store ${storeId} profile ${profileId} is NOT logged in to Etsy. ` +
          `Manual re-authentication required. Store marked as 'needs_reauth'.`
        );
      }

      logger.info(`[SyncWorker] ✓ Profile ${profileId} is logged in to Etsy`);

      // ── Scrape conversation ─────────────────────────────────────────────────
      const conversation = await scraper.scrapeConversation(conversationUrl, job.data.buyerName);
      await syncEngine.syncConversation(storeId, conversation);

      // ── Scrape listing previews from URLs in messages ───────────────────────
      const listingUrls = extractListingUrls(conversation.messages);
      if (listingUrls.length > 0) {
        logger.info(`[SyncWorker] Found ${listingUrls.length} listing URL(s) — scraping previews...`);
        const listingScraper = new ListingScraper(page);
        await listingScraper.scrapeAndSave(pool, listingUrls);
      }

      logger.info(`[SyncWorker] ✓ Sync complete for store ${storeId}`);

    } catch (error: any) {
      const errMsg: string = error?.message || String(error);

      // ── Auth errors: don't retry, mark store ───────────────────────────────
      const isAuthError = AUTH_ERRORS.some(code => errMsg.includes(code));
      if (isAuthError) {
        logger.error(
          `[SyncWorker] 🔴 AUTH ERROR — Store ${storeId} profile ${profileId} needs manual re-login to Etsy!\n` +
          `Error: ${errMsg}`
        );
        // Mark store as needing re-auth so we stop spamming sync attempts
        await pool.query(
          `UPDATE stores SET status = 'needs_reauth', updated_at = NOW() WHERE id = $1`,
          [storeId]
        ).catch(() => {});
        // Don't rethrow — no point retrying an auth error
        return;
      }

      logger.error(`[SyncWorker] Sync failed for store ${storeId}: ${errMsg}`);
      throw error; // Let BullMQ retry
    } finally {
      if (browser) {
        try { await browser.close(); } catch {}
      }
      await adspower.closeProfile(profileId);
      jobQueue.unlockProfile(profileId);
      logger.info(`[SyncWorker] Profile ${profileId} closed and unlocked`);
    }
  }, {
    connection: getRedisConnection(),
    concurrency: 2,          // reduced from 3 to avoid profile conflicts
    lockDuration: 300000,
    limiter: { max: 3, duration: 60000 },
  });
}
