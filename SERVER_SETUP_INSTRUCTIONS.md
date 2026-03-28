# PROFITLY AUTOMATION SERVER — הוראות התקנה מלאות

## מה לעשות:
בצע את כל הפעולות הבאות **ללא שאלות** — פשוט תעשה הכל.

### שלב 1: Git Pull
```bash
cd /home/claude/etsyauto-main/
git pull origin main
```

### שלב 2: צור קבצים חדשים

צור את כל הקבצים הבאים בתוך תיקיית `הודעות/`:

---

#### קובץ: `הודעות/src/db/migrations/002_reviews_discounts.sql`

```sql
-- Migration 002: Reviews + Discounts tables

CREATE TABLE IF NOT EXISTS ai_settings (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    feature VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    system_prompt TEXT NOT NULL,
    model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
    max_tokens INTEGER DEFAULT 500,
    temperature REAL DEFAULT 0.7,
    language VARCHAR(10) DEFAULT 'en',
    auto_send BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store_id, feature)
);

CREATE TABLE IF NOT EXISTS review_replies (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    etsy_review_id VARCHAR(255),
    etsy_listing_id VARCHAR(255),
    reviewer_name VARCHAR(255),
    review_rating INTEGER,
    review_text TEXT,
    review_date TIMESTAMP,
    reply_text TEXT NOT NULL,
    reply_source VARCHAR(20) DEFAULT 'manual',
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discount_tasks (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    task_type VARCHAR(30) NOT NULL,
    sale_name VARCHAR(255),
    discount_percent INTEGER,
    target_scope VARCHAR(30) DEFAULT 'whole_shop',
    listing_ids TEXT[],
    target_country VARCHAR(100) DEFAULT 'Everywhere',
    terms_text VARCHAR(500),
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discount_schedules (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    schedule_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    rotation_config JSONB NOT NULL,
    target_scope VARCHAR(30) DEFAULT 'whole_shop',
    listing_ids TEXT[],
    target_country VARCHAR(100) DEFAULT 'Everywhere',
    terms_text VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_replies_store_id ON review_replies(store_id);
CREATE INDEX IF NOT EXISTS idx_review_replies_status ON review_replies(status);
CREATE INDEX IF NOT EXISTS idx_discount_tasks_store_id ON discount_tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_discount_tasks_status ON discount_tasks(status);
CREATE INDEX IF NOT EXISTS idx_discount_schedules_store_id ON discount_schedules(store_id);
CREATE INDEX IF NOT EXISTS idx_discount_schedules_active ON discount_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_settings_store_feature ON ai_settings(store_id, feature);
```

---

#### קובץ: `הודעות/src/ai/replyGenerator.ts`

```typescript
import axios from 'axios';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface AISettings {
  enabled: boolean;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number;
  language: string;
  auto_send: boolean;
}

interface GeneratedReply {
  text: string;
  source: 'ai';
}

export class AIReplyGenerator {
  private pool: Pool;
  private apiKey: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
  }

  async getSettings(storeId: number, feature: 'messages' | 'reviews'): Promise<AISettings | null> {
    const result = await this.pool.query(
      'SELECT * FROM ai_settings WHERE store_id = $1 AND feature = $2',
      [storeId, feature]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  async generateMessageReply(
    storeId: number,
    customerName: string,
    customerMessage: string,
    conversationHistory: { sender: string; text: string }[]
  ): Promise<GeneratedReply | null> {
    const settings = await this.getSettings(storeId, 'messages');
    if (!settings || !settings.enabled) return null;

    const historyText = conversationHistory
      .slice(-10)
      .map(m => `${m.sender}: ${m.text}`)
      .join('\n');

    const userPrompt = `
היסטוריית שיחה:
${historyText}

הודעה חדשה מ-${customerName}:
"${customerMessage}"

כתוב תגובה מתאימה בשפה: ${settings.language}
`;

    return await this.callAPI(settings, userPrompt);
  }

  async generateReviewReply(
    storeId: number,
    reviewerName: string,
    reviewRating: number,
    reviewText: string,
    productName?: string
  ): Promise<GeneratedReply | null> {
    const settings = await this.getSettings(storeId, 'reviews');
    if (!settings || !settings.enabled) return null;

    const userPrompt = `
