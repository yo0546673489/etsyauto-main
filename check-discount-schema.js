const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Check discount_tasks columns
  const r1 = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'discount_tasks'
    ORDER BY ordinal_position
  `);
  console.log('=== discount_tasks columns ===');
  r1.rows.forEach(c => console.log(` ${c.column_name} | ${c.data_type} | nullable:${c.is_nullable}`));

  // Check discount_rules if exists
  const r2 = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'discount_rules' ORDER BY ordinal_position
  `);
  if (r2.rows.length > 0) {
    console.log('\n=== discount_rules columns ===');
    r2.rows.forEach(c => console.log(` ${c.column_name} | ${c.data_type}`));
  } else {
    console.log('\ndiscount_rules table does NOT exist in DB');
  }

  // Count tasks
  const r3 = await pool.query('SELECT COUNT(*) FROM discount_tasks');
  console.log(`\ndiscount_tasks rows: ${r3.rows[0].count}`);

  pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
