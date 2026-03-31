const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_name IN ('conversations','messages','stores')
  ORDER BY table_name, ordinal_position
`).then(r => {
  r.rows.forEach(row => console.log(`${row.table_name}.${row.column_name} (${row.data_type})`));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