ביקורת מ-${reviewerName}:
דירוג: ${'⭐'.repeat(reviewRating)} (${reviewRating}/5)
${productName ? `מוצר: ${productName}` : ''}
תוכן: "${reviewText}"

כתוב תגובה מתאימה מטעם החנות בשפה: ${settings.language}
`;

    return await this.callAPI(settings, userPrompt);
  }

  private async callAPI(settings: AISettings, userPrompt: string): Promise<GeneratedReply | null> {
    if (!this.apiKey) {
      logger.error('ANTHROPIC_API_KEY not configured');
      return null;
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: settings.model,
          max_tokens: settings.max_tokens,
          system: settings.system_prompt,
          messages: [{ role: 'user', content: userPrompt }],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 30000,
        }
      );

      const text = response.data.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      if (!text) {
        logger.warn('AI returned empty response');
        return null;
      }

      logger.info(`AI generated reply: ${text.substring(0, 50)}...`);
      return { text: text.trim(), source: 'ai' };
    } catch (error: any) {
      logger.error('AI API call failed', error?.response?.data || error.message);
      return null;
    }
  }
}
```

---

#### קובץ: `הודעות/src/browser/etsyReviewReplier.ts`

```typescript
import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomBetween(minMs, maxMs)));
}

export interface ReviewInfo {
  reviewerName: string;
  rating: number;
  reviewText: string;
  listingTitle?: string;
  hasExistingReply: boolean;
  reviewElementSelector?: string;
}

export class EtsyReviewReplier {
  private page: Page;
  private human: HumanBehavior;
  private shopName: string;

  constructor(page: Page, shopName: string) {
    this.page = page;
    this.human = new HumanBehavior(page);
    this.shopName = shopName;
  }

  async navigateToReviewsPage(): Promise<void> {
    logger.info('Navigating to reviews page...');
    await this.human.humanNavigate('https://www.etsy.com/your/shops/me/reviews');
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await randomDelay(2000, 4000);
    await this.human.randomMouseMovement();
    await this.human.humanScroll('down', randomBetween(100, 300));
    logger.info('Arrived at reviews page');
  }

  async scrapeReviews(): Promise<ReviewInfo[]> {
    await this.human.humanScroll('down', randomBetween(200, 400));
    await randomDelay(1000, 2000);

    const reviews = await this.page.evaluate(() => {
      const reviewElements = document.querySelectorAll(
        '[data-review-id], .review-card, .shop-review'
      );

      return Array.from(reviewElements).map((el, index) => {
        const nameEl = el.querySelector('.reviewer-name, [data-reviewer-name], .review-author');
        const ratingEl = el.querySelector('[data-rating], .stars-svg, .review-rating');
        const textEl = el.querySelector('.review-text, .review-body, [data-review-content]');
        const listingEl = el.querySelector('.listing-title, .review-listing-link, [data-listing-title]');
        const replyEl = el.querySelector('.shop-response, .review-reply, [data-shop-response]');

        let rating = 5;
        if (ratingEl) {
          const ratingText = ratingEl.getAttribute('data-rating')
            || ratingEl.getAttribute('aria-label')
            || ratingEl.textContent || '';
          const match = ratingText.match(/(\d)/);
          if (match) rating = parseInt(match[1]);
        }

        return {
          reviewerName: nameEl?.textContent?.trim() || 'Unknown',
          rating,
          reviewText: textEl?.textContent?.trim() || '',
          listingTitle: listingEl?.textContent?.trim() || undefined,
          hasExistingReply: !!replyEl,
          reviewElementSelector: `[data-review-id="${el.getAttribute('data-review-id')}"]`,
        };
      });
    });

    for (const review of reviews) {
      if (review.reviewText) {
        await this.human.readingDelay(review.reviewText.length);
      }
    }

    logger.info(`Scraped ${reviews.length} reviews (${reviews.filter(r => !r.hasExistingReply).length} without reply)`);
    return reviews;
  }

  async replyToReview(reviewIndex: number, replyText: string): Promise<boolean> {
    try {
      logger.info(`Replying to review #${reviewIndex}...`);

      const currentUrl = this.page.url();
      if (!currentUrl.includes('/reviews')) {
        await this.navigateToReviewsPage();
      }

      await this.human.humanScroll('down', randomBetween(200, 500));
      await randomDelay(1000, 2000);

      const reviewCards = await this.page.$$('[data-review-id], .review-card, .shop-review');
      if (reviewIndex >= reviewCards.length) {
        logger.error(`Review index ${reviewIndex} out of bounds (${reviewCards.length} total)`);
        return false;
      }

      const targetReview = reviewCards[reviewIndex];
      await targetReview.scrollIntoViewIfNeeded();
      await randomDelay(800, 1500);
      await this.human.randomMouseMovement();

      const reviewText = await targetReview.evaluate(el => el.textContent || '');
      await this.human.readingDelay(reviewText.length);

      const replyButton = await targetReview.$(
        'button:has-text("Reply"), button:has-text("Respond"), [data-reply-button], .reply-to-review-btn'
      );

      if (!replyButton) {
        logger.error('Reply button not found for this review');
        return false;
      }

      await this.human.humanClick(
        'button:has-text("Reply"), button:has-text("Respond"), [data-reply-button]'
      );
      await randomDelay(1000, 2000);

      await this.human.thinkBeforeSending();

      const replyInputSelector = 'textarea.reply-input, textarea[name="reply"], [data-reply-input], textarea';
      await this.human.humanType(replyInputSelector, replyText);

      await this.human.readingDelay(replyText.length);
      await randomDelay(1000, 3000);

      const submitSelector = 'button[type="submit"]:has-text("Post"), button:has-text("Submit"), [data-submit-reply]';
      await this.human.humanClick(submitSelector);

      await randomDelay(2000, 4000);

      const success = await this.page.evaluate((text: string) => {
        const replies = document.querySelectorAll('.shop-response, .review-reply, [data-shop-response]');
        const lastReply = replies[replies.length - 1];
        return lastReply?.textContent?.includes(text.substring(0, 30)) || false;
      }, replyText);

      if (success) {
        logger.info('Review reply sent successfully');
      } else {
        logger.warn('Could not verify review reply was sent — may still have worked');
      }

      return true;
    } catch (error: any) {
      logger.error('Failed to reply to review', error.message);
      return false;
    }
  }
}
```

---

#### קובץ: `הודעות/src/browser/etsyDiscountManager.ts`

```typescript
import { Page } from 'playwright';
import { HumanBehavior } from './humanBehavior';
import { logger } from '../utils/logger';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomBetween(minMs, maxMs)));
}

