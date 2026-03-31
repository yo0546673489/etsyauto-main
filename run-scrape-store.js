const { spawn } = require('child_process');
const path = require('path');

const projectDir = 'C:\\etsy\\הודעות';
const storeNumber = process.argv[2] || '1';

console.log(`Scraping store ${storeNumber}...`);

const child = spawn(
  'cmd.exe',
  ['/c', 'tsx', `scripts\\scrape-store.ts`, storeNumber],
  {
    cwd: projectDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: 'C:\\Program Files\\nodejs;' + path.join(projectDir, 'node_modules', '.bin') + ';' + (process.env.PATH || '')
    }
  }
);

child.on('close', code => { process.exit(code || 0); });
child.on('error', err => { console.error(err.message); process.exit(1); });
