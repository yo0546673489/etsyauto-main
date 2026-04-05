const { chromium } = require('playwright');
const fs = require('fs');

async function captureTokens() {
  console.log('Connecting to CDP Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  
  console.log('Open pages:', pages.map(p => p.url()));
  
  let aluraToken = null;
  let erankHeaders = {};

  // Intercept ALL network requests
  context.on('request', req => {
    const url = req.url();
    const headers = req.headers();
    const auth = headers['authorization'];
    
    if (url.includes('alura.io') && auth) {
      aluraToken = auth;
      console.log('🔑 ALURA TOKEN:', auth.substring(0, 120));
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
    }
    if (url.includes('erank.com') && (headers['cookie'] || auth)) {
      const cookie = headers['cookie'] || '';
      if (cookie.length > 20) {
        erankHeaders = headers;
        console.log('🔑 ERANK COOKIE:', cookie.substring(0, 150));
        fs.writeFileSync('C:/Windows/Temp/erank_cookies.txt', cookie);
      }
    }
  });

  // Try to find Alura page and trigger keyword search
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) {
    aluraPage = await context.newPage();
    await aluraPage.goto('https://app.alura.io/app/keyword-finder', { waitUntil: 'domcontentloaded', timeout: 20000 });
  }
  
  console.log('Alura page:', aluraPage.url());
  
  // Trigger API call via fetch
  const tokenFromPage = await aluraPage.evaluate(async () => {
    // Try to intercept via XHR override
    const token = await fetch('/api/v3/keywords/ceramic-bowl?language=en&forceUpdate=false&tool=keyword-finder-new')
      .then(r => {
        // Get auth header if possible
        return r.headers.get('x-request-id') || 'no-id';
      }).catch(e => 'fetch-error: ' + e.message);
    
    // Check localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (v && (v.includes('eyJ') || v.includes('Bearer'))) {
        return { key: k, val: v.substring(0, 300) };
      }
    }
    return { fetchResult: token };
  });
  
  console.log('From page eval:', JSON.stringify(tokenFromPage));
  
  // Type in search box to trigger API call
  try {
    const input = aluraPage.locator('input').first();
    await input.click({ timeout: 5000 });
    await input.fill('ceramic vase');
    await aluraPage.keyboard.press('Enter');
    console.log('Searched for keyword...');
    await aluraPage.waitForTimeout(4000);
  } catch(e) {
    console.log('Could not type in search:', e.message.split('\n')[0]);
  }
  
  // Try eRank page
  let erankPage = pages.find(p => p.url().includes('erank.com'));
  if (erankPage) {
    console.log('eRank page found:', erankPage.url());
    try {
      // Trigger a keyword search on eRank
      const input = erankPage.locator('input[type="text"], input[type="search"]').first();
      await input.fill('ceramic bowl');
      await erankPage.keyboard.press('Enter');
      await erankPage.waitForTimeout(4000);
    } catch(e) {
      console.log('eRank search error:', e.message.split('\n')[0]);
    }
  }
  
  await aluraPage.waitForTimeout(3000);
  
  if (aluraToken) {
    console.log('\n✅ Alura token saved!');
  } else {
    console.log('\n⚠️ No Alura token yet - checking cookies...');
    const cookies = await context.cookies();
    const aluraCookies = cookies.filter(c => c.domain.includes('alura'));
    console.log('Alura cookies:', aluraCookies.map(c => c.name).join(', '));
  }
  
  await browser.close();
  console.log('Done!');
}

captureTokens().catch(e => console.error('Error:', e.message));
