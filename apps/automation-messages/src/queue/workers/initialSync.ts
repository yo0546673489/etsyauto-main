import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { InitialSyncJobData } from '../setup';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyScraper } from '../../browser/etsyScraper';
import { InboxScraper } from '../../browser/inboxScraper';
import { SyncEngine } from '../../sync/engine';
import { JobQueue } from '../setup';
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

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
  );
}

export function createInitialSyncWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();
  const syncEngine = new SyncEngine(pool, jobQueue);

  return new Worker('initial-sync', async (job: Job<InitialSyncJobData>) => {
    const { storeId, profileId, storeName } = job.data;

    logger.info(`[InitialSync] 🚀 מתחיל סריקה מלאה — חנות ${storeId} (${storeName}), פרופיל ${profileId}`);

    if (jobQueue.isProfileLocked(profileId)) {
      logger.warn(`[InitialSync] פרופיל ${profileId} נעול — ממתין 60 שניות`);
      await randomDelay(60000, 90000);
      throw new Error('Profile locked - retry later');
    }

    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      // ── פתיחת פרופיל AdsPower ─────────────────────────────────────────────
      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) {
        throw new Error(`לא ניתן לפתוח פרופיל AdsPower: ${profileId}`);
      }
      logger.info(`[InitialSync] פרופיל ${profileId} נפתח`);
      await randomDelay(5000, 8000);

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer, { timeout: 60000 });
      const context = browser.contexts()[0];

      // סגירת טאבים מיותרים
      const allPages = context.pages();
      for (let i = 1; i < allPages.length; i++) {
        await allPages[i].close().catch(() => {});
      }
      const page = allPages[0] || await context.newPage();

      // ── בדיקת התחברות + חימום ─────────────────────────────────────────────
      const scraper = new EtsyScraper(page, storeName);
      logger.info(`[InitialSync] בודק התחברות ל-Etsy (עם חימום)...`);
      const isLoggedIn = await scraper.checkEtsyLogin(true); // ← withWarmUp = true

      if (!isLoggedIn) {
        await pool.query(
          `UPDATE stores SET status = 'needs_reauth', updated_at = NOW() WHERE id = $1`,
          [storeId]
        );
        throw new Error(`ETSY_NOT_LOGGED_IN: חנות ${storeId} לא מחוברת. סומנה כ-needs_reauth.`);
      }
      logger.info(`[InitialSync] ✓ מחובר ל-Etsy`);

      // ── סריקת כל השיחות מתיבת הדואר ───────────────────────────────────────
      const inboxScraper = new InboxScraper(page);
      // withWarmUp=false כי כבר עשינו חימום ב-checkEtsyLogin למעלה
      const conversations = await inboxScraper.scrapeAllConversations(false);

      if (conversations.length === 0) {
        logger.info(`[InitialSync] אין שיחות בתיבת הדואר של חנות ${storeId}`);
      } else {
        logger.info(`[InitialSync] נמצאו ${conversations.length} שיחות — מתחיל סנכרון...`);
      }

      // ── סנכרון כל שיחה ────────────────────────────────────────────────────
      let synced = 0;
      let skipped = 0;

      for (const conv of conversations) {
        try {
          logger.info(`[InitialSync] [${synced + skipped + 1}/${conversations.length}] סנכרון: ${conv.buyerName}`);

          const scraped = await scraper.scrapeConversation(conv.url, conv.buyerName);
          await syncEngine.syncConversation(storeId, scraped);
          synced++;

          // השהיה אנושית בין שיחות
          await randomDelay(2000, 6000);
        } catch (err: any) {
          logger.error(`[InitialSync] שגיאה בסנכרון ${conv.url}: ${err?.message}`);
          skipped++;

          // אם שגיאת AUTH — עצור הכל
          if (err?.message?.includes('ETSY_NOT_LOGGED_IN')) {
            logger.error(`[InitialSync] 🔴 נותקה ההתחברות — עוצר סריקה`);
            break;
          }
        }
      }

      // ── סימון כהושלם ─────────────────────────────────────────────────────
      await pool.query(
        `UPDATE stores SET initial_sync_completed = TRUE, status = 'active', updated_at = NOW() WHERE id = $1`,
        [storeId]
      );

      logger.info(
        `[InitialSync] ✅ סריקה מלאה הושלמה — חנות ${storeId} (${storeName}): ` +
        `${synced} שיחות סונכרנו, ${skipped} דולגו`
      );

    } catch (error: any) {
      logger.error(`[InitialSync] ❌ שגיאה בסריקת חנות ${storeId}: ${error?.message}`);
      throw error;
    } finally {
      if (browser) {
        try { await browser.close(); } catch {}
      }
      await adspower.closeProfile(profileId);
      jobQueue.unlockProfile(profileId);
      logger.info(`[InitialSync] פרופיל ${profileId} נסגר`);
    }
  }, {
    connection: getRedisConnection(),
    concurrency: 1, // סריקה מלאה — חנות אחת בכל פעם
    lockDuration: 600000, // 10 דקות
  });
}