export interface DiscountTask {
  taskType: 'create_sale' | 'end_sale' | 'update_sale';
  saleName: string;
  discountPercent: number;
  targetScope: 'whole_shop' | 'specific_listings';
  listingIds?: string[];
  targetCountry: string;
  termsText?: string;
  startDate: string;
  endDate: string;
}

export class EtsyDiscountManager {
  private page: Page;
  private human: HumanBehavior;

  constructor(page: Page) {
    this.page = page;
    this.human = new HumanBehavior(page);
  }

  async navigateToSalesPage(): Promise<void> {
    logger.info('Navigating to sales & discounts page...');
    await this.human.humanNavigate('https://www.etsy.com/your/shops/me/sales');
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await randomDelay(2000, 4000);
    await this.human.randomMouseMovement();
    logger.info('Arrived at sales page');
  }

  async createSale(task: DiscountTask): Promise<boolean> {
    try {
      logger.info(`Creating sale: ${task.saleName} (${task.discountPercent}% off)`);

      await this.navigateToSalesPage();

      // Click "New special offer" or "Create sale" button
      const newSaleSelector = 'button:has-text("New special offer"), button:has-text("Create sale"), a:has-text("New special offer")';
      await this.human.humanClick(newSaleSelector);
      await randomDelay(2000, 3000);

      // Select "Run a sale"
      const runSaleSelector = 'button:has-text("Run a sale"), [data-action="run-sale"]';
      await this.human.humanClick(runSaleSelector);
      await randomDelay(1500, 2500);

      // Sale name
      await this.human.thinkBeforeSending();
      await this.human.humanType('input[name="sale_name"], input[placeholder*="name"], #sale-name', task.saleName);
      await randomDelay(500, 1000);

      // Discount percentage
      const percentInput = 'input[name="discount_percent"], input[type="number"], #discount-percent';
      await this.human.humanClick(percentInput);
      await randomDelay(300, 600);
      await this.page.fill(percentInput, '');
      await this.human.humanType(percentInput, task.discountPercent.toString());
      await randomDelay(500, 1000);

      // Target scope
      if (task.targetScope === 'whole_shop') {
        const wholeShopSelector = 'label:has-text("Whole shop"), input[value="whole_shop"], [data-scope="whole_shop"]';
        await this.human.humanClick(wholeShopSelector);
        await randomDelay(500, 1000);
      }

      // Country targeting
      if (task.targetCountry !== 'Everywhere') {
        const countrySelector = 'select[name="country"], #target-country';
        await this.page.selectOption(countrySelector, { label: task.targetCountry });
        await randomDelay(500, 1000);
      }

      // Terms
      if (task.termsText) {
        const termsSelector = 'textarea[name="terms"], #sale-terms, textarea';
        await this.human.humanType(termsSelector, task.termsText);
        await randomDelay(500, 1000);
      }

      // Dates — start date
      const startDateSelector = 'input[name="start_date"], #start-date';
      await this.human.humanClick(startDateSelector);
      await randomDelay(300, 600);
      await this.page.fill(startDateSelector, task.startDate);
      await randomDelay(500, 1000);

      // End date
      const endDateSelector = 'input[name="end_date"], #end-date';
      await this.human.humanClick(endDateSelector);
      await randomDelay(300, 600);
      await this.page.fill(endDateSelector, task.endDate);
      await randomDelay(1000, 2000);

      // Review and submit
      await this.human.readingDelay(200);
      await this.human.thinkBeforeSending();

      const submitSelector = 'button[type="submit"]:has-text("Start"), button:has-text("Confirm"), button:has-text("Save")';
      await this.human.humanClick(submitSelector);

      await randomDelay(3000, 5000);

      logger.info(`Sale "${task.saleName}" created successfully`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to create sale: ${error.message}`);
      return false;
    }
  }

  async endSale(saleName: string): Promise<boolean> {
    try {
      logger.info(`Ending sale: ${saleName}`);

      await this.navigateToSalesPage();
      await randomDelay(1000, 2000);

      // Find the sale by name
      const saleCard = await this.page.$(`text="${saleName}"`);
      if (!saleCard) {
        logger.error(`Sale "${saleName}" not found`);
        return false;
      }

      await saleCard.scrollIntoViewIfNeeded();
      await randomDelay(500, 1000);

      // Click on the sale
      await this.human.humanClick(`text="${saleName}"`);
      await randomDelay(1500, 2500);

      // Click "End sale" button
      const endSaleSelector = 'button:has-text("End sale"), button:has-text("End"), [data-action="end-sale"]';
      await this.human.humanClick(endSaleSelector);
      await randomDelay(1000, 2000);

      // Confirm
      const confirmSelector = 'button:has-text("Confirm"), button:has-text("Yes"), [data-action="confirm"]';
      await this.human.humanClick(confirmSelector);

      await randomDelay(2000, 4000);

      logger.info(`Sale "${saleName}" ended successfully`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to end sale: ${error.message}`);
      return false;
    }
  }
}
```

---

#### קובץ: `הודעות/src/queue/workers/replyToReview.ts`

```typescript
import { Job } from 'bullmq';
import { Pool } from 'pg';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyReviewReplier } from '../../browser/etsyReviewReplier';
import { AIReplyGenerator } from '../../ai/replyGenerator';
import { logger } from '../../utils/logger';
import { config } from '../../config';

