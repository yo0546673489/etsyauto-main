const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('alura.io')) || pages[0];

  console.log('Page:', page.url());
  const buf = await page.screenshot({ path: 'C:/Windows/Temp/ss_now.png' });
  console.log('Done, size:', buf.length);
  await browser.close();
}

main().catch(e => console.error(e.message));
