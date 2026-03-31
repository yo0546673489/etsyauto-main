const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),15000); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // כל החנויות בשתי הטבלאות
  console.log('=== etsy_messages.stores ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_messages -c "SELECT id, store_number, store_name, adspower_profile_id FROM stores ORDER BY id;" 2>&1`));

  console.log('=== etsy_platform.shops ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, display_name, etsy_shop_id, adspower_profile_id FROM shops ORDER BY id;" 2>&1`));

  // עדכון: מעתיקים adspower_profile_id לפי שם החנות (display_name = store_name)
  console.log('\n=== Syncing adspower_profile_id ===');
  const syncResult = await exec(conn, `
    docker exec etsy-db psql -U postgres -d etsy_platform -c "
      UPDATE shops p
      SET adspower_profile_id = m.adspower_profile_id
      FROM dblink('dbname=etsy_messages user=postgres password=postgres_dev_password',
        'SELECT store_name, adspower_profile_id FROM stores WHERE adspower_profile_id IS NOT NULL AND adspower_profile_id != ''''
      ') AS m(store_name TEXT, adspower_profile_id TEXT)
      WHERE p.display_name = m.store_name
        AND (p.adspower_profile_id IS NULL OR p.adspower_profile_id = '');
    " 2>&1
  `);
  console.log(syncResult);

  conn.end();
}
main().catch(e => console.error(e.message));
