// Simple check: list all tabs in the browser
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('ws://127.0.0.1:52134/devtools/browser/a2c59fb1-dfd8-4426-b374-32547b0d3cdb', { timeout: 30000 });
  console.log('Connected!');
  const contexts = browser.contexts();
  console.log('Contexts:', contexts.length);
  for (const ctx of contexts) {
    const pages = ctx.pages();
    console.log('  Pages:', pages.length);
    for (const p of pages) {
      console.log('   -', p.url());
    }
  }
  await browser.close().catch(() => {});
}

main().catch(e => console.error('Error:', e.message));
