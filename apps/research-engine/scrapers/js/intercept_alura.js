const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Set large viewport to avoid "outside viewport" errors
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Capture all API calls
  const captured = [];
  page.on('request', req => {
    if (req.url().includes('alura-api') || (req.url().includes('alura') && req.url().includes('/api/'))) {
      const entry = {
        method: req.method(),
        url: req.url(),
        token: req.headers()['authorization'] ? req.headers()['authorization'].substring(0, 100) : null,
        postData: req.postData()
      };
      captured.push(entry);
      console.log(`📡 ${entry.method} ${entry.url.substring(0, 120)}`);
    }
  });

  page.on('response', async res => {
    if (res.url().includes('alura-api') || (res.url().includes('alura') && res.url().includes('/api/'))) {
      try {
        const body = await res.text().catch(() => '');
        const match = captured.find(c => c.url === res.url() && !c.responseBody);
        if (match) {
          match.status = res.status();
          match.responseBody = body.substring(0, 500);
          if (body.includes('keyword') || body.includes('search') || body.includes('result')) {
            console.log(`✅ KEYWORD DATA at ${res.url().substring(0,100)}: ${body.substring(0, 200)}`);
          }
        }
      } catch(e) {}
    }
  });

  // Navigate to Alura
  console.log('🔍 Loading Alura Keyword Research...');
  await page.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);

  console.log('URL:', page.url());

  // Resize window via CDP to ensure full screen
  await page.evaluate(() => window.scrollTo(0, 0));

  // Find keyword search input - use JS to locate and interact
  const inputInfo = await page.evaluate(() => {
    const allInputs = Array.from(document.querySelectorAll('input'));
    return allInputs.map(i => ({
      id: i.id, placeholder: i.placeholder, type: i.type,
      rect: (() => { const r = i.getBoundingClientRect(); return { top: r.top, left: r.left, w: r.width, h: r.height }; })(),
      visible: !!(i.offsetWidth || i.offsetHeight || i.getClientRects().length)
    }));
  });
  console.log('Inputs:', JSON.stringify(inputInfo, null, 2));

  // Use JS to directly trigger the keyword search
  // The "Enter a keyword" input has id "tag-insights_keyword-search-input"
  // Let's scroll it into view and click via JS
  const triggered = await page.evaluate(async (keyword) => {
    // Find the main keyword search input
    const kwInput = document.getElementById('tag-insights_keyword-search-input');
    if (kwInput) {
      // Scroll to it
      kwInput.scrollIntoView({ block: 'center', behavior: 'instant' });
      // Make it visible if hidden
      let el = kwInput;
      while (el && el !== document.body) {
        if (el.style.display === 'none') el.style.display = 'block';
        if (el.style.visibility === 'hidden') el.style.visibility = 'visible';
        el = el.parentElement;
      }
      // Click and fill
      kwInput.focus();
      kwInput.click();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(kwInput, keyword);
      kwInput.dispatchEvent(new Event('input', { bubbles: true }));
      kwInput.dispatchEvent(new Event('change', { bubbles: true }));
      kwInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      kwInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
      kwInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
      return { found: true, value: kwInput.value };
    }

    // Fallback: find any keyword input
    const inputs = Array.from(document.querySelectorAll('input'));
    const kwI = inputs.find(i => i.placeholder && i.placeholder.toLowerCase().includes('keyword'));
    if (kwI) {
      kwI.scrollIntoView({ block: 'center', behavior: 'instant' });
      kwI.focus();
      kwI.click();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(kwI, keyword);
      kwI.dispatchEvent(new Event('input', { bubbles: true }));
      kwI.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      return { found: true, fallback: true, value: kwI.value };
    }
    return { found: false, inputCount: inputs.length };
  }, 'personalized gift');

  console.log('Input trigger result:', JSON.stringify(triggered));
  await page.waitForTimeout(3000);

  // Also try pressing Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  // Look for submit button
  const submitResult = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [type="submit"]'));
    const searchBtn = btns.find(b => {
      const t = b.innerText.trim().toLowerCase();
      return t === 'search' || t === 'analyze' || t === 'find' || t === 'go';
    });
    if (searchBtn) {
      searchBtn.click();
      return 'clicked: ' + searchBtn.innerText;
    }
    return 'no submit button. available: ' + btns.slice(0,5).map(b=>b.innerText.trim()).join(' | ');
  });
  console.log('Submit:', submitResult);
  await page.waitForTimeout(5000);

  // Final API capture summary
  console.log('\n=== ALL CAPTURED API CALLS ===');
  const interesting = captured.filter(c => c.url.includes('keyword') || c.url.includes('search') || c.url.includes('research'));
  console.log('Keyword-related calls:', interesting.length);
  interesting.forEach(c => {
    console.log(`\n${c.method} ${c.url}`);
    if (c.postData) console.log('  Body:', c.postData.substring(0, 200));
    if (c.responseBody) console.log('  Response:', c.responseBody.substring(0, 300));
  });

  console.log('\n=== ALL API CALLS ===');
  captured.forEach(c => console.log(c.method, c.url));

  fs.writeFileSync('C:\\Windows\\Temp\\alura_api_calls.json', JSON.stringify(captured, null, 2), 'utf8');
  console.log('\nSaved to C:\\Windows\\Temp\\alura_api_calls.json');

  await browser.close();
})().catch(e => console.error('Error:', e.message));
