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

  // כללי הנחה שנוצרו
  console.log('=== discount_rules ===');
  const r1 = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, shop_id, name, discount_value, status, is_active, is_scheduled, schedule_type, start_date, end_date FROM discount_rules ORDER BY created_at DESC LIMIT 5;" 2>&1`);
  console.log(r1);

  // משימות שנוצרו
  console.log('=== discount_tasks ===');
  const r2 = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, rule_id, shop_id, action, status, scheduled_for FROM discount_tasks ORDER BY created_at DESC LIMIT 5;" 2>&1`);
  console.log(r2);

  // לוגים של etsy-messages
  console.log('=== etsy-messages logs (last 20) ===');
  const r3 = await sshExec(conn, `docker logs --tail=20 etsy-messages 2>&1`);
  console.log(r3);

  conn.end();
}
main().catch(e => console.error(e.message));
