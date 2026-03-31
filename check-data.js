const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const convs = await pool.query('SELECT id, customer_name, etsy_conversation_url, last_message_at FROM conversations WHERE store_id = 1 ORDER BY last_message_at DESC');
  console.log(`\n=== Conversations (${convs.rows.length}) ===`);
  for (const c of convs.rows) {
    const msgs = await pool.query('SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1', [c.id]);
    console.log(`  [${c.id}] ${c.customer_name} | ${msgs.rows[0].cnt} msgs | ${c.etsy_conversation_url}`);
  }

  const total = await pool.query('SELECT COUNT(*) as cnt FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.store_id = 1');
  console.log(`\nTotal messages: ${total.rows[0].cnt}`);

  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
