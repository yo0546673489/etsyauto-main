const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT m.id, LEFT(m.message_text,40) as text, m.card_data, c.customer_name
  FROM messages m
  JOIN conversations c ON m.conversation_id = c.id
  JOIN stores s ON c.store_id = s.id
  WHERE s.store_number = 3
  ORDER BY m.id
`).then(r => {
  r.rows.forEach(row => {
    console.log(`[${row.id}] ${row.customer_name} | "${row.text}"`);
    if (row.card_data && Object.keys(row.card_data).length > 0) {
      console.log('  card_data:', JSON.stringify(row.card_data));
    }
  });
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
