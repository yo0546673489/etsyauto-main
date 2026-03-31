const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name").then(r => {
  console.log('Tables:');
  r.rows.forEach(row => console.log(' -', row.table_name));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
