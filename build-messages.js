/**
 * Build script for etsy-messages (handles Hebrew path)
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const messagesDir = path.join('C:\\etsy', '\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA'); // הודעות
const tscCmd = path.join(messagesDir, 'node_modules', '.bin', 'tsc.cmd');
const tsconfig = path.join(messagesDir, 'tsconfig.json');

console.log('Building etsy-messages...');
console.log('Dir:', messagesDir);

// Run tsc build (not --noEmit, actually compile)
const result = spawnSync(tscCmd, [], {
  cwd: messagesDir,
  encoding: 'utf8',
  timeout: 120000,
  shell: false
});

if (result.error) {
  console.error('Spawn error:', result.error.message);
  process.exit(1);
}

if (result.stdout) console.log('stdout:', result.stdout.substring(0, 5000));
if (result.stderr) console.log('stderr:', result.stderr.substring(0, 5000));

if (result.status === 0) {
  console.log('\n✅ Build successful!');

  // Check dist output
  const distDir = path.join(messagesDir, 'dist');
  if (fs.existsSync(distDir)) {
    const distFiles = fs.readdirSync(distDir);
    console.log('Dist files:', distFiles);

    // Check etsyDiscountManager
    const discountFile = path.join(distDir, 'browser', 'etsyDiscountManager.js');
    if (fs.existsSync(discountFile)) {
      const content = fs.readFileSync(discountFile, 'utf8');
      if (content.includes('data-datepicker-input')) {
        console.log('✅ Selector fix confirmed in dist');
      } else if (content.includes('data-datepickerInput')) {
        console.log('❌ Old selector still in dist!');
      }
      if (content.includes('DD/MM/YYYY') || content.includes('${day}/${month}/${year}')) {
        console.log('✅ Date format fix confirmed');
      } else {
        // Check by looking for the toEtsyDate function
        const dateMatch = content.match(/function toEtsyDate[\s\S]{0,200}/);
        if (dateMatch) console.log('toEtsyDate:', dateMatch[0].substring(0, 100));
      }
    }
  }
} else {
  console.log('\n❌ Build failed! Exit:', result.status);
  process.exit(1);
}
