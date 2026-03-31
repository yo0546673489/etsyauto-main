const path = require('path');
const dotenv = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join('C:\\etsy\\הודעות', '.env') });
const { Pool } = require(path.join('C:\\etsy\\הודעות', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name IN ('conversations','messages')
  AND tc.constraint_type IN ('UNIQUE','PRIMARY KEY')
  ORDER BY tc.table_name, tc.constraint_name
`).then(r => {
  r.rows.forEach(row => console.log(`${row.table_name}.${row.constraint_name} (${row.constraint_type}): ${row.column_name}`));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
