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

  // יצירת task מיידי לכל הכללים הפעילים שאין להם task ממתין
  const r = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    INSERT INTO discount_tasks (rule_id, shop_id, action, discount_value, scope, scheduled_for, status, retry_count, created_at)
    SELECT id, shop_id, 'apply_discount', discount_value, scope, NOW(), 'pending', 0, NOW()
    FROM discount_rules
    WHERE is_active = true AND status != 'deleted'
    AND id NOT IN (
      SELECT rule_id FROM discount_tasks
      WHERE status IN ('pending','queued','processing')
    )
    RETURNING id, rule_id, action, status, scheduled_for;
  " 2>&1`);
  console.log('Result:', r);

  // בדיקה
  const check = await sshExec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    SELECT dt.id, dt.rule_id, dr.name, dt.action, dt.status, dt.scheduled_for
    FROM discount_tasks dt
    JOIN discount_rules dr ON dr.id = dt.rule_id
    ORDER BY dt.created_at DESC LIMIT 5;
  " 2>&1`);
  console.log('\nTasks:', check);

  conn.end();
}
main().catch(e => console.error(e.message));
