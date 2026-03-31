const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Get store 3 id
  const s = await pool.query("SELECT id FROM stores WHERE store_number=3");
  const storeId = s.rows[0]?.id;
  if (!storeId) { console.error('Store 3 not found'); return; }

  // Delete messages for store 3 conversations
  const del1 = await pool.query(
    'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE store_id=$1)',
    [storeId]
  );
  console.log('Deleted messages:', del1.rowCount);

  // Delete conversations
  const del2 = await pool.query('DELETE FROM conversations WHERE store_id=$1', [storeId]);
  console.log('Deleted conversations:', del2.rowCount);

  await pool.end();
  console.log('Done - store 3 cleared for re-scraping');
}
main().catch(e => { console.error(e.message); process.exit(1); });
