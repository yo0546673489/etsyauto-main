/**
 * Build and restart using Node.js child_process
 * Handles Hebrew paths via spawn with proper encoding
 */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Hebrew: הודעות (codepoints: 0x05D4 0x05D5 0x05D3 0x05E2 0x05D5 0x05EA)
const hebFolder = '\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA';
const messagesDir = path.join('C:', 'etsy', hebFolder);

console.log('Messages dir:', messagesDir);
console.log('Exists:', fs.existsSync(messagesDir));

// Check dist dir
const distDir = path.join(messagesDir, 'dist');
console.log('Dist exists:', fs.existsSync(distDir));

// Check source file
const srcFile = path.join(messagesDir, 'src', 'browser', 'etsyDiscountManager.ts');
console.log('Source exists:', fs.existsSync(srcFile));

// Check current dist file for old selector
const distFile = path.join(distDir, 'browser', 'etsyDiscountManager.js');
if (fs.existsSync(distFile)) {
  const content = fs.readFileSync(distFile, 'utf8');
  console.log('\nCurrent dist status:');
  console.log('  Has old selector (bug):', content.includes('data-datepickerInput'));
  console.log('  Has new selector (fixed):', content.includes('data-datepicker-input'));

  // Check date format
  const match = content.match(/return `\$\{[^}]+\}\/\$\{[^}]+\}\/\$\{[^}]+\}`/);
  if (match) console.log('  Date format:', match[0]);
}

// Build via PowerShell (PowerShell supports Unicode natively)
console.log('\nBuilding TypeScript...');

const buildScript = `
$env:Path = "C:\\Program Files\\nodejs;" + $env:Path;
$dir = "${messagesDir.replace(/\\/g, '\\\\')}";
Set-Location $dir;
& .\\node_modules\\.bin\\tsc.cmd;
exit $LASTEXITCODE
`.trim();

const psResult = spawnSync('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  buildScript
], {
  encoding: 'utf8',
  timeout: 120000
});

console.log('Build exit code:', psResult.status);
if (psResult.stdout) console.log('stdout:', psResult.stdout.substring(0, 3000));
if (psResult.stderr) console.log('stderr:', psResult.stderr.substring(0, 1000));
if (psResult.error) console.log('error:', psResult.error.message);

if (psResult.status !== 0) {
  console.error('Build failed!');
  process.exit(1);
}

// Verify the fix is in dist
if (fs.existsSync(distFile)) {
  const content = fs.readFileSync(distFile, 'utf8');
  console.log('\nPost-build dist status:');
  console.log('  Has old selector (bug):', content.includes('data-datepickerInput'));
  console.log('  Has new selector (fixed):', content.includes('data-datepicker-input'));

  const match = content.match(/return `\$\{[^}]+\}\/\$\{[^}]+\}\/\$\{[^}]+\}`/);
  if (match) console.log('  Date format:', match[0]);
}

// Restart PM2
console.log('\nRestarting PM2...');
const nodePath = 'C:\\Program Files\\nodejs\\node.exe';
const pm2Path = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\pm2\\bin\\pm2';

const pm2Result = spawnSync(nodePath, [pm2Path, 'restart', 'etsy-messages'], {
  encoding: 'utf8',
  timeout: 30000
});

console.log('PM2 restart exit:', pm2Result.status);
if (pm2Result.stdout) console.log(pm2Result.stdout.substring(0, 1000));
if (pm2Result.stderr) console.log(pm2Result.stderr.substring(0, 500));

console.log('\nDone!');
