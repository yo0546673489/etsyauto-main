const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT m.id, m.sender_type, m.sender_name, LEFT(m.message_text,60) as text, m.image_urls,
         c.customer_name, s.store_number
  FROM messages m
  JOIN conversations c ON m.conversation_id = c.id
  JOIN stores s ON c.store_id = s.id
  WHERE s.store_number = 3
  ORDER BY m.id
`).then(r => {
  r.rows.forEach(row => {
    console.log(`[${row.store_number}] ${row.customer_name} | ${row.sender_type} | "${row.text}"`);
    if (row.image_urls && row.image_urls.length > 0) {
      console.log('  IMAGES:', row.image_urls);
    }
  });
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
