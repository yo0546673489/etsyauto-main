const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DOWNLOAD_PATH = 'C:\\Windows\\Temp\\alura_downloads';
if (!fs.existsSync(DOWNLOAD_PATH)) fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  // Set download behavior via CDP
  const cdp = await context.newCDPSession(context.pages()[0]);

  let page = context.pages().find(p => p.url().includes('alura.io')) || await context.newPage();

  // Monitor API calls
  const apiCalls = [];
  page.on('response', async res => {
    if (res.url().includes('api') || res.url().includes('keyword') || res.url().includes('search')) {
      try {
        const body = await res.text().catch(() => '');
        if (body.length > 50 && body.length < 50000) {
          apiCalls.push({ url: res.url(), status: res.status(), bodySnippet: body.substring(0, 200) });
        }
      } catch(e) {}
    }
  });

  // Go to keyword research
  console.log('🔍 נכנס לKeyword Research...');
  await page.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());

  const pageText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('\n--- PAGE TEXT ---');
  console.log(pageText.substring(0, 1000));

  // Find search input
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder, type: i.type, id: i.id, class: i.className.substring(0,50), visible: i.offsetParent !== null
    }))
  );
  console.log('\nInputs:', JSON.stringify(inputs, null, 2));

  // Find buttons (export/download)
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"], a[class*="btn"]'))
      .map(b => ({ text: b.innerText.trim().substring(0,40), class: b.className.substring(0,50) }))
      .filter(b => b.text)
  );
  console.log('\nButtons:', buttons.map(b => b.text).join(' | '));

  // Search for keyword
  console.log('\n🔍 מחפש "personalized gift"...');
  const searchInput = await page.$('input[placeholder*="keyword"], input[placeholder*="search"], input[placeholder*="product"], input[placeholder*="Search"], input[type="search"]');
  if (searchInput) {
    // React fill
    await page.evaluate((kw) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const inp = inputs.find(i => i.placeholder && (
        i.placeholder.toLowerCase().includes('keyword') ||
        i.placeholder.toLowerCase().includes('search') ||
        i.placeholder.toLowerCase().includes('product')
      ));
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, kw);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }, 'personalized gift');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);

    console.log('\n--- RESULTS PAGE TEXT ---');
    const resultsText = await page.evaluate(() => document.body.innerText);
    console.log(resultsText.substring(0, 2000));

    // Look for export/download button
    const exportBtn = await page.$('button[class*="export"], button[class*="download"], [aria-label*="export"], [aria-label*="download"], button:has-text("Export"), button:has-text("Download"), button:has-text("CSV")');
    if (exportBtn) {
      console.log('\n✅ נמצא Export button!');
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        const filePath = path.join(DOWNLOAD_PATH, download.suggestedFilename());
        await download.saveAs(filePath);
        console.log('✅ CSV downloaded:', filePath);
      }
    } else {
      console.log('\n⚠️ לא נמצא Export button');
      const allBtns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"]'))
          .map(b => ({ text: b.innerText.trim(), class: b.className.substring(0,60) }))
          .filter(b => b.text)
      );
      console.log('All buttons after search:', allBtns.map(b => b.text).join(' | '));
    }

    // Get table data
    const tableData = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table, [class*="table"], [role="grid"]')).map(t => ({
        headers: Array.from(t.querySelectorAll('th, [role="columnheader"]')).map(h => h.innerText.trim()),
        rows: Array.from(t.querySelectorAll('tr, [role="row"]')).slice(0, 10).map(r =>
          Array.from(r.querySelectorAll('td, [role="cell"]')).map(c => c.innerText.trim().substring(0,50))
        ).filter(r => r.length > 0)
      })).filter(t => t.headers.length > 0 || t.rows.length > 0)
    );
    console.log('\nTables found:', tableData.length);
    tableData.forEach((t, i) => {
      console.log(`Table ${i} headers:`, t.headers.join(' | '));
      t.rows.slice(0, 3).forEach(r => console.log(' Row:', r.join(' | ')));
    });

  } else {
    console.log('⚠️ לא נמצא search input!');
    const html = await page.content();
    fs.writeFileSync('C:\\Windows\\Temp\\alura_kw_page.html', html.substring(0, 150000), 'utf8');
    console.log('HTML saved for analysis');
  }

  console.log('\n=== API CALLS ===');
  apiCalls.forEach(c => console.log(c.status, c.url, '|', c.bodySnippet.substring(0,100)));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