interface ReplyToReviewJobData {
  reviewReplyId: number;
  storeId: number;
  profileId: string;
  shopName: string;
  reviewIndex: number;
  replyText: string;
}

export async function replyToReviewWorker(job: Job<ReplyToReviewJobData>) {
  const { reviewReplyId, storeId, profileId, shopName, reviewIndex, replyText } = job.data;
  const pool = new Pool({ connectionString: config.db.connectionString });

  try {
    logger.info(`[replyToReview] Starting job for review reply #${reviewReplyId}`);

    await pool.query(
      'UPDATE review_replies SET status = $1, attempts = attempts + 1 WHERE id = $2',
      ['processing', reviewReplyId]
    );

    // Open AdsPower profile
    const adspower = new AdsPowerController();
    const browserContext = await adspower.openProfile(profileId);

    if (!browserContext) {
      throw new Error(`Failed to open AdsPower profile: ${profileId}`);
    }

    const page = browserContext.pages()[0] || await browserContext.newPage();
    const replier = new EtsyReviewReplier(page, shopName);

    // Navigate to reviews
    await replier.navigateToReviewsPage();

    // Reply
    const success = await replier.replyToReview(reviewIndex, replyText);

    if (success) {
      await pool.query(
        'UPDATE review_replies SET status = $1, sent_at = NOW() WHERE id = $2',
        ['sent', reviewReplyId]
      );
      logger.info(`[replyToReview] Review reply #${reviewReplyId} sent successfully`);
    } else {
      throw new Error('Reply action returned false');
    }

    // Close profile
    await adspower.closeProfile(profileId);
  } catch (error: any) {
    logger.error(`[replyToReview] Failed: ${error.message}`);
    await pool.query(
      'UPDATE review_replies SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', error.message, reviewReplyId]
    );
    throw error;
  } finally {
    await pool.end();
  }
}
```

---

#### קובץ: `הודעות/src/queue/workers/executeDiscount.ts`

```typescript
import { Job } from 'bullmq';
import { Pool } from 'pg';
import { AdsPowerController } from '../../adspower/controller';
import { EtsyDiscountManager, DiscountTask } from '../../browser/etsyDiscountManager';
import { logger } from '../../utils/logger';
import { config } from '../../config';

