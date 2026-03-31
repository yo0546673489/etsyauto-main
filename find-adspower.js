const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=10000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // אולי AdsPower על אותו שרת?
  console.log('=== Port 50325 on localhost ===');
  console.log(await exec(conn, 'curl -s --max-time 3 http://127.0.0.1:50325/api/v1/browser/list?page=1&page_size=1 2>&1 || echo "not here"'));

  // אולי ב-Docker?
  console.log('\n=== Docker containers ===');
  console.log(await exec(conn, 'docker ps --format "{{.Names}} {{.Ports}}" 2>&1'));

  // בדיקת כל ה-IPs שנגישים
  console.log('\n=== Network interfaces ===');
  console.log(await exec(conn, 'ip addr show | grep "inet " 2>&1'));

  conn.end();
}
main().catch(e => console.error(e.message));
