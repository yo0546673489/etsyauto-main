const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=10000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // מצב נוכחי
  console.log('=== Task status ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, status, error_message FROM discount_tasks ORDER BY id DESC LIMIT 3;" 2>&1`));

  // אפס כל task שנכשל
  console.log('=== Resetting failed tasks ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    UPDATE discount_tasks SET status='pending', started_at=NULL, error_message=NULL, retry_count=0, scheduled_for=NOW()
    WHERE status IN ('failed', 'queued') AND rule_id IN (SELECT id FROM discount_rules WHERE is_active=true AND status!='deleted');
    SELECT id, status, scheduled_for FROM discount_tasks ORDER BY id DESC LIMIT 3;
  " 2>&1`));

  conn.end();
  console.log('\nממתין לפול הבא של DiscountTaskExecutor (~5 דקות)...');
}
main().catch(e => console.error(e.message));
