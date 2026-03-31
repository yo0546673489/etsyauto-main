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
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));

  // Find the messages service
  const r1 = await sshExec(conn, 'find /opt/profitly -name "server.ts" 2>/dev/null | head -20');
  console.log('server.ts files:', r1);

  const r2 = await sshExec(conn, 'docker ps --format "{{.Names}}" 2>/dev/null');
  console.log('containers:', r2);

  const r3 = await sshExec(conn, 'docker exec etsy-messages find / -name "server.ts" 2>/dev/null | head -5 || echo "no messages container"');
  console.log('in messages container:', r3);

  const r4 = await sshExec(conn, 'ls /opt/profitly/apps/ 2>/dev/null || ls /opt/profitly/ 2>/dev/null');
  console.log('apps:', r4);

  conn.end();
}
main().catch(e => console.error(e.message));
