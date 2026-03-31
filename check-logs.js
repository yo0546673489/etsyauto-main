const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd) {
  return new Promise(r => {
    let o = '';
    conn.exec(cmd, (e, s) => {
      if (e) { r('ERR'); return; }
      s.on('data', d => o += d);
      s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
    setTimeout(() => r('TIMEOUT'), 15000);
  });
}
async function main() {
  const conn = new Client();
  await new Promise((r, j) => conn.on('ready', r).on('error', j).connect(SSH));
  console.log('=== etsy-messages logs ===');
  console.log(await exec(conn, 'docker logs --tail=30 etsy-messages 2>&1'));
  console.log('=== task status ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, status, started_at, completed_at, error_message FROM discount_tasks ORDER BY id DESC LIMIT 3;" 2>&1`));
  conn.end();
}
main().catch(e => console.error(e.message));
