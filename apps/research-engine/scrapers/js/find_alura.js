const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('alura.io')) || await context.newPage();

  // Set download path
  await context.route('**/*', route => route.continue());

  // Monitor all network requests to understand the app structure
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('alura') && !req.url().includes('static') && !req.url().includes('.js') && !req.url().includes('.css')) {
      requests.push({ method: req.method(), url: req.url() });
    }
  });

  // Navigate to the app - try different entry points
  const tryUrls = [
    'https://app.alura.io/research/keywords',
    'https://app.alura.io/research/products',
    'https://app.alura.io/research/shops',
    'https://app.alura.io/home',
    'https://app.alura.io/app',
    'https://app.alura.io/dashboard',
  ];

  for (const url of tryUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(3000);
      const finalUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
      const is404 = bodyText.toLowerCase().includes('not found') || bodyText.toLowerCase().includes('404');
      const isWelcome = bodyText.toLowerCase().includes('welcome') || bodyText.length < 50;
      console.log(`${url}\n  → ${finalUrl}\n  → ${is404 ? '404' : isWelcome ? 'welcome/empty' : '✅ ' + bodyText.replace(/\n/g,' ').substring(0,100)}\n`);

      if (!is404 && !isWelcome && finalUrl !== 'https://app.alura.io/') {
        // Found a real page!
        console.log('🎯 נמצא דף תוכן!');

        // Get all links from this page
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'))
            .map(a => ({ href: a.href, text: a.innerText.trim().substring(0,50) }))
            .filter(l => l.href.includes('alura') && l.text)
        );
        console.log('Links:', links.map(l => `${l.href} (${l.text})`).join('\n'));

        // Get page text
        const fullText = await page.evaluate(() => document.body.innerText);
        console.log('\nPage text (500 chars):', fullText.substring(0, 500));

        // Save HTML
        const html = await page.content();
        fs.writeFileSync('C:\\Windows\\Temp\\alura_found.html', html.substring(0, 100000), 'utf8');
        console.log('HTML saved');
        break;
      }
    } catch(e) {
      console.log(url, '→ error:', e.message.substring(0,50));
    }
  }

  // Log all captured network requests
  console.log('\n=== NETWORK REQUESTS ===');
  requests.forEach(r => console.log(r.method, r.url));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
