// Run tsx script using cmd.exe to properly execute the .cmd batch wrapper
const { spawn } = require('child_process');
const path = require('path');

const projectDir = 'C:\\etsy\\הודעות';
const scriptPath = path.join(projectDir, 'scripts', 'test-e2e.ts');

console.log('Starting E2E test...');

// Use cmd.exe to run tsx.cmd which properly sets up node execution
const child = spawn(
  'cmd.exe',
  ['/c', 'tsx', 'scripts\\test-e2e.ts'],
  {
    cwd: projectDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: 'C:\\Program Files\\nodejs;' + path.join(projectDir, 'node_modules', '.bin') + ';' + (process.env.PATH || '')
    }
  }
);

child.on('close', code => {
  console.log('E2E test exited with code:', code);
  process.exit(code || 0);
});

child.on('error', err => {
  console.error('Spawn error:', err.message);
  process.exit(1);
});
