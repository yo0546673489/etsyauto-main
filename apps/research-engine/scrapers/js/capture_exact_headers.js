const { chromium } = require('playwright');
const fs = require('fs');

async function captureHeaders() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  
  let exactHeaders = null;
  
  // Capture the EXACT headers the browser sends
  context.on('request', req => {
    const url = req.url();
    if (url.includes('members.erank.com/api/keyword-tool/stats')) {
      exactHeaders = req.headers();
      console.log('EXACT eRank headers:', JSON.stringify(exactHeaders, null, 2));
      fs.writeFileSync('C:/Windows/Temp/erank_exact_headers.json', JSON.stringify(exactHeaders, null, 2));
    }
    if (url.includes('alura.io/api') && req.headers()['authorization']?.startsWith('Bearer')) {
      const auth = req.headers()['authorization'];
      console.log('ALURA TOKEN:', auth.substring(0,80));
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
    }
  });
  
  const pages = context.pages();
  const erankPage = pages.find(p => p.url().includes('erank.com')) || await context.newPage();
  
  if (!erankPage.url().includes('keyword-explorer')) {
    await erankPage.goto('https://members.erank.com/keyword-explorer', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await erankPage.waitForTimeout(3000);
  }
  
  // Trigger another search to capture exact headers
  try {
    const input = erankPage.locator('input[placeholder="Enter keyword"]');
    await input.fill('himalayan salt lamp');
    await input.press('Enter');
    await erankPage.waitForTimeout(5000);
  } catch(e) { console.log('Search err:', e.message.split('\n')[0]); }
  
  // Also make keyword call from within page
  const inPageResult = await erankPage.evaluate(async () => {
    const xsrf = document.cookie.split(';').find(c => c.trim().startsWith('XSRF-TOKEN='))?.split('=')[1]?.trim() || '';
    const resp = await fetch('/api/keyword-tool/stats?keyword=himalayan+salt+lamp&country=USA&marketplace=etsy', {
      credentials: 'include',
      headers: {
        'X-XSRF-TOKEN': decodeURIComponent(xsrf),
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    const data = await resp.json().catch(() => null);
    return { status: resp.status, data };
  });
  
  console.log('\neRank in-page fetch result:', JSON.stringify(inPageResult).substring(0, 500));
  
  // ALURA - try dashboard and make API call from page
  const aluraPage = pages.find(p => p.url().includes('alura.io')) || await context.newPage();
  
  const aluraInPage = await aluraPage.evaluate(async () => {
    // Try to call Alura API from within the page
    const resp = await fetch('/api/v3/keywords/ceramic-bowl?language=en&forceUpdate=false&tool=keyword-finder-new', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    const text = await resp.text();
    return { status: resp.status, body: text.substring(0, 300), url: window.location.href };
  });
  
  console.log('\nAlura in-page:', JSON.stringify(aluraInPage));
  
  await browser.close();
}

captureHeaders().catch(e => console.error(e.message.split('\n')[0]));
