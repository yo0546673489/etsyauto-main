const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, t = 30000) {
  return new Promise((res, rej) => {
    let o = '';
    conn.exec(cmd, (err, s) => {
      if (err) { rej(err); return; }
      s.on('data', d => o += d.toString());
      s.stderr.on('data', d => o += d.toString());
      s.on('close', () => res(o));
    });
    setTimeout(() => res('TIMEOUT'), t);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((r, j) => conn.on('ready', r).on('error', j).connect(SSH));
  console.log('Connected\n');

  // הצגת .env הנוכחי
  const r1 = await sshExec(conn, 'docker exec etsy-messages cat /app/.env 2>&1');
  console.log('Current .env:\n', r1);

  if (r1.includes('PLATFORM_DATABASE_URL')) {
    console.log('Already has PLATFORM_DATABASE_URL — no change needed');
  } else {
    // הוספת PLATFORM_DATABASE_URL
    const url = 'postgresql://postgres:postgres_dev_password@etsy-db:5432/etsy_platform';
    const r2 = await sshExec(conn,
      `docker exec etsy-messages sh -c 'echo "PLATFORM_DATABASE_URL=${url}" >> /app/.env && echo "ADDED"'`
    );
    console.log('Add result:', r2);

    // Verify
    const r3 = await sshExec(conn, 'docker exec etsy-messages grep PLATFORM_DATABASE_URL /app/.env');
    console.log('Verify:', r3);
  }

  // Restart
  console.log('\nRestarting...');
  const r4 = await sshExec(conn, 'docker restart etsy-messages 2>&1', 60000);
  console.log(r4.trim());

  await new Promise(r => setTimeout(r, 8000));

  // Check logs
  const logs = await sshExec(conn, 'docker logs --tail=25 etsy-messages 2>&1');
  console.log('\n=== Logs ===\n', logs);

  conn.end();
  console.log('Done!');
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
