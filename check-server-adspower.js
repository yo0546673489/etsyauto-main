const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      stream.on('data', d => output += d.toString());
      stream.stderr.on('data', d => output += d.toString());
      stream.on('close', () => resolve(output));
    });
    setTimeout(() => resolve('TIMEOUT'), 15000);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));

  // בדוק אם AdsPower נגיש מתוך ה-container
  console.log('=== AdsPower reachability from etsy-messages container ===');
  console.log(await sshExec(conn, 'docker exec etsy-messages curl -s --max-time 3 "http://local.adspower.net:50325/api/v1/browser/list?page=1&page_size=1" 2>&1 | head -5 || echo "FAILED"'));

  console.log('\n=== Check via host.docker.internal ===');
  console.log(await sshExec(conn, 'docker exec etsy-messages curl -s --max-time 3 "http://host.docker.internal:50325/api/v1/browser/list?page=1&page_size=1" 2>&1 | head -5 || echo "FAILED"'));

  // Get host IP from container
  console.log('\n=== host.docker.internal IP from container ===');
  console.log(await sshExec(conn, 'docker exec etsy-messages cat /etc/hosts 2>/dev/null | grep host.docker || echo "not in hosts"'));

  // Check ADSPOWER env var in container
  console.log('\n=== ADSPOWER_API_URL in messages container ===');
  console.log(await sshExec(conn, 'docker exec etsy-messages env | grep ADSPOWER || echo "not set"'));

  // Check docker-compose env for messages
  console.log('\n=== messages service env from compose ===');
  console.log(await sshExec(conn, "cat /opt/profitly/docker-compose.messages.yml 2>/dev/null | grep -A 20 'messages:' | head -30 || docker inspect etsy-messages --format '{{json .Config.Env}}' 2>/dev/null | tr ',' '\\n' | grep -i adspower"));

  conn.end();
}
main().catch(e => console.error(e.message));
