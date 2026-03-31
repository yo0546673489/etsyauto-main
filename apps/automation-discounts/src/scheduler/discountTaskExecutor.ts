/**
 * Discount Task Executor
 *
 * Polls etsy_platform DB for pending discount_tasks (Python schema).
 * When a task is due, fetches the discount_rule config + shop's adspower_profile_id,
 * then pushes to BullMQ for the executeDiscount worker.
 *
 * Runs every 5 minutes.
 */

import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { getNextDiscountPercent, generateSaleName } from '../api/discounts';

interface DiscountTask {
  id: number;
  rule_id: number;
  shop_id: number;
  action: 'apply_discount' | 'remove_discount';
  discount_value: number | null;
  scope: string;
  listing_ids: any[] | null;
  scheduled_for: Date;
  status: string;
}

interface DiscountRule {
  id: number;
  shop_id: number;
  name: string;
  discount_type: string;
  discount_value: number;
  scope: string;
  listing_ids: any[] | null;
  target_country: string | null;
  terms_text: string | null;
  etsy_sale_name: string | null;
  start_date: Date | null;
  end_date: Date | null;
  // auto-rotation fields
  auto_rotate: boolean;
  auto_min_percent: number;
  auto_max_percent: number;
  auto_interval_days: number;
  last_discount_percent: number | null;
  next_rotation_at: Date | null;
  is_active: boolean;
}

interface Shop {
  id: number;
  adspower_profile_id: string | null;
  etsy_shop_id: string | null;
  display_name: string | null;
}

export class DiscountTaskExecutor {
  private platformPool: Pool;     // etsy_platform DB (Python)
  private queue: Queue;
  private intervalId?: NodeJS.Timeout;
  private rotationIntervalId?: NodeJS.Timeout;

  constructor(platformDatabaseUrl: string, queue: Queue) {
    this.platformPool = new Pool({ connectionString: platformDatabaseUrl });
    this.queue = queue;
  }

