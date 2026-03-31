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

  // How does the container start?
  const r1 = await sshExec(conn, "docker inspect etsy-messages --format '{{json .Config.Cmd}}' 2>/dev/null");
  console.log('CMD:', r1);

  const r2 = await sshExec(conn, "docker inspect etsy-messages --format '{{json .Config.Entrypoint}}' 2>/dev/null");
  console.log('ENTRYPOINT:', r2);

  // Check if there's a compiled JS
  const r3 = await sshExec(conn, "docker exec etsy-messages ls /app/dist/ 2>/dev/null | head -10 || echo 'no dist'");
  console.log('dist:', r3);

  const r4 = await sshExec(conn, "docker exec etsy-messages ls /app/ 2>/dev/null | head -20");
  console.log('/app/', r4);

  // Check the dockerfile or compose
  const r5 = await sshExec(conn, "cat /opt/profitly/הודעות/Dockerfile 2>/dev/null | head -30 || cat /opt/profitly/docker-compose.yml 2>/dev/null | grep -A 20 'messages'");
  console.log('Dockerfile/compose:', r5);

  conn.end();
}
main().catch(e => console.error(e.message));
