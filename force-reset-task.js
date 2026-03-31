/**
 * Force reset task to pending regardless of status
 */
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function exec(conn, cmd, t=15000) {
  return new Promise(r => {
    let o=''; conn.exec(cmd,(e,s)=>{
      if(e){r('ERR:'+e.message);return;}
      s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d); s.on('close',()=>r(o));
    });
    setTimeout(()=>r('TIMEOUT'),t);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((r,j) => conn.on('ready',r).on('error',j).connect(SSH));

  // Force reset task regardless of status
  const result = await exec(conn, `docker exec etsy-db psql -U postgres -d etsy_platform -c "
    UPDATE discount_tasks
    SET status='pending', started_at=NULL, error_message=NULL, retry_count=0,
        completed_at=NULL, scheduled_for=NOW()
    WHERE rule_id IN (SELECT id FROM discount_rules WHERE is_active=true AND status!='deleted');
    SELECT id, status, scheduled_for, action FROM discount_tasks ORDER BY id DESC LIMIT 3;
  " 2>&1`);
  console.log(result);

  conn.end();
  console.log('Reset done!');
}

main().catch(e => console.error(e.message));
