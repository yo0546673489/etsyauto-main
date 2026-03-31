const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, timeout = 20000) {
  return new Promise((resolve, reject) => {
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      stream.on('data', d => output += d.toString());
      stream.stderr.on('data', d => output += d.toString());
      stream.on('close', () => resolve(output));
    });
    setTimeout(() => reject(new Error('timeout')), timeout);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));

  const url = encodeURIComponent('https://www.etsy.com/listing/4477164374/antique-white-farmhouse-shoe-bench');

  // Test microlink raw
  const r1 = await sshExec(conn, `curl -s "https://api.microlink.io/?url=${url}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('STATUS:', d.get('status')); print('TITLE:', d.get('data',{}).get('title','')); print('IMAGE:', d.get('data',{}).get('image',{}))"`, 15000);
  console.log('Microlink:', r1);

  // Try opengraph.io (free, no key needed for basic)
  const r2 = await sshExec(conn, `curl -s "https://opengraph.io/api/1.1/site/${url}?app_id=sample_id" | python3 -c "import sys,json; d=json.load(sys.stdin); og=d.get('openGraph',{}); print('TITLE:', og.get('title','')); print('IMAGE:', og.get('image',{}).get('url',''))"`, 15000);
  console.log('OpenGraph.io:', r2);

  conn.end();
}
main().catch(e => console.error(e.message));