  start(intervalMs: number = 5 * 60 * 1000): void {
    logger.info('Discount Task Executor started');
    this.checkAndEnqueue().catch(e => logger.error('Executor check failed', e));
    this.intervalId = setInterval(() => {
      this.checkAndEnqueue().catch(e => logger.error('Executor check failed', e));
    }, intervalMs);

    // בדיקת auto-rotation כל שעה
    this.checkAutoRotations().catch(e => logger.error('Auto-rotation check failed', e));
    this.rotationIntervalId = setInterval(() => {
      this.checkAutoRotations().catch(e => logger.error('Auto-rotation check failed', e));
    }, 60 * 60 * 1000);
    logger.info('Auto-rotation checker started (interval: 1 hour)');
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.rotationIntervalId) clearInterval(this.rotationIntervalId);
    this.platformPool.end().catch(() => {});
  }

  private async checkAutoRotations(): Promise<void> {
    const rulesResult = await this.platformPool.query<DiscountRule>(`
      SELECT dr.*, s.adspower_profile_id
      FROM discount_rules dr
      JOIN shops s ON s.id = dr.shop_id
      WHERE dr.auto_rotate = TRUE
        AND dr.is_active = TRUE
        AND (dr.next_rotation_at IS NULL OR dr.next_rotation_at <= NOW())
    `);

    if (rulesResult.rows.length === 0) {
      logger.debug('No auto-rotation rules due');
      return;
    }

    logger.info(`Found ${rulesResult.rows.length} auto-rotation rules due`);

    for (const rule of rulesResult.rows) {
      try {
        await this.triggerAutoRotation(rule);
      } catch (e: any) {
        logger.error(`Auto-rotation failed for rule ${rule.id}: ${e.message}`);
      }
    }
  }

  private async triggerAutoRotation(rule: DiscountRule & { adspower_profile_id?: string }): Promise<void> {
    const newPercent = getNextDiscountPercent(
      rule.auto_min_percent ?? 20,
      rule.auto_max_percent ?? 30,
      rule.last_discount_percent ?? null
    );
    const saleName = generateSaleName();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (rule.auto_interval_days ?? 2) * 24 * 60 * 60 * 1000);

    // עדכון rule
    await this.platformPool.query(
      `UPDATE discount_rules SET last_discount_percent = $1, next_rotation_at = $2 WHERE id = $3`,
      [newPercent, endDate.toISOString(), rule.id]
    );

    // צור discount_task
    const taskResult = await this.platformPool.query(
      `INSERT INTO discount_tasks
        (rule_id, shop_id, action, discount_value, scope, listing_ids, scheduled_for, status, started_at)
       VALUES ($1, $2, 'apply_discount', $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [
        rule.id, rule.shop_id, newPercent,
        rule.scope || 'entire_shop', rule.listing_ids || [],
        startDate.toISOString(), startDate.toISOString(),
      ]
    );
    const platformTaskId = taskResult.rows[0].id;

    const adsprofileId = (rule as any).adspower_profile_id;
    if (adsprofileId) {
      await this.queue.add('execute', {
        taskId: platformTaskId,
        storeId: rule.shop_id,
        serialNumber: adsprofileId,
        taskType: 'create_sale',
        platformTaskId,
        saleConfig: {
          saleName,
          discountPercent: newPercent,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          targetCountry: rule.target_country || 'Everywhere',
          termsText: rule.terms_text || undefined,
          targetScope: (rule.scope === 'specific_listings' ? 'specific_listings' : 'whole_shop') as 'whole_shop' | 'specific_listings',
          listingIds: rule.listing_ids?.map(String) || undefined,
        },
      });
      logger.info(`Auto-rotation triggered for rule ${rule.id}: ${newPercent}% sale "${saleName}", next at ${endDate.toISOString()}`);
    } else {
      logger.warn(`Rule ${rule.id} has no adspower_profile_id, skipping enqueue`);
    }
  }

  private async checkAndEnqueue(): Promise<void> {
    const tasksResult = await this.platformPool.query<DiscountTask>(`
      SELECT * FROM discount_tasks
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 10
    `);

    if (tasksResult.rows.length === 0) {
      logger.debug('No pending discount tasks');
      return;
    }

    logger.info(`Found ${tasksResult.rows.length} pending discount tasks`);

    for (const task of tasksResult.rows) {
      try {
        await this.processTask(task);
      } catch (e: any) {
        logger.error(`Failed to process task ${task.id}: ${e.message}`);
      }
    }
  }

  private async processTask(task: DiscountTask): Promise<void> {
    // Mark as 'queued' to avoid double-processing
    await this.platformPool.query(
      "UPDATE discount_tasks SET status = 'queued', started_at = NOW() WHERE id = $1 AND status = 'pending'",
      [task.id]
    );

    const check = await this.platformPool.query(
      "SELECT status FROM discount_tasks WHERE id = $1",
      [task.id]
    );
    if (check.rows[0]?.status !== 'queued') {
      logger.debug(`Task ${task.id} already processed by another instance, skipping`);
      return;
    }

    // Get the discount rule
    const ruleResult = await this.platformPool.query<DiscountRule>(
      "SELECT * FROM discount_rules WHERE id = $1",
      [task.rule_id]
    );
    const rule = ruleResult.rows[0];
    if (!rule) {
      logger.error(`Rule ${task.rule_id} not found for task ${task.id}`);
      await this.platformPool.query(
        "UPDATE discount_tasks SET status = 'failed', error_message = $1 WHERE id = $2",
        ['Rule not found', task.id]
      );
      return;
    }

    // Get the shop's adspower_profile_id
    const shopResult = await this.platformPool.query<Shop>(
      "SELECT id, adspower_profile_id, etsy_shop_id, display_name FROM shops WHERE id = $1",
      [task.shop_id]
    );
    const shop = shopResult.rows[0];
    if (!shop || !shop.adspower_profile_id) {
      logger.error(`Shop ${task.shop_id} has no adspower_profile_id`);
      await this.platformPool.query(
        "UPDATE discount_tasks SET status = 'failed', error_message = $1 WHERE id = $2",
        ['Shop has no AdsPower profile', task.id]
      );
      return;
    }

    logger.info(`Enqueuing task ${task.id} for shop ${shop.display_name || shop.etsy_shop_id} (profile: ${shop.adspower_profile_id})`);

    if (task.action === 'apply_discount') {
      const discountPercent = task.discount_value || rule.discount_value;
      const saleName = rule.etsy_sale_name || `SALE${Date.now()}`.substring(0, 20).toUpperCase();

      // Start date = tomorrow (Etsy UK timezone, avoid "date in the past" error)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const maxEndDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const endDate = rule.end_date
        ? (new Date(rule.end_date) > maxEndDate ? maxEndDate : new Date(rule.end_date))
        : maxEndDate;
      const endDateStr = endDate.toISOString().split('T')[0];

      await this.queue.add('execute', {
        taskId: task.id,
        storeId: task.shop_id,
        serialNumber: shop.adspower_profile_id,
        taskType: 'create_sale',
        platformTaskId: task.id,
        saleConfig: {
          saleName,
          discountPercent: Math.round(discountPercent),
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDateStr,
          targetCountry: rule.target_country || 'Everywhere',
          termsText: rule.terms_text || undefined,
          targetScope: (rule.scope === 'specific_listings' ? 'specific_listings' : 'whole_shop') as 'whole_shop' | 'specific_listings',
          listingIds: rule.listing_ids?.map(String) || undefined,
        },
      });

    } else if (task.action === 'remove_discount') {
      const saleName = rule.etsy_sale_name;
      if (!saleName) {
        logger.error(`Cannot end sale for task ${task.id}: no etsy_sale_name in rule`);
        await this.platformPool.query(
          "UPDATE discount_tasks SET status = 'failed', error_message = $1 WHERE id = $2",
          ['No etsy_sale_name configured', task.id]
        );
        return;
      }

      await this.queue.add('execute', {
        taskId: task.id,
        storeId: task.shop_id,
        serialNumber: shop.adspower_profile_id,
        taskType: 'end_sale',
        platformTaskId: task.id,
        saleName,
      });
    }

    logger.info(`Task ${task.id} (${task.action}) enqueued for shop ${task.shop_id}`);
  }
}
