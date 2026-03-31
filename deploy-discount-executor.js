/**
 * מפרס את כל הקבצים המעודכנים של מנגנון ביצוע הנחות:
 * - config/index.ts (הוספת PLATFORM_DATABASE_URL)
 * - executeDiscount.ts (תמיכה ב-platformTaskId)
 * - discountTaskExecutor.ts (חדש — ממשק ל-etsy_platform)
 * - index.ts (הפעלת DiscountTaskExecutor)
 * - .env (הוספת PLATFORM_DATABASE_URL)
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

async function deployFile(conn, localPath, containerPath) {
  const content = fs.readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const fileName = localPath.split('\\').pop();

  console.log(`\n[+] Deploying ${fileName}...`);

  const chunkSize = 50000;
  const chunks = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }

  await sshExec(conn, `printf '%s' '${chunks[0]}' > /tmp/deploy_b64.tmp`);
  for (let i = 1; i < chunks.length; i++) {
    await sshExec(conn, `printf '%s' '${chunks[i]}' >> /tmp/deploy_b64.tmp`);
  }

  const decodeRes = await sshExec(conn, `base64 -d /tmp/deploy_b64.tmp > /tmp/deploy_file && echo "DECODE_OK"`);
  if (!decodeRes.output.includes('DECODE_OK')) {
    throw new Error(`Decode failed: ${decodeRes.output}`);
  }

  const cpRes = await sshExec(conn, `docker cp /tmp/deploy_file etsy-messages:${containerPath} && echo "CP_OK"`);
  if (cpRes.output.includes('CP_OK')) {
    console.log(`  ✓ ${containerPath}`);
  } else {
    throw new Error(`docker cp failed: ${cpRes.output}`);
  }
}

async function main() {
  const conn = new Client();
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(SSH));
  console.log('SSH connected\n');

  // 1. config/index.ts
  await deployFile(
    conn,
    'C:\\etsy\\הודעות\\src\\config\\index.ts',
    '/app/src/config/index.ts'
  );

  // 2. executeDiscount.ts
  await deployFile(
    conn,
    'C:\\etsy\\הודעות\\src\\queue\\workers\\executeDiscount.ts',
    '/app/src/queue/workers/executeDiscount.ts'
  );

  // 3. discountTaskExecutor.ts (חדש)
  await deployFile(
    conn,
    'C:\\etsy\\הודעות\\src\\scheduler\\discountTaskExecutor.ts',
    '/app/src/scheduler/discountTaskExecutor.ts'
  );

  // 4. index.ts
  await deployFile(
    conn,
    'C:\\etsy\\הודעות\\src\\index.ts',
    '/app/src/index.ts'
  );

  // 5. עדכון .env בשרת — הוספת PLATFORM_DATABASE_URL
  console.log('\n[+] Updating .env on server...');
  const checkEnv = await sshExec(conn, `docker exec etsy-messages grep -c "PLATFORM_DATABASE_URL" /app/.env 2>/dev/null || echo "0"`);
  if (checkEnv.output.trim() === '0') {
    const addEnv = await sshExec(conn,
      `docker exec etsy-messages sh -c 'echo "PLATFORM_DATABASE_URL=postgresql://postgres:postgres_dev_password@etsy-db:5432/etsy_platform" >> /app/.env' && echo "ENV_OK"`
    );
    if (addEnv.output.includes('ENV_OK')) {
      console.log('  ✓ PLATFORM_DATABASE_URL added to .env');
    } else {
      console.warn('  ⚠ Could not update .env in container:', addEnv.output);
      // Try host-side .env
      const addEnv2 = await sshExec(conn,
        `grep -q "PLATFORM_DATABASE_URL" /opt/profitly/הודעות/.env 2>/dev/null || echo "PLATFORM_DATABASE_URL=postgresql://postgres:postgres_dev_password@etsy-db:5432/etsy_platform" >> /opt/profitly/הודעות/.env && echo "ENV2_OK"`
      );
      console.log('  Host .env result:', addEnv2.output.trim());
    }
  } else {
    console.log('  ✓ PLATFORM_DATABASE_URL already in .env');
  }

  // 6. Rebuild TypeScript in container
  console.log('\n[+] Building TypeScript in container...');
  const build = await sshExec(conn, 'docker exec etsy-messages sh -c "cd /app && npx tsc --noEmit 2>&1 | tail -20"', 120000);
  if (build.output.includes('error TS')) {
    console.error('TypeScript errors:\n', build.output);
    process.exit(1);
  } else {
    console.log('  ✓ TypeScript OK');
    if (build.output.trim()) console.log(build.output);
  }

  // 7. Restart container
  console.log('\n[+] Restarting etsy-messages...');
  const restart = await sshExec(conn, 'docker restart etsy-messages 2>&1', 60000);
  console.log('Restart:', restart.output.trim());

  // 8. Wait for startup
  console.log('\n[+] Waiting for startup...');
  await new Promise(r => setTimeout(r, 8000));

  // 9. Health check
  const health = await sshExec(conn, 'curl -s http://127.0.0.1:3500/api/health 2>/dev/null || echo "not up yet"');
  console.log('Health:', health.output.trim());

  // 10. Check logs
  const logs = await sshExec(conn, 'docker logs --tail=30 etsy-messages 2>&1');
  console.log('\n=== Last logs ===');
  console.log(logs.output);

  conn.end();
  console.log('\n✓ Deploy complete!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
