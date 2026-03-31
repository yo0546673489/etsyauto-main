const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT s.id, s.store_number, s.store_name, s.adspower_profile_id,
         COUNT(c.id) as conv_count
  FROM stores s
  LEFT JOIN conversations c ON c.store_id = s.id
  GROUP BY s.id
  ORDER BY s.store_number
`).then(r => {
  r.rows.forEach(row => {
    console.log(`Store ${row.store_number}: ${row.store_name} | profile=${row.adspower_profile_id} | convs=${row.conv_count}`);
  });
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
