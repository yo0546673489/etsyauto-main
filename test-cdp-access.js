const http = require('http');
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, { timeout: 8000 }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej).on('timeout', () => rej(new Error('timeout')));
  });
}
function exec(conn, cmd, t=10000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}

async function main() {
  console.log('[1] Opening profile...');
  const openData = await httpGet('http://127.0.0.1:50325/api/v1/browser/start?user_id=k16kmi55');
  const parsed = JSON.parse(openData);
  console.log('Result:', JSON.stringify(parsed));

  const wsUrl = parsed?.data?.ws?.puppeteer;
  if (!wsUrl) { console.error('No WS URL!'); process.exit(1); }

  const port = wsUrl.match(/:(\d+)\//)?.[1];
  console.log(`\n[2] CDP port: ${port}`);

  // בדוק אם netstat מראה את הפורט
  const { execSync } = require('child_process');
  const netstat = execSync(`netstat -an | findstr ${port}`).toString();
  console.log(`\n[3] Netstat:\n${netstat}`);

  await new Promise(r => setTimeout(r, 1000));

  // בדיקה מהשרת
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready',r).on('error',j).connect(SSH));

  console.log('\n[4] Testing from Ubuntu server:');
  const r1 = await exec(conn, `curl -s --max-time 5 "http://91.202.169.242:${port}/json/version" 2>&1`);
  console.log('result:', r1 || '(empty)');

  conn.end();

  httpGet(`http://127.0.0.1:50325/api/v1/browser/stop?user_id=k16kmi55`).catch(()=>{});
  console.log('\n[5] Done');
}
main().catch(e => console.error(e.message));
