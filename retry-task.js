const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=10000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // בדיקת AdsPower
  console.log('=== AdsPower check ===');
  const ap = await exec(conn, 'curl -s --max-time 5 http://91.202.169.242:50325/api/v1/browser/list?page=1&page_size=1 2>&1');
  console.log(ap.substring(0, 200));

  // אפס task לממתין
  const r = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    UPDATE discount_tasks SET status='pending', started_at=NULL, error_message=NULL, retry_count=0, scheduled_for=NOW()
    WHERE id=2 AND status='failed';
    SELECT id, status, scheduled_for FROM discount_tasks WHERE id=2;
  " 2>&1`);
  console.log('\nTask reset:', r);

  conn.end();
  console.log('\nממתין לפול הבא (~5 דקות)...');
}
main().catch(e => console.error(e.message));
