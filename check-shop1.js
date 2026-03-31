const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };
function exec(conn, cmd) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),15000); });
}
async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // מה יש בחנות 1 ב-etsy_platform
  console.log('=== etsy_platform.shops (id=1) ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, name, etsy_shop_id, adspower_profile_id, status FROM shops WHERE id=1;" 2>&1`));

  // מה יש ב-etsy_messages.stores עבור חנות 1
  console.log('=== etsy_messages.stores (id=1) ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_messages -c "SELECT id, store_number, store_name, adspower_profile_id FROM stores WHERE id=1;" 2>&1`));

  // כל החנויות ב-etsy_platform עם adspower
  console.log('=== etsy_platform shops with adspower_profile_id ===');
  console.log(await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, name, adspower_profile_id FROM shops WHERE adspower_profile_id IS NOT NULL LIMIT 5;" 2>&1`));

  conn.end();
}
main().catch(e => console.error(e.message));
