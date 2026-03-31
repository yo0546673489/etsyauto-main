const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd, t=10000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR:'+e.message);return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  console.log('=== AdsPower status (from server) ===');
  console.log(await exec(conn, 'curl -s --max-time 5 http://91.202.169.242:50325/status 2>&1 || echo "FAILED"'));

  console.log('\n=== Port check ===');
  console.log(await exec(conn, 'nc -zv 91.202.169.242 50325 2>&1 || echo "PORT CLOSED"'));

  console.log('\n=== From Docker container ===');
  console.log(await exec(conn, 'docker exec etsy-messages sh -c "curl -s --max-time 5 http://91.202.169.242:50325/status 2>&1 || echo FAILED"'));

  conn.end();
}
main().catch(e => console.error(e.message));
