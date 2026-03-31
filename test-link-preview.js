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
    setTimeout(() => reject(new Error('timeout')), 20000);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));

  const url = encodeURIComponent('https://www.etsy.com/listing/4477164374/antique-white-farmhouse-shoe-bench');
  const r = await sshExec(conn, `curl -s "http://127.0.0.1:3500/api/link-preview?url=${url}"`);
  console.log('Link preview result:');
  try {
    const parsed = JSON.parse(r);
    console.log(JSON.stringify(parsed, null, 2));
  } catch(e) {
    console.log(r);
  }
  conn.end();
}
main().catch(e => console.error(e.message));
