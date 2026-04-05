const { chromium } = require('playwright');
const fs = require('fs');

async function fixTokens() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let pages = context.pages();
  
  // === ALURA ===
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) aluraPage = await context.newPage();
  
  let aluraToken = null;
  
  // Set up request interception BEFORE navigation
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'] || '';
    if (url.includes('alura.io/api') && auth.startsWith('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN:', auth.substring(0, 100));
    }
  });
  
  // Navigate to dashboard
  await aluraPage.goto('https://app.alura.io/', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Alura URL:', aluraPage.url(), '| Title:', await aluraPage.title());
  await aluraPage.waitForTimeout(2000);
  
  // Find the keyword research link in the nav
  const navLinks = await aluraPage.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button'));
    return links
      .filter(el => el.textContent.toLowerCase().includes('keyword'))
      .map(el => ({ text: el.textContent.trim(), href: el.href || '', class: el.className.substring(0,40) }));
  });
  console.log('Keyword links found:', JSON.stringify(navLinks));
  
  // Click the first keyword research link
  if (navLinks.length > 0) {
    try {
      const link = aluraPage.locator(`a:has-text("Keyword"), button:has-text("Keyword")`).first();
      await link.click({ timeout: 5000 });
      await aluraPage.waitForTimeout(3000);
      console.log('After click URL:', aluraPage.url());
    } catch(e) { 
      // Try href navigation
      if (navLinks[0].href) await aluraPage.goto(navLinks[0].href, { timeout: 20000 });
    }
  } else {
    // Try known URLs
    for (const url of ['/research', '/research/keywords', '/keywords', '/app/keywords']) {
      try {
        await aluraPage.goto(`https://app.alura.io${url}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const t = await aluraPage.title();
        if (!t.includes('Not Found')) { console.log('Found page at', url, t); break; }
      } catch(e) {}
    }
  }
  
  // Now try typing a keyword
  await aluraPage.waitForTimeout(2000);
  const allInputs = await aluraPage.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      id: i.id, name: i.name, placeholder: i.placeholder, type: i.type,
      visible: i.offsetParent !== null
    }));
  });
  console.log('All inputs on Alura:', JSON.stringify(allInputs));
  
  // === ERANK: use page's own fetch within eRank context ===
  let erankPage = pages.find(p => p.url().includes('erank.com'));
  if (!erankPage) {
    erankPage = await context.newPage();
    await erankPage.goto('https://app.erank.com/keyword-explorer', { waitUntil: 'networkidle', timeout: 30000 });
  }
  
  console.log('\neRank URL:', erankPage.url());
  
  // Intercept eRank responses
  erankPage.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/') && resp.status() === 200) {
      console.log('✅ eRank Response 200:', url.substring(0, 120));
      try {
        const text = await resp.text();
        fs.writeFileSync('C:/Windows/Temp/erank_sample.json', text);
        console.log('Data preview:', text.substring(0, 300));
      } catch(e) {}
    }
  });
  
  // Wait for full load and find the search box
  await erankPage.waitForTimeout(3000);
  
  const erankInputs = await erankPage.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea')).map(i => ({
      id: i.id, name: i.name, placeholder: i.placeholder, 
      type: i.type, visible: i.offsetParent !== null,
      rect: i.getBoundingClientRect()
    }));
  });
  console.log('eRank inputs:', JSON.stringify(erankInputs));
  
  // Get page structure
  const structure = await erankPage.evaluate(() => {
    return document.body.innerHTML.substring(0, 3000);
  });
  console.log('eRank HTML:', structure.substring(0, 1000));
  
  await browser.close();
}

fixTokens().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
