const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=15000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // בדיקת /status
  console.log('=== /status ===');
  console.log(await exec(conn, 'curl -s --max-time 5 "http://91.202.169.242:50325/status" 2>&1'));

  // בדיקת browser/start
  console.log('\n=== /api/v1/browser/start (profile k16kmi55) ===');
  console.log(await exec(conn, 'curl -s --max-time 10 "http://91.202.169.242:50325/api/v1/browser/start?user_id=k16kmi55" 2>&1'));

  // לוגים של הworker
  console.log('\n=== etsy-messages recent logs ===');
  console.log(await exec(conn, 'docker logs --tail=15 --since=10m etsy-messages 2>&1'));

  conn.end();
}
main().catch(e => console.error(e.message));
