const { chromium } = require('playwright');
const fs = require('fs');

async function doSearches() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  
  let aluraToken = null;
  let erankEndpoint = null;
  
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'] || '';
    if (url.includes('alura.io/api') && auth.startsWith('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN!', auth.substring(0,80));
    }
    if (url.includes('members.erank.com/api/') && url.includes('keyword')) {
      console.log('📡 eRank keyword API:', url.substring(0,150));
      erankEndpoint = url;
      fs.writeFileSync('C:/Windows/Temp/erank_endpoint.txt', url);
    }
  });
  
  context.on('response', async resp => {
    const url = resp.url();
    if (url.includes('members.erank.com/api/') && url.includes('keyword') && resp.status() === 200) {
      try {
        const text = await resp.text();
        console.log('✅ eRank DATA:', text.substring(0, 400));
        fs.writeFileSync('C:/Windows/Temp/erank_sample.json', text);
      } catch(e) {}
    }
    if (url.includes('alura.io/api/v3/keywords') && resp.status() === 200) {
      try {
        const text = await resp.text();
        console.log('✅ ALURA DATA:', text.substring(0, 300));
        fs.writeFileSync('C:/Windows/Temp/alura_sample.json', text);
      } catch(e) {}
    }
  });
  
  const pages = context.pages();
  
  // ===== ERANK =====
  let erankPage = pages.find(p => p.url().includes('erank.com'));
  if (!erankPage) erankPage = await context.newPage();
  
  if (!erankPage.url().includes('keyword-explorer')) {
    await erankPage.goto('https://members.erank.com/keyword-explorer', { waitUntil: 'domcontentloaded', timeout: 20000 });
  }
  
  await erankPage.waitForTimeout(2000);
  console.log('eRank page ready, URL:', erankPage.url());
  
  // Fill the "Enter keyword" input
  try {
    const input = erankPage.locator('input[placeholder="Enter keyword"]');
    await input.fill('ceramic bowl');
    await input.press('Enter');
    console.log('eRank search triggered!');
    await erankPage.waitForTimeout(6000);
  } catch(e) {
    console.log('eRank input error:', e.message.split('\n')[0]);
    // Try by locator
    const inputs = erankPage.locator('input:visible');
    const count = await inputs.count();
    console.log('Visible inputs:', count);
    if (count > 0) {
      await inputs.first().fill('ceramic bowl');
      await inputs.first().press('Enter');
      await erankPage.waitForTimeout(5000);
    }
  }
  
  // ===== ALURA =====
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) aluraPage = await context.newPage();
  
  if (!aluraPage.url().includes('/research/keyword')) {
    await aluraPage.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 });
  }
  
  await aluraPage.waitForTimeout(3000);
  console.log('\nAlura keyword page:', aluraPage.url());
  
  // Take screenshot
  await aluraPage.screenshot({ path: 'C:/Windows/Temp/alura_kw.png', timeout: 10000 }).catch(e => console.log('screenshot err:', e.message.split('\n')[0]));
  
  // Try all possible inputs
  const allInputs = await aluraPage.evaluate(() => 
    Array.from(document.querySelectorAll('input')).map(i => ({
      p: i.placeholder, v: i.offsetParent !== null, 
      rect: JSON.stringify(i.getBoundingClientRect())
    }))
  );
  console.log('All Alura inputs:', JSON.stringify(allInputs));
  
  // Click on "Enter a keyword" input even if not visible
  try {
    const kwInput = aluraPage.locator('[placeholder="Enter a keyword"]');
    await kwInput.click({ force: true, timeout: 5000 });
    await kwInput.fill('ceramic bowl', { force: true });
    await aluraPage.keyboard.press('Enter');
    console.log('Alura search triggered!');
    await aluraPage.waitForTimeout(6000);
  } catch(e) {
    console.log('Alura forced click error:', e.message.split('\n')[0]);
    // Try scrolling to find elements
    await aluraPage.evaluate(() => window.scrollTo(0, 0));
    await aluraPage.waitForTimeout(1000);
  }
  
  console.log('\n=== FINAL RESULTS ===');
  console.log('Alura token:', aluraToken ? '✅' : '❌');
  console.log('eRank endpoint:', erankEndpoint ? '✅ ' + erankEndpoint : '❌');
  
  await browser.close();
}

doSearches().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
