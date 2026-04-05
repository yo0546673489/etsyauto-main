const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeAlura() {
  console.log('🔗 מתחבר...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('alura.io')) || await context.newPage();

  // Try the dashboard
  await page.goto('https://app.alura.io/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(4000);
  console.log('URL:', page.url());

  const text1 = await page.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('Dashboard text:', text1);

  // Get all links after full load
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ href: a.href, text: a.innerText.trim().substring(0,60) }))
      .filter(l => l.text || l.href.includes('alura'))
      .slice(0, 50)
  );
  console.log('\nAll links:');
  links.forEach(l => console.log(` ${l.href} | ${l.text}`));

  // Try to find nav items
  const navText = await page.evaluate(() => {
    const nav = document.querySelector('nav, aside, [class*="sidebar"], [class*="nav"], [class*="menu"]');
    return nav ? nav.innerText : 'no nav';
  });
  console.log('\nNav:', navText.substring(0, 500));

  // Try URLs that Alura actually uses
  const urlsToTry = [
    'https://app.alura.io/research',
    'https://app.alura.io/keyword',
    'https://app.alura.io/tools',
    'https://app.alura.io/explore',
    'https://app.alura.io/products',
    'https://app.alura.io/shops',
  ];

  for (const url of urlsToTry) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(1500);
      const finalUrl = page.url();
      const title = await page.title().catch(()=>'');
      const txt = await page.evaluate(() => document.body.innerText.substring(0,200));
      const is404 = txt.toLowerCase().includes('not found') || txt.toLowerCase().includes('404');
      console.log(`${url} → ${finalUrl} | ${title} | ${is404 ? '404' : txt.substring(0,100)}`);
    } catch(e) {
      console.log(url, '→ error');
    }
  }

  await browser.close();
}

scrapeAlura().catch(e => console.error('Error:', e.message));
