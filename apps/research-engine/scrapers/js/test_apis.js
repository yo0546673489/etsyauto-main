const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios');

async function testAPIs() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  let aluraToken = null;
  
  // Deep intercept
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'] || '';
    if (url.includes('alura.io/api') && auth.includes('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN CAPTURED:', auth.substring(0, 100));
    }
  });
  
  // Find or open Alura page
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) aluraPage = await context.newPage();
  
  // Navigate to the correct Alura keyword research URL
  console.log('Navigating to Alura keyword research...');
  await aluraPage.goto('https://app.alura.io/research/keyword-finder', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await aluraPage.waitForTimeout(2000);
  console.log('URL after nav:', aluraPage.url());
  
  // Try another URL
  if (aluraPage.url().includes('Not Found') || !(await aluraPage.title()).includes('Alura')) {
    await aluraPage.goto('https://app.alura.io/', { waitUntil: 'networkidle', timeout: 20000 });
    console.log('Navigated to home:', aluraPage.url());
    await aluraPage.waitForTimeout(2000);
    
    // Click keyword research
    try {
      await aluraPage.click('text=Keyword research', { timeout: 5000 });
      await aluraPage.waitForTimeout(3000);
      console.log('Clicked keyword research, URL:', aluraPage.url());
    } catch(e) {
      console.log('Could not click keyword research');
    }
  }
  
  // Try to type in keyword
  try {
    await aluraPage.waitForSelector('input', { timeout: 5000 });
    const inputs = await aluraPage.$$('input:visible');
    console.log('Visible inputs:', inputs.length);
    if (inputs.length > 0) {
      await inputs[0].click();
      await inputs[0].fill('ceramic bowl');
      await aluraPage.keyboard.press('Enter');
      console.log('Typed keyword, waiting for API call...');
      await aluraPage.waitForTimeout(5000);
    }
  } catch(e) { console.log('Input error:', e.message.split('\n')[0]); }
  
  // Test eRank API from Node.js with captured cookies
  const erankCookieFile = 'C:/Windows/Temp/erank_cookies.txt';
  if (fs.existsSync(erankCookieFile)) {
    const erankCookies = fs.readFileSync(erankCookieFile, 'utf8').trim();
    const xsrfToken = erankCookies.match(/XSRF-TOKEN=([^;]+)/)?.[1] || '';
    
    console.log('\n🔬 Testing eRank API...');
    console.log('Cookie preview:', erankCookies.substring(0, 100));
    console.log('XSRF:', xsrfToken.substring(0, 50));
    
    try {
      const resp = await axios.get('https://app.erank.com/api/v2/tool/keyword-explorer', {
        params: { keywords: 'ceramic bowl', marketplace: 'etsy' },
        headers: {
          'Cookie': erankCookies,
          'X-XSRF-TOKEN': decodeURIComponent(xsrfToken),
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
          'Referer': 'https://app.erank.com/keyword-explorer',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log('✅ eRank API SUCCESS! Status:', resp.status);
      console.log('Data keys:', Object.keys(resp.data));
      fs.writeFileSync('C:/Windows/Temp/erank_sample.json', JSON.stringify(resp.data, null, 2));
    } catch(e) {
      console.log('❌ eRank API error:', e.response?.status, e.message.substring(0, 100));
      if (e.response?.data) console.log('Response:', JSON.stringify(e.response.data).substring(0, 200));
    }
  }
  
  if (aluraToken) {
    console.log('\n✅ Alura token saved!');
    // Test it
    try {
      const resp = await axios.get('https://alura.io/api/v3/keywords/ceramic-bowl', {
        params: { language: 'en', forceUpdate: 'false', tool: 'keyword-finder-new' },
        headers: { 'Authorization': aluraToken }
      });
      console.log('✅ Alura API works! Score:', resp.data.keyword_score, 'Price:', resp.data.avg_prices?.USD);
    } catch(e) { console.log('Alura API test error:', e.response?.status, e.message.substring(0, 80)); }
  }
  
  await browser.close();
}

testAPIs().catch(e => console.error('Fatal:', e.message));
