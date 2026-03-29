import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { StoreResolver } from '../stores/resolver';
import { logger } from '../utils/logger';

/**
 * Scheduler שרץ פעם ביום (או כל 12 שעות)
 * בודק אם יש discount schedules פעילים,
 * ויוצר tasks בהתאם ליום הנוכחי
 */
export class DiscountRotationScheduler {
  private pool: Pool;
  private queue: Queue;
  private resolver: StoreResolver;
  private intervalId?: NodeJS.Timeout;

  constructor(pool: Pool, queue: Queue, resolver: StoreResolver) {
    this.pool = pool;
    this.queue = queue;
    this.resolver = resolver;
  }

  start(intervalMs: number = 12 * 60 * 60 * 1000): void {
    logger.info('Discount rotation scheduler started');
    // הרצה ראשונית
    this.checkAndCreateTasks().catch(e => logger.error('Rotation check failed', e));
    // ואז כל intervalMs
    this.intervalId = setInterval(() => {
      this.checkAndCreateTasks().catch(e => logger.error('Rotation check failed', e));
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async checkAndCreateTasks(): Promise<void> {
    const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday, ...
    logger.info(`Checking discount rotations for day ${dayOfWeek}`);

    const schedules = await this.pool.query(
      'SELECT * FROM discount_schedules WHERE is_active = true'
    );

    for (const schedule of schedules.rows) {
      const rotationConfig = schedule.rotation_config;
      const todayConfig = rotationConfig[dayOfWeek.toString()];

      if (!todayConfig) {
        logger.debug(`No rotation for store ${schedule.store_id} on day ${dayOfWeek}`);
        continue;
      }

      // בדיקה אם כבר יצרנו task היום
      const existingTask = await this.pool.query(
        `SELECT id FROM discount_tasks
         WHERE store_id = $1 AND sale_name = $2
         AND created_at > NOW() - INTERVAL '20 hours'`,
        [schedule.store_id, todayConfig.saleName]
      );

      if (existingTask.rows.length > 0) {
        logger.debug(`Task already exists for ${todayConfig.saleName} today`);
        continue;
      }

      const store = await this.resolver.resolveById(schedule.store_id);
      if (!store) continue;

      // חישוב תאריכים: היום + מחר (או עד שיום הבא ברוטציה)
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // יצירת task
      const result = await this.pool.query(
        `INSERT INTO discount_tasks
          (store_id, task_type, sale_name, discount_percent, target_scope,
           listing_ids, target_country, terms_text, start_date, end_date, status)
         VALUES ($1, 'create_sale', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
         RETURNING id`,
        [
          schedule.store_id, todayConfig.saleName, todayConfig.percent,
          schedule.target_scope, schedule.listing_ids || [],
          schedule.target_country, schedule.terms_text,
          startDate, endDate,
        ]
      );

      const taskId = result.rows[0].id;

      await this.queue.add('execute', {
        taskId,
        storeId: schedule.store_id,
        serialNumber: store.adspower_profile_id,
        taskType: 'create_sale',
        saleConfig: {
          saleName: todayConfig.saleName,
          discountPercent: todayConfig.percent,
          startDate,
          endDate,
          targetCountry: schedule.target_country || 'Everywhere',
          termsText: schedule.terms_text,
          targetScope: schedule.target_scope || 'whole_shop',
          listingIds: schedule.listing_ids,
        },
      });

      logger.info(`Created rotation task: ${todayConfig.saleName} (${todayConfig.percent}%) for store ${schedule.store_id}`);
    }
  }
}
