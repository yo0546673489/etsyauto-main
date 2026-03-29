import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyReviewReplier } from '../../browser/etsyReviewReplier';
import { AIReplyGenerator } from '../../ai/replyGenerator';
import { logger } from '../../utils/logger';

interface ReviewReplyJob {
  replyId: number;        // ID מטבלת review_replies
  storeId: number;
  serialNumber: string;   // AdsPower profile
  storeName: string;
  reviewerName: string;
  reviewRating: number;
  reviewText: string;
  listingTitle?: string;
  replyText?: string;     // טקסט ידני (אם לא — ייווצר ע"י AI)
  useAI: boolean;
}

export function createReviewReplyWorker(pool: Pool) {
  const adspower = new AdsPowerController();
  const aiGenerator = new AIReplyGenerator(pool);

  function getRedisConnection() {
    try {
      const url = new URL(config.redis.url);
      return { host: url.hostname || 'localhost', port: parseInt(url.port || '6379') };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }

  const worker = new Worker(
    'review-reply',
    async (job: Job<ReviewReplyJob>) => {
      const data = job.data;
      logger.info(`Processing review reply job ${data.replyId} for store ${data.storeName}`);

      // עדכון סטטוס
      await pool.query(
        'UPDATE review_replies SET status = $1, attempts = attempts + 1 WHERE id = $2',
        ['processing', data.replyId]
      );

      let replyText = data.replyText || '';

      // אם צריך AI — ייצר תגובה
      if (data.useAI || !replyText) {
        const aiReply = await aiGenerator.generateReviewReply(
          data.storeId,
          data.reviewerName,
          data.reviewRating,
          data.reviewText,
          data.listingTitle
        );
        if (aiReply) {
          replyText = aiReply.text;
          // עדכון הטקסט בטבלה
          await pool.query(
            'UPDATE review_replies SET reply_text = $1, reply_source = $2 WHERE id = $3',
            [replyText, 'ai', data.replyId]
          );
        } else {
          throw new Error('AI failed to generate reply and no manual text provided');
        }
      }

      // פתיחת פרופיל AdsPower
      const browserInfo = await adspower.openProfile(data.serialNumber);
      if (!browserInfo) throw new Error(`Failed to open AdsPower profile ${data.serialNumber}`);

      let browser;
      try {
        // חיבור ל-Playwright דרך WebSocket
        browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();

        const replier = new EtsyReviewReplier(page, data.storeName);

        // ניווט לדף ביקורות
        await replier.navigateToReviewsPage();

        // סריקת ביקורות ומציאת הביקורת הנכונה
        const reviews = await replier.scrapeReviews();
        const targetIndex = reviews.findIndex(
          r => r.reviewerName === data.reviewerName && !r.hasExistingReply
        );

        if (targetIndex === -1) {
          throw new Error(`Review from ${data.reviewerName} not found or already has reply`);
        }

        // שליחת תגובה
        const success = await replier.replyToReview(targetIndex, replyText);

        if (success) {
          await pool.query(
            'UPDATE review_replies SET status = $1, sent_at = NOW() WHERE id = $2',
            ['sent', data.replyId]
          );
          logger.info(`Review reply ${data.replyId} sent successfully`);
        } else {
          throw new Error('Reply verification failed');
        }
      } finally {
        if (browser) await browser.close().catch(() => {});
        // סגירת פרופיל AdsPower אחרי השהיה אקראית
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        await adspower.closeProfile(data.serialNumber);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // פרופיל אחד בכל פעם!
      limiter: { max: 3, duration: 60000 }, // מקסימום 3 תגובות לדקה
    }
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await pool.query(
        'UPDATE review_replies SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', err.message, job.data.replyId]
      );
    }
    logger.error(`Review reply job failed: ${err.message}`);
  });

  return worker;
}
