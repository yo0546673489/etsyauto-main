/**
 * Capture Alura Bearer token via CDP Chrome
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  console.log('Contexts:', contexts.length);

  const context = contexts[0];
  const pages = context.pages();
  console.log('Pages:', pages.length);

  // Find Alura page
  let aluraPage = pages.find(p => p.url().includes('alura.io'));
  if (!aluraPage) {
    console.log('No Alura page found, creating new one');
    aluraPage = await context.newPage();
    await aluraPage.goto('https://app.alura.io/dashboard');
    await aluraPage.waitForTimeout(3000);
  }
  console.log('Alura page URL:', aluraPage.url());

  // Set up network interception to capture auth headers
  let capturedToken = null;
  let capturedCookies = null;

  aluraPage.on('request', req => {
    const url = req.url();
    if (url.includes('alura.io/api') || url.includes('keyword') || url.includes('research')) {
      const headers = req.headers();
      if (headers['authorization']) {
        capturedToken = headers['authorization'];
        console.log('Captured Authorization:', capturedToken.substring(0, 80) + '...');
      }
      if (headers['cookie']) {
        capturedCookies = headers['cookie'];
      }
      console.log('API Request:', url);
    }
  });

  // Try navigating to keyword research page via SPA router
  console.log('\nNavigating to keyword research...');
  await aluraPage.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('Nav error:', e.message));
  await aluraPage.waitForTimeout(3000);

  console.log('Current URL:', aluraPage.url());

  // Try triggering a search via JavaScript to force API call
  const token = await aluraPage.evaluate(() => {
    // Check localStorage/sessionStorage for tokens
    const keys = Object.keys(localStorage);
    const skeys = Object.keys(sessionStorage);
    const results = {};

    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && (v.includes('Bearer') || v.includes('ey') || k.toLowerCase().includes('token') || k.toLowerCase().includes('auth'))) {
        results[`localStorage.${k}`] = v.substring(0, 200);
      }
    }
    for (const k of skeys) {
      const v = sessionStorage.getItem(k);
      if (v && (v.includes('Bearer') || v.includes('ey') || k.toLowerCase().includes('token') || k.toLowerCase().includes('auth'))) {
        results[`sessionStorage.${k}`] = v.substring(0, 200);
      }
    }

    // Also check for React/Vue store tokens
    const appEl = document.querySelector('#app') || document.querySelector('[data-v-app]');

    return results;
  });

  console.log('\nStorage tokens found:', JSON.stringify(token, null, 2));

  // Try to find the keyword input and trigger a search
  await aluraPage.waitForTimeout(2000);

  // Look for input elements
  const inputs = await aluraPage.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return Array.from(inputs).map(i => ({
      type: i.type,
      placeholder: i.placeholder,
      name: i.name,
      id: i.id,
      className: i.className.substring(0, 50),
      rect: i.getBoundingClientRect()
    }));
  });
  console.log('\nInputs on page:', JSON.stringify(inputs, null, 2));

  // Try clicking an input and typing
  for (const inp of inputs) {
    if (inp.rect.width > 0) {
      console.log('Found visible input:', inp);
      await aluraPage.click(`input[placeholder="${inp.placeholder}"]`).catch(() => {});
      await aluraPage.type(`input[placeholder="${inp.placeholder}"]`, 'wall art', { delay: 100 });
      await aluraPage.keyboard.press('Enter');
      await aluraPage.waitForTimeout(3000);
      break;
    }
  }

  // Check network requests
  await aluraPage.waitForTimeout(2000);

  // Read cookies from browser context
  const cookies = await context.cookies('https://app.alura.io');
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log('\nCookies count:', cookies.length);

  // Also try fetching the API directly from within the page context
  const apiResult = await aluraPage.evaluate(async () => {
    try {
      const resp = await fetch('https://alura.io/api/v3/keywords/wall%20art?language=en&forceUpdate=false&tool=keyword-finder-new', {
        credentials: 'include'
      });
      const headers = {};
      resp.headers.forEach((v, k) => { headers[k] = v; });
      const text = await resp.text();
      return { status: resp.status, headers, body: text.substring(0, 500) };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('\nDirect API fetch result:', JSON.stringify(apiResult, null, 2));

  if (capturedToken) {
    const fs = require('fs');
    const auth = {
      token: capturedToken,
      cookies: cookieStr,
      captured_at: new Date().toISOString()
    };
    fs.writeFileSync('C:/Windows/Temp/alura_auth.json', JSON.stringify(auth, null, 2));
    console.log('\n✅ Token saved to C:/Windows/Temp/alura_auth.json');
  }

  await browser.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
