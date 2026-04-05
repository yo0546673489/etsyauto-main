const { chromium } = require('playwright');
const fs = require('fs');

async function getAluraToken() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  let aluraToken = null;
  
  // Intercept requests
  context.on('request', req => {
    const url = req.url();
    const auth = req.headers()['authorization'] || '';
    if (url.includes('alura.io/api') && auth.startsWith('Bearer')) {
      aluraToken = auth;
      fs.writeFileSync('C:/Windows/Temp/alura_token.txt', auth);
      console.log('✅ ALURA TOKEN CAPTURED!', auth.substring(0, 80));
    }
  });

  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) {
    aluraPage = await context.newPage();
    await aluraPage.goto('https://app.alura.io/', { waitUntil: 'networkidle', timeout: 30000 });
  }
  
  // Navigate to keywords page
  console.log('Current URL:', aluraPage.url());
  if (!aluraPage.url().includes('/app/keywords')) {
    await aluraPage.goto('https://app.alura.io/app/keywords', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('New URL:', aluraPage.url());
  }
  
  await aluraPage.waitForTimeout(3000);
  
  // Page structure
  const structure = await aluraPage.evaluate(() => {
    const allInputs = Array.from(document.querySelectorAll('input')).map(i => ({
      id: i.id, name: i.name, placeholder: i.placeholder, type: i.type,
      classes: i.className.substring(0, 60)
    }));
    const allButtons = Array.from(document.querySelectorAll('button')).slice(0, 10).map(b => b.textContent.trim().substring(0,30));
    return { inputs: allInputs, buttons: allButtons, title: document.title, body: document.body.innerHTML.substring(0, 2000) };
  });
  
  console.log('Inputs:', JSON.stringify(structure.inputs));
  console.log('Buttons:', JSON.stringify(structure.buttons));
  console.log('Title:', structure.title);
  console.log('HTML:', structure.body.substring(0, 500));
  
  // Try to use the search API directly
  const apiResult = await aluraPage.evaluate(async () => {
    try {
      const resp = await fetch('/api/v3/keywords/ceramic-bowl?language=en&forceUpdate=false&tool=keyword-finder-new', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const data = await resp.json().catch(() => resp.text());
      return { status: resp.status, data: typeof data === 'string' ? data.substring(0, 300) : data };
    } catch(e) { return { error: e.message }; }
  });
  
  console.log('\nAlura direct API call:', JSON.stringify(apiResult).substring(0, 300));
  
  await aluraPage.waitForTimeout(5000);
  
  if (aluraToken) {
    console.log('\n✅ Token saved!');
    // Test it
    const testResult = await aluraPage.evaluate(async (token) => {
      const resp = await fetch('https://alura.io/api/v3/keywords/murphy-bed?language=en&forceUpdate=false&tool=keyword-finder-new', {
        headers: { 'Authorization': token }
      });
      return { status: resp.status, data: (await resp.json().catch(() => null)) };
    }, aluraToken);
    console.log('Token test:', JSON.stringify(testResult).substring(0, 300));
  }
  
  await browser.close();
}

getAluraToken().catch(e => console.error('Fatal:', e.message.split('\n')[0]));
