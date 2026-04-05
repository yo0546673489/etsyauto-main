const { chromium } = require('playwright');
const fs = require('fs');
const https = require('https');

async function getTokens() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  let aluraToken = null;
  let erankData = null;

  // Listen for ALL requests
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'];
    const cookie = req.headers()['cookie'] || '';
    
    if (url.includes('alura.io/api') && auth && auth.startsWith('Bearer')) {
      aluraToken = auth;
      console.log('🔑 ALURA TOKEN FOUND!');
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
    }
    if (url.includes('erank.com') && url.includes('/api/')) {
      console.log('📡 ERANK API CALL:', url.substring(0, 150));
      console.log('   Headers:', JSON.stringify({
        auth: req.headers()['authorization'],
        xsrf: req.headers()['x-xsrf-token'],
        cookie: cookie.substring(0, 100)
      }));
      erankData = { url, headers: req.headers() };
    }
  });
  
  // Get the Alura session cookie and try to get Bearer token
  const cookies = await context.cookies(['https://app.alura.io']);
  const sessionCookie = cookies.find(c => c.name === '__session');
  
  if (sessionCookie) {
    console.log('Session cookie found, trying to get Bearer token...');
    // Try to get auth token from Alura using session cookie
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    // Make a request to Alura to get Bearer token (their app does this on load)
    const aluraPage = pages.find(p => p.url().includes('alura.io'));
    if (aluraPage) {
      // Navigate to keyword finder to trigger token load
      await aluraPage.goto('https://app.alura.io/app/keyword-finder', { waitUntil: 'networkidle', timeout: 30000 });
      await aluraPage.waitForTimeout(3000);
      
      // Get the Bearer token from the page's auth state
      const authState = await aluraPage.evaluate(() => {
        // Check for Firebase auth
        const keys = Object.keys(localStorage).filter(k => k.includes('firebase') || k.includes('token') || k.includes('auth'));
        const result = {};
        keys.forEach(k => result[k] = localStorage.getItem(k));
        
        // Also check for any Bearer token in memory (window objects)
        const winKeys = Object.keys(window).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('token'));
        result._windowKeys = winKeys;
        
        return result;
      });
      console.log('Auth state:', JSON.stringify(authState).substring(0, 500));
    }
  }
  
  // Navigate eRank to keyword research page
  const erankPage = pages.find(p => p.url().includes('erank.com'));
  if (erankPage) {
    console.log('\nNavigating eRank to keyword explorer...');
    await erankPage.goto('https://app.erank.com/keyword-explorer', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await erankPage.waitForTimeout(2000);
    console.log('eRank page:', erankPage.url());
    
    // Get eRank cookies
    const erankCookies = await context.cookies(['https://app.erank.com']);
    const cookieStr = erankCookies.map(c => `${c.name}=${c.value}`).join('; ');
    fs.writeFileSync('C:/Windows/Temp/erank_cookies.txt', cookieStr);
    console.log('eRank cookies:', erankCookies.map(c => c.name).join(', '));
    
    // Try to do a search to trigger API call
    try {
      await erankPage.waitForSelector('input', { timeout: 5000 });
      const inputs = await erankPage.$$('input');
      console.log('Found', inputs.length, 'inputs');
      if (inputs.length > 0) {
        await inputs[0].fill('ceramic bowl');
        await erankPage.keyboard.press('Enter');
        await erankPage.waitForTimeout(5000);
      }
    } catch(e) { console.log('eRank input error:', e.message.split('\n')[0]); }
  }
  
  await aluraToken && console.log('✅ Alura token saved!');
  
  await browser.close();
}

getTokens().catch(e => console.error('Error:', e.message));
