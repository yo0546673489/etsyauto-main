const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios');

async function setup() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  
  let aluraToken = null;
  
  // Intercept Alura token
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'] || '';
    if (url.includes('alura.io/api') && auth.startsWith('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN:', auth.substring(0, 80));
    }
  });
  
  const pages = context.pages();
  
  // ===== ERANK: Test API from Node.js with saved cookies =====
  const erankCookies = await context.cookies(['https://members.erank.com', 'https://erank.com']);
  const cookieStr = erankCookies.map(c => `${c.name}=${c.value}`).join('; ');
  
  fs.writeFileSync('C:/Windows/Temp/erank_cookies_full.txt', cookieStr);
  
  const xsrfToken = erankCookies.find(c => c.name === 'XSRF-TOKEN')?.value || '';
  const decodedXsrf = decodeURIComponent(xsrfToken);
  
  console.log('Testing eRank API from Node.js...');
  try {
    const resp = await axios.get('https://members.erank.com/api/keyword-tool/stats', {
      params: { keyword: 'ceramic bowl', country: 'USA', marketplace: 'etsy' },
      headers: {
        'Cookie': cookieStr,
        'X-XSRF-TOKEN': decodedXsrf,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://members.erank.com/keyword-explorer',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    console.log('✅ eRank stats API works! Status:', resp.status);
    console.log('Data:', JSON.stringify(resp.data).substring(0, 400));
    fs.writeFileSync('C:/Windows/Temp/erank_auth.json', JSON.stringify({ cookies: cookieStr, xsrf: decodedXsrf }));
  } catch(e) {
    console.log('❌ eRank from Node.js failed:', e.response?.status, e.message.substring(0, 100));
  }
  
  // ===== ALURA: Try navigating via SPA routing =====
  let aluraPage = pages.find(p => p.url().includes('alura.io')) || await context.newPage();
  
  // Navigate to dashboard first via SPA
  await aluraPage.goto('https://app.alura.io/dashboard', { waitUntil: 'networkidle', timeout: 25000 });
  console.log('\nAlura dashboard loaded:', aluraPage.url());
  await aluraPage.waitForTimeout(2000);
  
  // Click on keyword research shortcut
  try {
    await aluraPage.click('a[href*="/research/keyword"]', { timeout: 5000 });
    console.log('Clicked keyword research link');
    await aluraPage.waitForTimeout(3000);
    console.log('After click URL:', aluraPage.url());
    
    // Now try the input
    const inputs = await aluraPage.evaluate(() => 
      Array.from(document.querySelectorAll('input')).map(i => ({
        p: i.placeholder, v: i.offsetParent !== null, rect: i.getBoundingClientRect()
      }))
    );
    console.log('Inputs after click:', JSON.stringify(inputs.filter(i => i.v)));
    
    // Fill the keyword input
    const kwInput = aluraPage.locator('[placeholder="Enter a keyword"]');
    const visible = await kwInput.isVisible().catch(() => false);
    console.log('Keyword input visible:', visible);
    
    if (visible) {
      await kwInput.fill('ceramic bowl');
      await aluraPage.keyboard.press('Enter');
      console.log('Alura search triggered!');
      await aluraPage.waitForTimeout(6000);
    }
  } catch(e) {
    console.log('Navigation error:', e.message.split('\n')[0]);
  }
  
  console.log('\n=== FINAL STATUS ===');
  console.log('Alura token:', aluraToken ? '✅' : '❌');
  
  if (!aluraToken) {
    // Try to get token from session cookie directly
    const aluraCookies = await context.cookies(['https://app.alura.io']);
    const session = aluraCookies.find(c => c.name === '__session');
    if (session) {
      console.log('Alura __session cookie found, value starts with:', session.value.substring(0, 50));
      // The __session might itself be usable as Bearer token
      const sessionToken = 'Bearer ' + session.value;
      try {
        const testResp = await axios.get('https://alura.io/api/v3/keywords/ceramic-bowl', {
          params: { language: 'en', forceUpdate: 'false', tool: 'keyword-finder-new' },
          headers: { 'Authorization': sessionToken }
        });
        console.log('✅ Session as token WORKS! Score:', testResp.data.keyword_score);
        fs.writeFileSync('C:/Windows/Temp/alura_token.txt', sessionToken);
        aluraToken = sessionToken;
      } catch(e) {
        console.log('Session as token failed:', e.response?.status);
      }
    }
  }
  
  await browser.close();
}

setup().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
