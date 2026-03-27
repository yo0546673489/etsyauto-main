import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface StoreInfo {
  id: number;
  store_number: number;
  store_name: string;
  store_email: string;
  adspower_profile_id: string;
  initial_sync_completed: boolean;
  status: string;
}

export class StoreResolver {
  private pool: Pool;
  private cache: Map<string, StoreInfo> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async loadAll(): Promise<void> {
    const result = await this.pool.query('SELECT * FROM stores WHERE status = $1', ['active']);
    this.cache.clear();
    for (const row of result.rows) {
      this.cache.set(row.store_email.toLowerCase(), row);
    }
    logger.info(`Loaded ${this.cache.size} stores into cache`);
  }

  async resolveByEmail(email: string): Promise<StoreInfo | null> {
    const normalized = email.toLowerCase().trim();
    if (this.cache.has(normalized)) return this.cache.get(normalized)!;
    const result = await this.pool.query(
      'SELECT * FROM stores WHERE LOWER(store_email) = $1 AND status = $2',
      [normalized, 'active']
    );
    if (result.rows.length > 0) {
      this.cache.set(normalized, result.rows[0]);
      return result.rows[0];
    }
    return null;
  }

  async resolveByNumber(storeNumber: number): Promise<StoreInfo | null> {
    const result = await this.pool.query('SELECT * FROM stores WHERE store_number = $1', [storeNumber]);
    return result.rows[0] || null;
  }

  async resolveById(storeId: number): Promise<StoreInfo | null> {
    const result = await this.pool.query('SELECT * FROM stores WHERE id = $1', [storeId]);
    return result.rows[0] || null;
  }
}
