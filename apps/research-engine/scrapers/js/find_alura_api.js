/**
 * Find Alura keyword API endpoint by triggering search and capturing network
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) {
    aluraPage = await context.newPage();
    await aluraPage.goto('https://app.alura.io/research/keyword');
    await aluraPage.waitForTimeout(4000);
  }

  console.log('Page:', aluraPage.url());

  // Intercept all network requests to alura API
  const capturedRequests = [];
  aluraPage.on('request', req => {
    const url = req.url();
    if (url.includes('alura') && !url.includes('analytics') && !url.includes('facebook') && !url.includes('google')) {
      const headers = req.headers();
      capturedRequests.push({
        url,
        method: req.method(),
        auth: headers['authorization']?.substring(0, 80)
      });
    }
  });

  // Navigate to keyword research page
  await aluraPage.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => {});
  await aluraPage.waitForTimeout(2000);

  // Try triggering keyword search from JS using fetch with credentials
  console.log('\nTrying direct fetch from page context...');
  const fetchResult = await aluraPage.evaluate(async () => {
    // Try different API endpoint patterns
    const endpoints = [
      'https://alura-api-3yk57ena2a-uc.a.run.app/api/v3/keywords/wall%20art?language=en&forceUpdate=false&tool=keyword-finder-new',
      'https://alura.io/api/v3/keywords/wall%20art?language=en&forceUpdate=false',
      'https://app.alura.io/api/v3/keywords/wall%20art?language=en&forceUpdate=false'
    ];

    const results = [];
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        results.push({ url, status: resp.status, ok: resp.ok });
        if (resp.ok) {
          const data = await resp.json();
          results[results.length - 1].keys = Object.keys(data);
          results[results.length - 1].sample = JSON.stringify(data).substring(0, 300);
        }
      } catch(e) {
        results.push({ url, error: e.message.substring(0, 100) });
      }
    }
    return results;
  });
  console.log('Direct fetch results:', JSON.stringify(fetchResult, null, 2));

  // Try clicking the keyword search area using JS to navigate to the right panel
  console.log('\nLooking for keyword research section...');
  const pageState = await aluraPage.evaluate(() => {
    // Look for keyword-specific elements
    const keywordSection = document.querySelector('[id*="keyword"]') ||
                           document.querySelector('[class*="keyword"]');

    // Find all buttons with keyword-related text
    const buttons = Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .filter(el => el.textContent.toLowerCase().includes('keyword'))
      .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 50), href: el.href || '', id: el.id }));

    return { buttons, hasKeywordSection: !!keywordSection };
  });
  console.log('Keyword buttons/links:', JSON.stringify(pageState.buttons, null, 2));

  // Try clicking keyword research nav
  await aluraPage.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a')).find(a =>
      a.href?.includes('/research/keyword') || a.textContent.toLowerCase().includes('keyword research')
    );
    if (link) {
      console.log('Found keyword link:', link.href);
      link.click();
    }
  });
  await aluraPage.waitForTimeout(2000);

  // Check what's visible now and try to find/click the keyword input area
  const inputInfo = await aluraPage.evaluate(() => {
    // Look for any visible keyword input
    const allInputs = Array.from(document.querySelectorAll('input, textarea'));
    const visible = allInputs.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    // Find the keyword search trigger button or area
    const keywordElements = Array.from(document.querySelectorAll('[class*="keyword"], [id*="keyword"]'))
      .map(el => ({ tag: el.tagName, class: el.className?.substring(0,80), text: el.textContent?.substring(0, 50) }))
      .filter(el => el.text.trim().length > 0);

    return {
      visibleInputs: visible.map(i => ({ placeholder: i.placeholder, id: i.id })),
      keywordElements: keywordElements.slice(0, 10)
    };
  });
  console.log('\nVisible inputs:', JSON.stringify(inputInfo.visibleInputs, null, 2));
  console.log('\nKeyword elements:', JSON.stringify(inputInfo.keywordElements, null, 2));

  console.log('\nCaptured API requests:');
  capturedRequests.forEach(r => console.log(r.method, r.url));

  await browser.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
