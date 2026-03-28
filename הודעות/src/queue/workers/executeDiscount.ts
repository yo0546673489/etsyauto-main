import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyDiscountManager, DiscountConfig } from '../../browser/etsyDiscountManager';
import { JobQueue, ExecuteDiscountJobData } from '../setup';
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

export function createDiscountWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();

  return new Worker('execute-discount', async (job: Job<ExecuteDiscountJobData>) => {
    const { discountTaskId, storeId, profileId, shopName, taskType } = job.data;

    if (jobQueue.isProfileLocked(profileId)) throw new Error('Profile locked');
    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      await pool.query(
        'UPDATE discount_tasks SET status = $1, attempts = attempts + 1 WHERE id = $2',
        ['processing', discountTaskId]
      );

      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) throw new Error(`Could not open profile ${profileId}`);

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
      const context = browser.contexts()[0];
      const page = context.pages()[0] || await context.newPage();

      const manager = new EtsyDiscountManager(page, shopName);
      let success = false;

      if (taskType === 'create_sale' || taskType === 'update_sale') {
        // טעינת פרטי המבצע מהDB
        const taskResult = await pool.query(
          'SELECT * FROM discount_tasks WHERE id = $1',
          [discountTaskId]
        );
        const task = taskResult.rows[0];

        // אם update — סגירת המבצע הקיים קודם
        if (taskType === 'update_sale' && task.sale_name) {
          await manager.endSale(task.sale_name);
          // השהיה בין פעולות
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        }

        const discountConfig: DiscountConfig = {
          saleName: task.sale_name,
          discountPercent: task.discount_percent,
          targetScope: task.target_scope || 'whole_shop',
          listingIds: task.listing_ids || undefined,
          targetCountry: task.target_country || 'Everywhere',
          termsText: task.terms_text || undefined,
          startDate: task.start_date,
          endDate: task.end_date,
        };

        success = await manager.createSale(discountConfig);
      } else if (taskType === 'end_sale') {
        const taskResult = await pool.query(
          'SELECT sale_name FROM discount_tasks WHERE id = $1',
          [discountTaskId]
        );
        success = await manager.endSale(taskResult.rows[0].sale_name);
      }

      if (!success) throw new Error(`Discount task "${taskType}" failed`);

      await pool.query(
        'UPDATE discount_tasks SET status = $1, executed_at = NOW() WHERE id = $2',
        ['completed', discountTaskId]
      );

      logger.info(`Discount task completed: ${taskType} for store ${storeId}`);
    } catch (error) {
      logger.error(`Discount task failed for id=${discountTaskId}`, error);
      await pool.query(
        'UPDATE discount_tasks SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', String(error), discountTaskId]
      );
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
