const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const fs = require('fs');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function exec(conn, cmd, t=30000) {
  return new Promise(r => { let o=''; conn.exec(cmd,(e,s)=>{ if(e){r('ERR');return;} s.on('data',d=>{process.stdout.write(d);o+=d}); s.stderr.on('data',d=>{process.stderr.write(d);o+=d}); s.on('close',()=>r(o)); }); setTimeout(()=>r('TIMEOUT'),t); });
}

async function deployFile(conn, localPath, containerPath) {
  const b64 = Buffer.from(fs.readFileSync(localPath,'utf8'),'utf8').toString('base64');
  const chunks = [];
  for(let i=0;i<b64.length;i+=50000) chunks.push(b64.slice(i,i+50000));
  await exec(conn,`printf '%s' '${chunks[0]}' > /tmp/d.tmp`);
  for(let i=1;i<chunks.length;i++) await exec(conn,`printf '%s' '${chunks[i]}' >> /tmp/d.tmp`);
  const r = await exec(conn,`base64 -d /tmp/d.tmp > /tmp/f && docker cp /tmp/f etsy-messages:${containerPath} && echo OK`);
  console.log(r.includes('OK') ? `✓ ${containerPath}` : `✗ ${r}`);
}

async function main() {
  const conn = new Client();
  await new Promise((r,j)=>conn.on('ready',r).on('error',j).connect(SSH));

  // Deploy controller.ts
  await deployFile(conn, 'C:\\etsy\\הודעות\\src\\adspower\\controller.ts', '/app/src/adspower/controller.ts');

  // TypeScript check
  console.log('\n[+] TypeScript check...');
  const tsc = await exec(conn, 'docker exec etsy-messages sh -c "cd /app && node_modules/.bin/tsc --noEmit 2>&1 | tail -5"', 60000);
  if(tsc.includes('error TS')) { console.error('TS errors:', tsc); process.exit(1); }
  console.log('✓ TypeScript OK');

  // Restart
  console.log('\n[+] Restarting...');
  await exec(conn, 'docker restart etsy-messages 2>&1', 30000);
  await new Promise(r=>setTimeout(r,8000));

  // Reset task
  console.log('\n[+] Resetting task...');
  const r = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    UPDATE discount_tasks SET status='pending', started_at=NULL, error_message=NULL, retry_count=0, scheduled_for=NOW()
    WHERE status IN ('failed','queued');
    SELECT id, status, scheduled_for FROM discount_tasks ORDER BY id DESC LIMIT 3;
  " 2>&1`);
  console.log(r);

  conn.end();
  console.log('\nממתין לפול (~5 דקות)...');
}
main().catch(e=>{ console.error(e.message); process.exit(1); });
