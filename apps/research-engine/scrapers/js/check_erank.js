const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('erank.com')) || await context.newPage();

  console.log('Going to keyword tool...');
  await page.goto('https://members.erank.com/keyword-tool', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  console.log('URL:', page.url());

  async function searchKeyword(kw) {
    // Fill input via React native setter
    await page.evaluate((keyword) => {
      const inputs = document.querySelectorAll('input');
      let targetInput = Array.from(inputs).find(i =>
        i.placeholder && (i.placeholder.toLowerCase().includes('enter a keyword') || i.placeholder.toLowerCase() === 'keyword')
      ) || Array.from(inputs).find(i => i.placeholder && i.placeholder.toLowerCase().includes('keyword'));

      if (!targetInput) return;

      targetInput.click();
      targetInput.focus();

      // React synthetic event trick
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(targetInput, keyword);
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }, kw);

    await page.waitForTimeout(300);

    // Click Search button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const searchBtn = buttons.find(b => b.innerText && b.innerText.trim().toLowerCase() === 'search');
      if (searchBtn) searchBtn.click();
    });

    // Wait for results to load
    await page.waitForTimeout(4000);

    // Wait for spinner to disappear
    for (let i = 0; i < 10; i++) {
      const loading = await page.evaluate(() => {
        const spinner = document.querySelector('[class*="spinner"], [class*="loading"], [class*="skeleton"]');
        return !!spinner;
      });
      if (!loading) break;
      await page.waitForTimeout(1000);
    }
  }

  async function extractData(kw) {
    return await page.evaluate((keyword) => {
      const result = { keyword, url: window.location.href };

      // Get all text
      result.pageText = document.body.innerText.substring(0, 4000);

      // Tables
      result.tables = Array.from(document.querySelectorAll('table')).map(table => ({
        headers: Array.from(table.querySelectorAll('thead th, thead td')).map(h => h.innerText.trim()),
        rows: Array.from(table.querySelectorAll('tbody tr')).slice(0, 20).map(row =>
          Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim())
        )
      }));

      // Look for stat cards/boxes
      result.statCards = Array.from(document.querySelectorAll('[class*="card"], [class*="stat"], [class*="metric"], [class*="data-"]'))
        .filter(el => el.innerText.trim().match(/\d/))
        .slice(0, 20)
        .map(el => ({ class: el.className.substring(0, 60), text: el.innerText.trim().substring(0, 200) }));

      // Specific eRank elements
      result.allText = document.body.innerText;

      return result;
    }, kw);
  }

  // Search for first keyword
  console.log('\n🔍 Searching: "personalized gift"');
  await searchKeyword('personalized gift');

  await page.screenshot({ path: 'C:\\Windows\\Temp\\erank_search_result.png' });

  const data = await extractData('personalized gift');
  console.log('\n--- TABLES ---');
  data.tables.forEach((t, i) => {
    console.log(`Table ${i}: headers: [${t.headers.join(', ')}]`);
    t.rows.slice(0, 3).forEach(r => console.log('  Row:', r.join(' | ')));
  });

  console.log('\n--- STAT CARDS ---');
  data.statCards.forEach(c => console.log(c.text.substring(0, 150)));

  console.log('\n--- PAGE TEXT (1000 chars) ---');
  console.log(data.pageText.substring(0, 1000));

  // Save HTML
  const html = await page.content();
  fs.writeFileSync('C:\\Windows\\Temp\\erank_result.html', html.substring(0, 100000), 'utf8');
  console.log('\nHTML saved');

  await browser.close();
})().catch(e => console.error('Error:', e.message));
