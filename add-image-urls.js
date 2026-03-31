const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Add image_urls column if not exists
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}'`);
  console.log('image_urls column added (or already exists)');

  // Add card_data column for Etsy product cards
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS card_data JSONB DEFAULT '{}'`);
  console.log('card_data column added (or already exists)');

  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='messages' AND column_name IN ('image_urls','card_data')
    ORDER BY column_name
  `);
  console.log('Verified columns:', cols.rows.map(r => r.column_name).join(', '));
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
