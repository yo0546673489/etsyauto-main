const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const fs = require('fs');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let output = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      stream.on('data', d => { process.stdout.write(d); output += d.toString(); });
      stream.stderr.on('data', d => { process.stderr.write(d); output += d.toString(); });
      stream.on('close', code => resolve({ output, code }));
    });
    setTimeout(() => reject(new Error('Exec timeout')), timeoutMs);
  });
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));
  console.log('SSH connected\n');

  // Write server.ts to host path (Hebrew folder name)
  const content = fs.readFileSync('C:\\etsy\\הודעות\\src\\api\\server.ts', 'utf8');
  const b64 = Buffer.from(content, 'utf8').toString('base64');

  console.log('[1] Writing server.ts to host...');
  const writeResult = await sshExec(conn,
    `printf '%s' '${b64}' | base64 -d > '/opt/profitly/הודעות/src/api/server.ts' && echo "OK"`
  );
  if (!writeResult.output.includes('OK')) {
    console.error('Write failed:', writeResult.output);
    conn.end(); return;
  }
  console.log('Written OK\n');

  // Also copy directly into running container for immediate effect
  console.log('[2] Copying into container...');
  const cpResult = await sshExec(conn,
    `printf '%s' '${b64}' | base64 -d > /tmp/server_new.ts && docker cp /tmp/server_new.ts etsy-messages:/app/src/api/server.ts && echo "CP_OK"`
  );
  if (cpResult.output.includes('CP_OK')) {
    console.log('Container copy OK\n');
  } else {
    console.log('Container copy result:', cpResult.output);
  }

  console.log('[3] Restarting etsy-messages container...');
  const restart = await sshExec(conn, 'docker restart etsy-messages 2>&1');
  console.log('Restart:', restart.output.trim());

  // Wait and verify
  await new Promise(r => setTimeout(r, 4000));
  const verify = await sshExec(conn, "docker exec etsy-messages grep -c 'link-preview' /app/src/api/server.ts 2>/dev/null || echo '0'");
  console.log('\nVerify link-preview in container:', verify.output.trim());

  const health = await sshExec(conn, 'curl -s http://127.0.0.1:3500/api/health 2>/dev/null | head -1 || echo "not up"');
  console.log('Health check:', health.output.trim());

  conn.end();
  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
