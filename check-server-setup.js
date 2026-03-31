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

  console.log('=== Running Docker containers ===');
  console.log(await sshExec(conn, 'docker ps --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"'));

  console.log('\n=== docker-compose.yml ===');
  console.log(await sshExec(conn, 'cat /opt/profitly/docker-compose.yml 2>/dev/null | head -80 || cat /opt/docker-compose.yml 2>/dev/null | head -80 || find /opt -name docker-compose.yml 2>/dev/null | head -3'));

  console.log('\n=== Check if discount_rules table exists on server ===');
  console.log(await sshExec(conn, "docker exec etsy-messages psql $DATABASE_URL -c \"\\dt discount*\" 2>/dev/null || echo 'no psql in container'"));

  conn.end();
}
main().catch(e => console.error(e.message));
