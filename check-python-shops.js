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

  // Check shops table in etsy_platform
  console.log('=== shops table columns ===');
  console.log(await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name='shops' ORDER BY ordinal_position;" 2>&1
  `));

  // Sample shops data
  console.log('\n=== Sample shops ===');
  console.log(await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      SELECT id, name, etsy_shop_id, status FROM shops LIMIT 5;" 2>&1
  `));

  // Check etsy_messages.stores
  console.log('\n=== etsy_messages.stores ===');
  console.log(await sshExec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_messages -c "
      SELECT id, store_number, store_name, adspower_profile_id FROM stores LIMIT 5;" 2>&1
  `));

  conn.end();
}
main().catch(e => console.error(e.message));
