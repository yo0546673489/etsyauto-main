const { chromium } = require('playwright');
const fs = require('fs');

async function captureTokens() {
  console.log('Connecting to CDP Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  let context = contexts[0];
  
  if (!context) {
    context = await browser.newContext();
  }
  
  const pages = context.pages();
  let page = pages[0];
  if (!page) page = await context.newPage();
  
  let aluraToken = null;

  // Intercept network requests
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'];
    if (url.includes('alura.io') && auth && auth.includes('Bearer')) {
      aluraToken = auth;
      console.log('ALURA TOKEN CAPTURED:', auth.substring(0, 100));
    }
  });

  console.log('Navigating to Alura keyword finder...');
  await page.goto('https://app.alura.io/app/keyword-finder', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  
  console.log('Title:', await page.title());
  await page.waitForTimeout(2000);
  
  // Try to search something to trigger API call
  try {
    const searchBox = await page.$('input[type="text"], input[placeholder*="keyword"], input[placeholder*="search"]');
    if (searchBox) {
      await searchBox.fill('ceramic bowl');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
    }
  } catch(e) { console.log('Search box not found:', e.message); }
  
  // Check localStorage/sessionStorage for token
  const tokenFromStorage = await page.evaluate(() => {
    const allStorage = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (v && v.length > 50) allStorage[k] = v.substring(0, 200);
    }
    // Also check for firebase/supabase tokens
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const v = sessionStorage.getItem(k);
      if (v && v.includes('eyJ')) allStorage['session_' + k] = v.substring(0, 200);
    }
    return allStorage;
  });
  
  console.log('Storage tokens:', JSON.stringify(tokenFromStorage, null, 2).substring(0, 500));
  
  await page.waitForTimeout(3000);
  
  if (aluraToken) {
    fs.writeFileSync('C:/Windows/Temp/alura_token.txt', aluraToken);
    console.log('Alura token saved to file!');
  } else {
    console.log('No Alura token captured yet - may need login');
  }

  // Now navigate to eRank
  const eRankPage = await context.newPage();
  let erankToken = null;
  
  context.on('request', req => {
    const url = req.url();
    if (url.includes('erank.com/api') || url.includes('erank.com/keyword')) {
      const auth = req.headers()['authorization'] || req.headers()['x-auth-token'] || req.headers()['cookie'];
      if (auth) {
        console.log('ERANK REQUEST:', url.substring(0, 100), auth.substring(0, 100));
      }
    }
  });
  
  console.log('\nNavigating to eRank keyword research...');
  await eRankPage.goto('https://app.erank.com/keyword-explorer', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('eRank title:', await eRankPage.title());
  await eRankPage.waitForTimeout(3000);
  
  // Get eRank cookies for API use
  const erankCookies = await context.cookies(['https://app.erank.com']);
  const cookieStr = erankCookies.map(c => `${c.name}=${c.value}`).join('; ');
  fs.writeFileSync('C:/Windows/Temp/erank_cookies.txt', cookieStr);
  console.log('eRank cookies saved:', erankCookies.map(c => c.name).join(', '));
  
  await browser.close();
  console.log('Done!');
}

captureTokens().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
