const { chromium } = require('playwright');
const fs = require('fs');

async function capture() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let aluraToken = null;
  let erankApiInfo = null;

  // Intercept ALL requests
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'] || '';
    
    if (url.includes('alura.io/api') && auth.startsWith('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN CAPTURED!');
    }
    if (url.includes('erank.com/api') || url.includes('members.erank.com')) {
      const h = req.headers();
      console.log('📡 eRank request:', url.substring(0,100));
      console.log('   Auth:', h['authorization']?.substring(0,50) || 'none');
      console.log('   Cookie:', h['cookie']?.substring(0,80) || 'none');
      erankApiInfo = { url, headers: h };
    }
  });

  const pages = context.pages();
  
  // ===== ALURA =====
  let aluraPage = await context.newPage();
  await aluraPage.goto('https://app.alura.io/research/keyword', { 
    waitUntil: 'networkidle', timeout: 25000 
  });
  console.log('Alura keyword URL:', aluraPage.url());
  await aluraPage.waitForTimeout(3000);
  
  // Find and use search input
  const inputs = await aluraPage.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder, type: i.type, visible: i.offsetParent !== null
    }));
  });
  console.log('Alura inputs:', JSON.stringify(inputs));
  
  // Try to type in search
  try {
    const input = aluraPage.locator('input[placeholder*="keyword"], input[placeholder*="search"], input[placeholder*="Search"], input[type="search"], input[type="text"]').first();
    await input.fill('ceramic bowl', { timeout: 8000 });
    await aluraPage.keyboard.press('Enter');
    console.log('Alura search triggered, waiting for API...');
    await aluraPage.waitForTimeout(6000);
  } catch(e) {
    console.log('Input not found, trying click approach...');
    // Try clicking on visible inputs
    try {
      await aluraPage.locator('input:visible').first().fill('ceramic bowl', { timeout: 5000 });
      await aluraPage.keyboard.press('Enter');
      await aluraPage.waitForTimeout(5000);
    } catch(e2) {
      console.log('Click also failed:', e2.message.split('\n')[0]);
    }
  }
  
  // ===== ERANK =====
  let erankPage = await context.newPage();
  
  // Try members.erank.com keyword search
  await erankPage.goto('https://members.erank.com/keyword-explorer', { 
    waitUntil: 'domcontentloaded', timeout: 15000 
  }).catch(e => console.log('eRank nav error:', e.message.split('\n')[0]));
  
  console.log('\neRank URL:', erankPage.url());
  await erankPage.waitForTimeout(3000);
  
  // Check eRank page
  const erankHtml = await erankPage.evaluate(() => document.body.innerHTML.substring(0, 1000));
  console.log('eRank HTML:', erankHtml.substring(0, 300));
  
  // Get eRank page title and try search
  const erankInputs = await erankPage.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder, type: i.type, visible: i.offsetParent !== null
    }));
  });
  console.log('eRank inputs:', JSON.stringify(erankInputs));
  
  console.log('\n=== RESULTS ===');
  console.log('Alura token captured:', aluraToken ? 'YES ✅' : 'NO ❌');
  console.log('eRank requests captured:', erankApiInfo ? 'YES ✅' : 'NO ❌');
  
  await browser.close();
}

capture().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
