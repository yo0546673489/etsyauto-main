import { Worker, Job } from 'bullmq';
import { chromium } from 'playwright';
import { config } from '../../config';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyReviewReplier } from '../../browser/etsyReviewReplier';
import { JobQueue, ReplyToReviewJobData } from '../setup';
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

export function createReviewReplyWorker(pool: Pool, jobQueue: JobQueue): Worker {
  const adspower = new AdsPowerController();

  return new Worker('reply-to-review', async (job: Job<ReplyToReviewJobData>) => {
    const { reviewReplyId, storeId, profileId, replyText, shopName } = job.data;

    if (jobQueue.isProfileLocked(profileId)) throw new Error('Profile locked');
    jobQueue.lockProfile(profileId);
    let browser = null;

    try {
      await pool.query(
        'UPDATE review_replies SET status = $1, attempts = attempts + 1 WHERE id = $2',
        ['processing', reviewReplyId]
      );

      const browserInfo = await adspower.openProfile(profileId);
      if (!browserInfo) throw new Error(`Could not open profile ${profileId}`);

      browser = await chromium.connectOverCDP(browserInfo.ws.puppeteer);
      const context = browser.contexts()[0];
      const page = context.pages()[0] || await context.newPage();

      const replier = new EtsyReviewReplier(page, shopName);
      await replier.navigateToReviewsPage();

      // סריקת ביקורות ומציאת הביקורת המתאימה
      const reviews = await replier.scrapeReviews();
      const reviewData = await pool.query(
        'SELECT reviewer_name, review_text FROM review_replies WHERE id = $1',
        [reviewReplyId]
      );
      const targetReview = reviewData.rows[0];

      // מציאת אינדקס הביקורת לפי שם המבקר ותוכן
      let reviewIndex = -1;
      for (let i = 0; i < reviews.length; i++) {
        if (!reviews[i].hasExistingReply &&
            (reviews[i].reviewerName === targetReview.reviewer_name ||
             reviews[i].reviewText.includes(targetReview.review_text?.substring(0, 30) || ''))) {
          reviewIndex = i;
          break;
        }
      }

      if (reviewIndex === -1) {
        // fallback — תגובה לביקורת הראשונה ללא תגובה
        reviewIndex = reviews.findIndex(r => !r.hasExistingReply);
      }

      if (reviewIndex === -1) {
        throw new Error('No unreplied review found matching the target');
      }

      const success = await replier.replyToReview(reviewIndex, replyText);
      if (!success) throw new Error('Review reply verification failed');

      await pool.query(
        'UPDATE review_replies SET status = $1, sent_at = NOW() WHERE id = $2',
        ['sent', reviewReplyId]
      );

      logger.info(`Review reply sent for review_replies.id=${reviewReplyId}`);
    } catch (error) {
      logger.error(`Review reply failed for id=${reviewReplyId}`, error);
      await pool.query(
        'UPDATE review_replies SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', String(error), reviewReplyId]
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
