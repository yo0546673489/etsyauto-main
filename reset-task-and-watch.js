/**
 * מאפס task, מחכה לפולינג, ומציג לוגים
 */
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const path = require('path');
const fs = require('fs');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function exec(conn, cmd, t=15000) {
  return new Promise(r => {
    let o='';
    conn.exec(cmd,(e,s)=>{
      if(e){r('ERR:'+e.message);return;}
      s.on('data',d=>o+=d);
      s.stderr.on('data',d=>o+=d);
      s.on('close',()=>r(o));
    });
    setTimeout(()=>r('TIMEOUT'),t);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('[1] Connecting to DB server...');
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready',r).on('error',j).connect(SSH));

  // Reset task to pending
  console.log('[2] Resetting discount tasks to pending...');
  const resetResult = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    UPDATE discount_tasks
    SET status='pending', started_at=NULL, error_message=NULL, retry_count=0, scheduled_for=NOW()
    WHERE status IN ('failed','queued','running')
    AND rule_id IN (SELECT id FROM discount_rules WHERE is_active=true AND status!='deleted');
    SELECT id, status, scheduled_for, action FROM discount_tasks ORDER BY id DESC LIMIT 5;
  " 2>&1`);
  console.log(resetResult);

  conn.end();

  console.log('\n[3] Task reset! PM2 will poll in ~5 min');
  console.log('Watching PM2 logs for 8 minutes...\n');

  // Watch PM2 logs for 8 minutes
  const logFile = 'C:\\Users\\Administrator\\.pm2\\logs\\etsy-messages-out.log';
  const errFile = 'C:\\Users\\Administrator\\.pm2\\logs\\etsy-messages-error.log';

  let lastSize = fs.statSync(logFile).size;
  const startTime = Date.now();
  const maxTime = 8 * 60 * 1000; // 8 minutes

  while (Date.now() - startTime < maxTime) {
    await delay(3000);

    const currentSize = fs.statSync(logFile).size;
    if (currentSize > lastSize) {
      // Read new content
      const fd = fs.openSync(logFile, 'r');
      const newBytes = currentSize - lastSize;
      const buf = Buffer.alloc(newBytes);
      fs.readSync(fd, buf, 0, newBytes, lastSize);
      fs.closeSync(fd);
      const newContent = buf.toString('utf8');
      process.stdout.write(newContent);
      lastSize = currentSize;

      // Check for success or failure
      if (newContent.includes('Sale') && newContent.includes('created successfully')) {
        console.log('\n✅ SUCCESS! Sale created on Etsy!');
        break;
      }
      if (newContent.includes('Failed to create sale') || newContent.includes('Discount job failed')) {
        console.log('\n❌ FAILED! See errors above.');

        // Also show error log
        const errContent = fs.readFileSync(errFile, 'utf8');
        const errLines = errContent.split('\n').slice(-30).join('\n');
        console.log('\n--- ERROR LOG ---');
        console.log(errLines);
        break;
      }
    }
  }

  // Final DB status check
  console.log('\n[4] Final DB status:');
  const conn2 = new Client();
  await new Promise((r,j) => conn2.on('ready',r).on('error',j).connect(SSH));
  const status = await exec(conn2, `docker exec etsy-db psql -U postgres -d etsy_platform -c "SELECT id, status, error_message, completed_at FROM discount_tasks ORDER BY id DESC LIMIT 5;" 2>&1`);
  console.log(status);
  conn2.end();
}

main().catch(e => console.error('Error:', e.message));
