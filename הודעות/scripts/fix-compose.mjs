import { Client } from 'ssh2';

const HOST = '185.241.4.225';
const USER = 'root';
const PASS = 'aA@05466734890';

function runCmd(client, cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('TIMEOUT'), timeout);
    client.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ SSH connected');
  try {
    // Force re-scrape by clearing the cache (scraped_at = old date)
    console.log('\n🗑️  Clearing listing cache so next sync re-scrapes...');
    const clear = await runCmd(conn,
      `docker exec etsy-db psql -U postgres -d etsy_messages -c "UPDATE listing_previews SET scraped_at = '2000-01-01' WHERE listing_id = '4477110098';"`,
      15000
    );
    console.log(clear);

    // Check what's in the DB now
    const check = await runCmd(conn,
      `docker exec etsy-db psql -U postgres -d etsy_messages -c "SELECT listing_id, title, price, image_url FROM listing_previews;"`,
      15000
    );
    console.log('\n💾 Current DB:', check);

    console.log('\n✅ Cache cleared — run E2E test again to re-scrape with updated price selector');
    console.log('   The website will show the listing card with title+image (price pending re-scrape)');

  } catch(e) {
    console.error('❌', e.message);
  }
  conn.end();
}).connect({ host: HOST, port: 22, username: USER, password: PASS });
conn.on('error', err => { console.error('SSH error:', err.message); process.exit(1); });
