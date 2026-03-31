const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=10000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  console.log('=== Test from Ubuntu server to AdsPower ===');
  const r = await exec(conn, 'curl -s --max-time 8 "http://91.202.169.242:50325/api/v1/browser/list?page=1&page_size=1" 2>&1');
  console.log(r || '(empty response)');

  conn.end();
}
main().catch(e => console.error(e.message));
