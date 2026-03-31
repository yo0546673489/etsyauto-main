/**
 * Fixes discount schema:
 * 1. Renames discount_tasks → discount_jobs (old Node.js schema)
 * 2. Runs Python Alembic migration to create discount_rules + new discount_tasks
 * 3. Updates Node.js migration SQL to not create discount_tasks
 */
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      stream.on('data', d => { process.stdout.write(d); output += d.toString(); });
      stream.stderr.on('data', d => { process.stderr.write(d); output += d.toString(); });
      stream.on('close', () => resolve(output));
    });
    setTimeout(() => reject(new Error('Exec timeout')), timeoutMs);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));
  console.log('SSH connected\n');

  // Step 1: Rename discount_tasks → discount_jobs
  console.log('[1] Renaming discount_tasks → discount_jobs...');
  const r1 = await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      ALTER TABLE IF EXISTS discount_tasks RENAME TO discount_jobs;
      ALTER TABLE IF EXISTS discount_jobs RENAME CONSTRAINT discount_tasks_store_id_fkey TO discount_jobs_store_id_fkey;
    " 2>&1
  `);
  console.log('Result:', r1);

  // Step 2: Run Alembic migration to create discount_rules + new discount_tasks
  console.log('\n[2] Running Alembic migration...');
  const r2 = await sshExec(conn, 'docker exec etsy-api python -m alembic upgrade ec1e8d4b1e8e 2>&1', 60000);
  console.log('Alembic result:', r2);

  // Step 3: Verify tables
  console.log('\n[3] Verifying tables...');
  const r3 = await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'discount%'
      ORDER BY table_name;
    " 2>&1
  `);
  console.log('Tables:', r3);

  // Step 4: Show discount_tasks columns (new Python schema)
  const r4 = await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      SELECT column_name FROM information_schema.columns
      WHERE table_name='discount_tasks' ORDER BY ordinal_position;
    " 2>&1
  `);
  console.log('\ndiscount_tasks columns:', r4);

  conn.end();
  console.log('\nDone!');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
