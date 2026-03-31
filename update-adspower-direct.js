const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),15000); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // עדכון ישיר לפי id (id=1..4 תואמים בין שתי הטבלאות)
  const sql = `
    UPDATE shops SET adspower_profile_id = 'k16kmi55' WHERE id = 1;
    UPDATE shops SET adspower_profile_id = 'k16kmia3' WHERE id = 2;
    UPDATE shops SET adspower_profile_id = 'k16kmigb' WHERE id = 3;
    UPDATE shops SET adspower_profile_id = 'k16kmin5' WHERE id = 4;
  `;
  const r1 = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "${sql}" 2>&1`);
  console.log('Update result:', r1);

  // בדיקה
  const r2 = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, display_name, adspower_profile_id FROM shops ORDER BY id;" 2>&1`);
  console.log('Shops:', r2);

  // עכשיו נאפס את ה-task הכושל ונחזיר אותו ל-pending
  const r3 = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    UPDATE discount_tasks SET status='pending', started_at=NULL, error_message=NULL, retry_count=0
    WHERE id=2;
    SELECT id, status, scheduled_for FROM discount_tasks WHERE id=2;
  " 2>&1`);
  console.log('\nTask reset:', r3);

  conn.end();
  console.log('\nDone! Task will be picked up in the next poll (up to 5 min)');
}
main().catch(e => console.error(e.message));
