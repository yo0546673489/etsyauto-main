const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const fs = require('fs');
const path = require('path');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, timeoutMs = 120000) {
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

function writeFile(conn, localPath, remotePath) {
  const content = fs.readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  return sshExec(conn, `printf '%s' '${b64}' | base64 -d > ${remotePath} && echo "OK"`);
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));
  console.log('SSH connected\n');

  const files = [
    // Frontend files
    {
      local: 'C:\\etsy\\apps\\web\\components\\messages\\MsgBubble.tsx',
      remote: '/opt/profitly/apps/web/components/messages/MsgBubble.tsx',
      name: 'MsgBubble.tsx'
    },
    // Backend server
    {
      local: 'C:\\etsy\\הודעות\\src\\api\\server.ts',
      remote: '/opt/profitly/apps/messages/src/api/server.ts',
      name: 'messages server.ts'
    },
  ];

  console.log('[1] Writing files...');
  for (const f of files) {
    const result = await writeFile(conn, f.local, f.remote);
    if (result.output.includes('OK')) {
      console.log(`  ✓ ${f.name}`);
    } else {
      console.error(`  ✗ ${f.name} FAILED:`, result.output);
    }
  }

  // Rebuild messages backend
  console.log('\n[2] Restarting messages backend...');
  const restart = await sshExec(conn,
    'cd /opt/profitly && docker compose restart messages 2>&1 | tail -10',
    60000
  );
  console.log('Messages restart:', restart.output.trim());

  // Rebuild frontend
  console.log('\n[3] Rebuilding frontend Docker image (~2-3 min)...');
  const build = await sshExec(conn,
    'cd /opt/profitly && docker compose build web 2>&1 | tail -15',
    300000
  );
  console.log('Build code:', build.code);

  console.log('\n[4] Restarting frontend container...');
  await sshExec(conn, 'docker stop etsy-web 2>/dev/null || true');
  await sshExec(conn, 'docker rm etsy-web 2>/dev/null || true');
  const up = await sshExec(conn, 'cd /opt/profitly && docker compose up -d --no-deps web 2>&1');
  console.log('Up:', up.output.substring(0, 150));

  // Verify
  await new Promise(r => setTimeout(r, 5000));
  const check = await sshExec(conn, "docker exec etsy-web grep -c 'EtsyCard' /app/components/messages/MsgBubble.tsx 2>/dev/null || echo '0'");
  console.log('\nVerify EtsyCard in container:', check.output.trim());

  conn.end();
  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
