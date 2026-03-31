const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const r = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE 'discount%'
    ORDER BY table_name
  `);
  console.log('Discount tables:');
  r.rows.forEach(row => console.log(' -', row.table_name));

  // Check discount_jobs schema
  const r2 = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='discount_jobs' ORDER BY ordinal_position
  `);
  if (r2.rows.length > 0) {
    console.log('\ndiscount_jobs columns:', r2.rows.map(r => r.column_name).join(', '));
  } else {
    console.log('\ndiscount_jobs does NOT exist');
  }

  pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
