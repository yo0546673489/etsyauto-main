const { chromium } = require('playwright');
const fs = require('fs');

async function intercept() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  let aluraToken = null;

  // Deep request interception
  context.on('request', req => {
    const url = req.url();
    const headers = req.headers();
    const auth = headers['authorization'] || '';
    
    if (url.includes('alura.io') && auth.includes('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN:', auth.substring(0, 100));
    }
    if (url.includes('erank.com/api')) {
      console.log('📡 eRank API:', url.substring(0, 120));
      const relevantHeaders = {};
      ['authorization','x-xsrf-token','x-csrf-token','cookie'].forEach(h => {
        if (headers[h]) relevantHeaders[h] = headers[h].substring(0, 100);
      });
      console.log('   Headers:', JSON.stringify(relevantHeaders));
      fs.writeFileSync('C:/Windows/Temp/erank_api_headers.json', JSON.stringify({url, headers: relevantHeaders}, null, 2));
    }
  });

  // Find Alura page
  const aluraPage = pages.find(p => p.url().includes('alura.io')) || await context.newPage();
  
  // Go directly to keyword search and trigger it
  console.log('Going to Alura keyword finder...');
  await aluraPage.goto('https://app.alura.io/app/keyword-finder', { waitUntil: 'load', timeout: 30000 });
  await aluraPage.waitForTimeout(3000);
  
  console.log('Page URL:', aluraPage.url());
  
  // Use page.route to intercept at a deeper level
  await aluraPage.route('**/api/v3/keywords/**', route => {
    const req = route.request();
    const auth = req.headers()['authorization'];
    if (auth) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN via route:', auth.substring(0, 100));
    }
    route.continue();
  });
  
  // Try to interact with the page
  const pageContent = await aluraPage.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Page content preview:', pageContent);
  
  // Try clicking on keyword research
  try {
    await aluraPage.click('text=Keyword research', { timeout: 5000 });
    await aluraPage.waitForTimeout(2000);
  } catch(e) {}
  
  // Try to find and click search input
  try {
    const searchInput = await aluraPage.waitForSelector('input[type="search"], input[placeholder*="keyword"], input[placeholder*="Keyword"], input[class*="search"]', { timeout: 8000 });
    await searchInput.fill('ceramic vase');
    await aluraPage.keyboard.press('Enter');
    console.log('Triggered Alura search...');
    await aluraPage.waitForTimeout(6000);
  } catch(e) {
    console.log('Search input not found:', e.message.split('\n')[0]);
    
    // Try direct fetch from page context
    const result = await aluraPage.evaluate(async () => {
      try {
        const resp = await fetch('/api/v3/keywords/ceramic-bowl?language=en&forceUpdate=false&tool=keyword-finder-new', {
          credentials: 'include'
        });
        const text = await resp.text();
        return { status: resp.status, body: text.substring(0, 300) };
      } catch(e) { return { error: e.message }; }
    });
    console.log('Direct API fetch result:', JSON.stringify(result));
  }
  
  // eRank - try to trigger keyword search
  const erankPage = pages.find(p => p.url().includes('erank.com'));
  if (erankPage) {
    console.log('\neRank page:', erankPage.url());
    
    // Direct fetch from eRank page context
    const erankResult = await erankPage.evaluate(async () => {
      try {
        // Try common eRank API endpoints
        const resp = await fetch('/api/v2/tool/keyword-explorer?keywords=ceramic+bowl&marketplace=etsy', {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        return { status: resp.status, url: resp.url, body: (await resp.text()).substring(0, 300) };
      } catch(e) { return { error: e.message }; }
    });
    console.log('eRank direct API:', JSON.stringify(erankResult));
    
    // Get XSRF token
    const xsrf = await erankPage.evaluate(() => {
      const meta = document.querySelector('meta[name="csrf-token"]');
      return meta ? meta.content : document.cookie.split(';').find(c=>c.includes('XSRF'))?.trim();
    });
    console.log('XSRF token:', xsrf?.substring(0, 50));
    if (xsrf) fs.writeFileSync('C:/Windows/Temp/erank_xsrf.txt', xsrf);
  }
  
  if (!aluraToken) {
    console.log('\n⚠️ Alura token not captured. Trying cookies approach...');
    const aluraCookies = await context.cookies(['https://app.alura.io']);
    const cookieStr = aluraCookies.map(c => `${c.name}=${c.value}`).join('; ');
    fs.writeFileSync('C:/Windows/Temp/alura_cookies.txt', cookieStr);
    console.log('Alura cookies saved:', aluraCookies.map(c=>c.name).join(', '));
  }
  
  await browser.close();
  console.log('\nDone!');
}

intercept().catch(e => console.error('Fatal:', e.message));
