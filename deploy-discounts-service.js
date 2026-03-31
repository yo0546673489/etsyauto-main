const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const fs = require('fs');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, t = 30000) {
  return new Promise((res) => {
    let o = '';
    conn.exec(cmd, (err, s) => {
      if (err) { res('ERROR: ' + err.message); return; }
      s.on('data', d => { process.stdout.write(d); o += d.toString(); });
      s.stderr.on('data', d => { process.stderr.write(d); o += d.toString(); });
      s.on('close', () => res(o));
    });
    setTimeout(() => res('TIMEOUT'), t);
  });
}

async function deployFile(conn, localPath, containerPath) {
  const content = fs.readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const chunkSize = 50000;
  const chunks = [];
  for (let i = 0; i < b64.length; i += chunkSize) chunks.push(b64.slice(i, i + chunkSize));

  await sshExec(conn, `printf '%s' '${chunks[0]}' > /tmp/deploy_b64.tmp`);
  for (let i = 1; i < chunks.length; i++) {
    await sshExec(conn, `printf '%s' '${chunks[i]}' >> /tmp/deploy_b64.tmp`);
  }
  const r = await sshExec(conn, `base64 -d /tmp/deploy_b64.tmp > /tmp/deploy_file && docker cp /tmp/deploy_file etsy-api:${containerPath} && echo "OK"`);
  console.log(r.includes('OK') ? `  ✓ ${containerPath}` : `  ✗ ${r}`);
}

async function main() {
  const conn = new Client();
  await new Promise((r, j) => conn.on('ready', r).on('error', j).connect(SSH));
  console.log('Connected\n');

  await deployFile(conn,
    'C:\\etsy\\apps\\api\\app\\services\\discounts_service.py',
    '/app/app/services/discounts_service.py'
  );

  // גם צריך ליצור task עבור ההנחה הקיימת (rule id=1 שכבר פעיל)
  console.log('\n[+] Creating immediate task for existing active rule...');
  const r = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    INSERT INTO discount_tasks (rule_id, shop_id, action, discount_value, scope, scheduled_for, status, created_at)
    SELECT id, shop_id, 'apply_discount', discount_value, scope, NOW(), 'pending', NOW()
    FROM discount_rules
    WHERE is_active = true AND status != 'deleted'
    AND id NOT IN (SELECT rule_id FROM discount_tasks WHERE status IN ('pending','queued','processing'))
    RETURNING id, rule_id, action, status;
  " 2>&1`);
  console.log(r);

  // Restart Python API
  console.log('[+] Restarting etsy-api...');
  await sshExec(conn, 'docker restart etsy-api 2>&1', 30000);
  await new Promise(r => setTimeout(r, 5000));

  // Check health
  const health = await sshExec(conn, 'curl -s http://127.0.0.1:8000/health 2>/dev/null || echo "checking..."');
  console.log('Health:', health.trim());

  // Verify task was created
  console.log('\n[+] Discount tasks now:');
  const tasks = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, rule_id, shop_id, action, status, scheduled_for FROM discount_tasks ORDER BY created_at DESC LIMIT 5;" 2>&1`);
  console.log(tasks);

  conn.end();
  console.log('Done!');
}
main().catch(e => { console.error(e.message); process.exit(1); });
