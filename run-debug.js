// Debug: screenshot Etsy messages tab + show HTML structure
const { spawn } = require('child_process');
const path = require('path');

const projectDir = 'C:\\etsy\\הודעות';

const child = spawn(
  'cmd.exe',
  ['/c', 'tsx', 'scripts\\debug-messages-page.ts'],
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
