/**
 * Deploys updated etsyDiscountManager.ts to the server
 */
const { Client } = require('C:\\Users\\Administrator\\Desktop\\קלוד\\node_modules\\ssh2');
const fs = require('fs');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(conn, cmd, timeoutMs = 60000) {
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

async function deployFile(conn, localPath, remotePath, containerPath) {
  const content = fs.readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content, 'utf8').toString('base64');

  console.log(`\n[+] Writing ${remotePath}...`);
  // Write in chunks to avoid command line length limit
  const chunkSize = 50000;
  const chunks = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }

  // Write first chunk
  await sshExec(conn, `printf '%s' '${chunks[0]}' > /tmp/deploy_b64.tmp`);
  // Append rest
  for (let i = 1; i < chunks.length; i++) {
    await sshExec(conn, `printf '%s' '${chunks[i]}' >> /tmp/deploy_b64.tmp`);
  }
  // Decode
  const writeRes = await sshExec(conn, `base64 -d /tmp/deploy_b64.tmp > '${remotePath}' && echo "WRITE_OK"`);
  if (!writeRes.output.includes('WRITE_OK')) {
    throw new Error(`Write failed: ${writeRes.output}`);
  }
  console.log('  Host write OK');

  // Copy to container
  const cpRes = await sshExec(conn, `base64 -d /tmp/deploy_b64.tmp > /tmp/deploy_file.ts && docker cp /tmp/deploy_file.ts etsy-messages:${containerPath} && echo "CP_OK"`);
  if (cpRes.output.includes('CP_OK')) {
    console.log('  Container copy OK');
  } else {
    console.warn('  Container copy result:', cpRes.output);
  }
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));
  console.log('SSH connected\n');

  // Deploy etsyDiscountManager.ts
  await deployFile(
    conn,
    'C:\\etsy\\הודעות\\src\\browser\\etsyDiscountManager.ts',
    '/opt/profitly/הודעות/src/browser/etsyDiscountManager.ts',
    '/app/src/browser/etsyDiscountManager.ts'
  );

  // Restart container
  console.log('\n[+] Restarting etsy-messages...');
  const restart = await sshExec(conn, 'docker restart etsy-messages 2>&1', 60000);
  console.log('Restart:', restart.output.trim());

  // Wait for startup
  await new Promise(r => setTimeout(r, 5000));

  // Health check
  const health = await sshExec(conn, 'curl -s http://127.0.0.1:3500/api/health 2>/dev/null || echo "not up"');
  console.log('\nHealth check:', health.output.trim());

  // Check logs
  const logs = await sshExec(conn, 'docker logs --tail=20 etsy-messages 2>&1');
  console.log('\nLast logs:');
  console.log(logs.output);

  conn.end();
  console.log('\nDeploy done!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
