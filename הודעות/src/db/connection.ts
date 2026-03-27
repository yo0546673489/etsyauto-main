import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({ connectionString: config.db.url });

export async function connectDb(): Promise<void> {
  await pool.query('SELECT 1');
}
