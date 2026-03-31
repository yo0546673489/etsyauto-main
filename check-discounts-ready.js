const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, t = 15000) {
  return new Promise((res) => {
    let o = '';
    conn.exec(cmd, (err, s) => {
      if (err) { res('ERROR: ' + err.message); return; }
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

  // 1. בדיקה שהטבלה קיימת
  const r1 = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT COUNT(*) FROM discount_rules;" 2>&1`);
  console.log('discount_rules table:', r1.trim());

  // 2. בדיקה ש-API עונה
  const r2 = await sshExec(conn, `curl -s http://127.0.0.1:8000/api/discounts/rules?shop_id=1 2>&1 | head -c 200`);
  console.log('\nAPI /api/discounts/rules:', r2.trim());

  // 3. בדיקה שה-Python container רץ
  const r3 = await sshExec(conn, `docker ps --format "{{.Names}} {{.Status}}" | grep etsy`);
  console.log('\nContainers:', r3.trim());

  conn.end();
}
main().catch(e => console.error(e.message));
