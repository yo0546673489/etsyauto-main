const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=15000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // בדיקת IP הנוכחי של המחשב
  console.log('=== Server IP ===');
  console.log(await exec(conn, 'curl -s ifconfig.me 2>&1'));

  // ניסיון חיבור ל-AdsPower
  console.log('\n=== AdsPower connect test ===');
  console.log(await exec(conn, 'curl -v --max-time 8 http://91.202.169.242:50325/api/v1/browser/list?page=1&page_size=1 2>&1'));

  // מה ה-ADSPOWER_API_URL בקונטיינר
  console.log('\n=== ADSPOWER_API_URL in container ===');
  console.log(await exec(conn, 'docker exec etsy-messages env | grep ADSPOWER'));

  conn.end();
}
main().catch(e => console.error(e.message));