interface ExecuteDiscountJobData {
  discountTaskId: number;
  storeId: number;
  profileId: string;
  task: DiscountTask;
}

export async function executeDiscountWorker(job: Job<ExecuteDiscountJobData>) {
  const { discountTaskId, storeId, profileId, task } = job.data;
  const pool = new Pool({ connectionString: config.db.connectionString });

  try {
    logger.info(`[executeDiscount] Starting task #${discountTaskId}: ${task.taskType}`);

    await pool.query(
      'UPDATE discount_tasks SET status = $1, attempts = attempts + 1 WHERE id = $2',
      ['processing', discountTaskId]
    );

    const adspower = new AdsPowerController();
    const browserContext = await adspower.openProfile(profileId);

    if (!browserContext) {
      throw new Error(`Failed to open AdsPower profile: ${profileId}`);
    }

    const page = browserContext.pages()[0] || await browserContext.newPage();
    const manager = new EtsyDiscountManager(page);

    let success = false;

    switch (task.taskType) {
      case 'create_sale':
        success = await manager.createSale(task);
        break;
      case 'end_sale':
        success = await manager.endSale(task.saleName);
        break;
      case 'update_sale':
        await manager.endSale(task.saleName);
        success = await manager.createSale(task);
        break;
    }

    if (success) {
      await pool.query(
        'UPDATE discount_tasks SET status = $1, executed_at = NOW() WHERE id = $2',
        ['completed', discountTaskId]
      );
      logger.info(`[executeDiscount] Task #${discountTaskId} completed`);
    } else {
      throw new Error('Discount action returned false');
    }

    await adspower.closeProfile(profileId);
  } catch (error: any) {
    logger.error(`[executeDiscount] Failed: ${error.message}`);
    await pool.query(
      'UPDATE discount_tasks SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', error.message, discountTaskId]
    );
    throw error;
  } finally {
    await pool.end();
  }
}
```

---

#### קובץ: `הודעות/src/api/routes/reviews.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { AIReplyGenerator } from '../../ai/replyGenerator';
import { logger } from '../../utils/logger';

