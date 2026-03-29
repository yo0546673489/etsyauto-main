import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyDiscountManager, SaleConfig } from '../../browser/etsyDiscountManager';
import { logger } from '../../utils/logger';

interface DiscountJob {
  taskId: number;          // ID מטבלת discount_tasks
  storeId: number;
  serialNumber: string;    // AdsPower profile
  taskType: 'create_sale' | 'end_sale';
  saleConfig?: SaleConfig; // רק ל-create_sale
  saleName?: string;       // רק ל-end_sale
}

export function createDiscountWorker(pool: Pool) {
  const adspower = new AdsPowerController();

  function getRedisConnection() {
    try {
      const url = new URL(config.redis.url);
      return { host: url.hostname || 'localhost', port: parseInt(url.port || '6379') };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }

  const worker = new Worker(
    'discount-execute',
    async (job: Job<DiscountJob>) => {
      const data = job.data;
      logger.info(`Processing discount job ${data.taskId}: ${data.taskType}`);

      // עדכון סטטוס
      await pool.query(
        'UPDATE discount_tasks SET status = $1, attempts = attempts + 1 WHERE id = $2',
        ['processing', data.taskId]
      );

      // פתיחת פרופיל AdsPower
      const browserInfo = await adspower.openProfile(data.serialNumber);
      if (!browserInfo) throw new Error(`Failed to open AdsPower profile ${data.serialNumber}`);

      let browser;
      try {
        browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();

        const discountManager = new EtsyDiscountManager(page);

        let success = false;

        if (data.taskType === 'create_sale' && data.saleConfig) {
          success = await discountManager.createSale(data.saleConfig);
        } else if (data.taskType === 'end_sale' && data.saleName) {
          success = await discountManager.endSale(data.saleName);
        } else {
          throw new Error(`Invalid task type or missing config: ${data.taskType}`);
        }

        if (success) {
          await pool.query(
            'UPDATE discount_tasks SET status = $1, executed_at = NOW() WHERE id = $2',
            ['completed', data.taskId]
          );
          logger.info(`Discount task ${data.taskId} completed successfully`);
        } else {
          throw new Error('Discount operation verification failed');
        }
      } finally {
        if (browser) await browser.close().catch(() => {});
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        await adspower.closeProfile(data.serialNumber);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
      limiter: { max: 2, duration: 60000 }, // מקסימום 2 פעולות הנחה לדקה
    }
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await pool.query(
        'UPDATE discount_tasks SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', err.message, job.data.taskId]
      );
    }
    logger.error(`Discount job failed: ${err.message}`);
  });

  return worker;
}