export async function reviewRoutes(fastify: FastifyInstance, pool: Pool, reviewQueue: Queue) {
  const aiGenerator = new AIReplyGenerator(pool);

  // GET /api/reviews?store_id=X&status=pending
  fastify.get('/api/reviews', async (request, reply) => {
    const { store_id, status } = request.query as any;
    let query = 'SELECT * FROM review_replies WHERE 1=1';
    const params: any[] = [];

    if (store_id) {
      params.push(store_id);
      query += ` AND store_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    return result.rows;
  });

  // POST /api/reviews/reply — manual or AI reply
  fastify.post('/api/reviews/reply', async (request, reply) => {
    const { store_id, reviewer_name, review_rating, review_text, etsy_listing_id, reply_text, use_ai } = request.body as any;

    let finalReplyText = reply_text;
    let replySource = 'manual';

    // If use_ai is true, generate reply with AI
    if (use_ai && !reply_text) {
      const aiReply = await aiGenerator.generateReviewReply(
        store_id, reviewer_name, review_rating, review_text
      );
      if (aiReply) {
        finalReplyText = aiReply.text;
        replySource = 'ai';
      } else {
        return reply.status(500).send({ error: 'AI failed to generate reply' });
      }
    }

    // Save to DB
    const result = await pool.query(
      `INSERT INTO review_replies (store_id, reviewer_name, review_rating, review_text, etsy_listing_id, reply_text, reply_source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [store_id, reviewer_name, review_rating, review_text, etsy_listing_id, finalReplyText, replySource]
    );

    const reviewReply = result.rows[0];

    // Get store profile info for the queue job
    const storeResult = await pool.query('SELECT * FROM stores WHERE id = $1', [store_id]);
    const store = storeResult.rows[0];

    if (store) {
      await reviewQueue.add('reply-to-review', {
        reviewReplyId: reviewReply.id,
        storeId: store_id,
        profileId: store.adspower_profile_id,
        shopName: store.shop_name,
        reviewIndex: 0,
        replyText: finalReplyText,
      });
    }

    return reviewReply;
  });

  // GET /api/reviews/ai-settings?store_id=X
  fastify.get('/api/reviews/ai-settings', async (request, reply) => {
    const { store_id } = request.query as any;
    const result = await pool.query(
      'SELECT * FROM ai_settings WHERE store_id = $1 AND feature = $2',
      [store_id, 'reviews']
    );
    return result.rows[0] || null;
  });

  // POST /api/reviews/ai-settings — save AI settings
  fastify.post('/api/reviews/ai-settings', async (request, reply) => {
    const { store_id, enabled, system_prompt, model, max_tokens, temperature, language, auto_send } = request.body as any;

    const result = await pool.query(
      `INSERT INTO ai_settings (store_id, feature, enabled, system_prompt, model, max_tokens, temperature, language, auto_send)
       VALUES ($1, 'reviews', $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (store_id, feature) DO UPDATE SET
         enabled = $2, system_prompt = $3, model = $4, max_tokens = $5,
         temperature = $6, language = $7, auto_send = $8, updated_at = NOW()
       RETURNING *`,
      [store_id, enabled, system_prompt, model, max_tokens, temperature, language, auto_send]
    );

    return result.rows[0];
  });
}
```

---

#### קובץ: `הודעות/src/api/routes/discounts.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { logger } from '../../utils/logger';

export async function discountRoutes(fastify: FastifyInstance, pool: Pool, discountQueue: Queue) {

  // GET /api/discounts?store_id=X&status=pending
  fastify.get('/api/discounts', async (request, reply) => {
    const { store_id, status } = request.query as any;
    let query = 'SELECT * FROM discount_tasks WHERE 1=1';
    const params: any[] = [];

    if (store_id) {
      params.push(store_id);
      query += ` AND store_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    return result.rows;
  });

  // POST /api/discounts/create — create a new sale
  fastify.post('/api/discounts/create', async (request, reply) => {
    const {
      store_id, sale_name, discount_percent, target_scope,
      listing_ids, target_country, terms_text, start_date, end_date
    } = request.body as any;

    // Validate
    if (discount_percent < 5 || discount_percent > 75) {
      return reply.status(400).send({ error: 'Discount must be 5-75%' });
    }

    const result = await pool.query(
      `INSERT INTO discount_tasks (store_id, task_type, sale_name, discount_percent, target_scope, listing_ids, target_country, terms_text, start_date, end_date)
       VALUES ($1, 'create_sale', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [store_id, sale_name, discount_percent, target_scope || 'whole_shop', listing_ids || null, target_country || 'Everywhere', terms_text, start_date, end_date]
    );

    const task = result.rows[0];

    const storeResult = await pool.query('SELECT * FROM stores WHERE id = $1', [store_id]);
    const store = storeResult.rows[0];

    if (store) {
      await discountQueue.add('execute-discount', {
        discountTaskId: task.id,
        storeId: store_id,
        profileId: store.adspower_profile_id,
        task: {
          taskType: 'create_sale',
          saleName: sale_name,
          discountPercent: discount_percent,
          targetScope: target_scope || 'whole_shop',
          listingIds: listing_ids,
          targetCountry: target_country || 'Everywhere',
          termsText: terms_text,
          startDate: start_date,
          endDate: end_date,
        },
      });
    }

    return task;
  });

  // POST /api/discounts/end — end an active sale
  fastify.post('/api/discounts/end', async (request, reply) => {
    const { store_id, sale_name } = request.body as any;

    const result = await pool.query(
      `INSERT INTO discount_tasks (store_id, task_type, sale_name)
       VALUES ($1, 'end_sale', $2)
       RETURNING *`,
      [store_id, sale_name]
    );

    const task = result.rows[0];

    const storeResult = await pool.query('SELECT * FROM stores WHERE id = $1', [store_id]);
    const store = storeResult.rows[0];

    if (store) {
      await discountQueue.add('execute-discount', {
        discountTaskId: task.id,
        storeId: store_id,
        profileId: store.adspower_profile_id,
        task: {
          taskType: 'end_sale',
          saleName: sale_name,
          discountPercent: 0,
          targetScope: 'whole_shop',
          targetCountry: 'Everywhere',
          startDate: '',
          endDate: '',
        },
      });
    }

    return task;
  });

  // GET /api/discounts/schedules?store_id=X
  fastify.get('/api/discounts/schedules', async (request, reply) => {
    const { store_id } = request.query as any;
    const result = await pool.query(
      'SELECT * FROM discount_schedules WHERE store_id = $1 ORDER BY created_at DESC',
      [store_id]
    );
    return result.rows;
  });

  // POST /api/discounts/schedules — create rotation schedule
  fastify.post('/api/discounts/schedules', async (request, reply) => {
    const {
      store_id, schedule_name, rotation_config, target_scope,
      listing_ids, target_country, terms_text
    } = request.body as any;

    const result = await pool.query(
      `INSERT INTO discount_schedules (store_id, schedule_name, rotation_config, target_scope, listing_ids, target_country, terms_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [store_id, schedule_name, JSON.stringify(rotation_config), target_scope || 'whole_shop', listing_ids, target_country || 'Everywhere', terms_text]
    );

    return result.rows[0];
  });

  // DELETE /api/discounts/schedules/:id
  fastify.delete('/api/discounts/schedules/:id', async (request, reply) => {
    const { id } = request.params as any;
    await pool.query('DELETE FROM discount_schedules WHERE id = $1', [id]);
    return { success: true };
  });
}
```

---

### שלב 3: עדכן קבצים קיימים

#### עדכן `הודעות/src/api/server.ts`
הוסף בתוך הפונקציה הראשית, אחרי ה-routes הקיימים:
```typescript
import { reviewRoutes } from './routes/reviews';
import { discountRoutes } from './routes/discounts';

// Add after existing route registrations:
// const reviewQueue = new Queue('review-replies', { connection: redisConnection });
// const discountQueue = new Queue('discount-tasks', { connection: redisConnection });
// await reviewRoutes(fastify, pool, reviewQueue);
// await discountRoutes(fastify, pool, discountQueue);
```

#### עדכן `הודעות/src/queue/setup.ts`
הוסף queues חדשים:
```typescript
import { replyToReviewWorker } from './workers/replyToReview';
import { executeDiscountWorker } from './workers/executeDiscount';

// Add new workers:
// new Worker('review-replies', replyToReviewWorker, { connection: redisConnection });
// new Worker('discount-tasks', executeDiscountWorker, { connection: redisConnection });
```

### שלב 4: הרץ Migration

```bash
cd /home/claude/etsyauto-main/הודעות
# Connect to PostgreSQL and run migration
psql -U postgres -d etsy_messages -f src/db/migrations/002_reviews_discounts.sql
```

### שלב 5: התקן dependencies חדשים (אם חסרים)

```bash
cd /home/claude/etsyauto-main/הודעות
npm install
```

### שלב 6: Rebuild and restart

```bash
cd /home/claude/etsyauto-main/הודעות
npm run build
npm start
```
