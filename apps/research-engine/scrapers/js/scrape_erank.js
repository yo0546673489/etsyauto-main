const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');

async function getDbPassword() {
  for (const pw of ['postgres', 'profitly123', 'admin', '']) {
    try {
      const db = new Client({ host: 'localhost', port: 5432, database: 'profitly_research', user: 'postgres', password: pw });
      await db.connect();
      await db.end();
      return pw;
    } catch(e) {}
  }
  return null;
}

function parseNum(text, label) {
  const re = new RegExp(label + '[^\\d]{0,10}([\\d,]+)');
  const m = text.match(re);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ''));
}

async function scrapeErank() {
  console.log('🔗 מתחבר ל-Chrome CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('erank.com')) || await context.newPage();

  console.log('📂 עובר ל-keyword tool...');
  await page.goto('https://members.erank.com/keyword-tool', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());

  // Debug: show buttons
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().substring(0,30))
  );
  console.log('כפתורים:', buttons.join(' | '));

  const keywords = [
    'personalized gift', 'custom jewelry', 'wall art', 'digital download',
    'wedding decoration', 'home decor', 'baby gift', 'custom portrait',
    'minimalist jewelry', 'sticker sheet', 'candle making kit',
    'macrame wall hanging', 'birth poster', 'pet portrait', 'sustainable gift',
    'handmade soap', 'custom mug', 'pressed flowers', 'crystal jewelry',
    'embroidery hoop art'
  ];

  const allResults = [];

  for (const kw of keywords) {
    try {
      console.log(`\n🔍 "${kw}"...`);

      // Fill input via React setter + keyboard
      const fillResult = await page.evaluate((keyword) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const targetInput = inputs.find(i =>
          i.placeholder && i.placeholder.toLowerCase().includes('keyword')
        );
        if (!targetInput) return 'no input found';

        // Scroll into view
        targetInput.scrollIntoView({ block: 'center' });
        targetInput.click();
        targetInput.focus();

        // React native setter
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(targetInput, keyword);
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        return 'filled: ' + targetInput.value;
      }, kw);

      console.log('Fill:', fillResult);
      await page.waitForTimeout(500);

      // Press Enter to search (most reliable)
      await page.keyboard.press('Enter');
      console.log('Pressed Enter');

      // Also try clicking Search button via JS
      const btnResult = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const searchBtn = btns.find(b => {
          const txt = b.innerText.trim().toLowerCase();
          return txt === 'search' || txt === 'analyze';
        });
        if (searchBtn) {
          searchBtn.click();
          return 'clicked: ' + searchBtn.innerText;
        }
        return 'no search button. Buttons: ' + btns.slice(0,10).map(b => b.innerText.trim()).join(', ');
      });
      console.log('Button:', btnResult);

      // Wait for results to load
      await page.waitForTimeout(5000);
      for (let i = 0; i < 10; i++) {
        const loading = await page.evaluate(() =>
          !!document.querySelector('[class*="skeleton"], [class*="Skeleton"], [class*="loading"]')
        );
        if (!loading) break;
        await page.waitForTimeout(1000);
      }

      // Get page text
      const pageText = await page.evaluate(() => document.body.innerText);

      // Extract tables
      const tableData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('table')).map(table => ({
          headers: Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim()),
          rows: Array.from(table.querySelectorAll('tbody tr')).slice(0, 25).map(row =>
            Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim())
          )
        })).filter(t => t.headers.length > 0);
      });

      const avg_searches = parseNum(pageText, 'Avg\\. Searches');
      const competition = parseNum(pageText, 'Competition');
      const ctr = pageText.match(/CTR[^\d]*?(\d+(?:\.\d+)?%)/)?.[1] || null;

      // Extract related keywords from table
      const relatedKeywords = [];
      if (tableData.length > 0) {
        const t = tableData[0];
        const kwIdx = t.headers.findIndex(h => h === 'Keywords');
        const searchIdx = t.headers.findIndex(h => h.includes('Avg') && h.includes('Search'));
        const compIdx = t.headers.findIndex(h => h.includes('Competition'));
        const kdIdx = t.headers.findIndex(h => h === 'KD');
        const ctrIdx = t.headers.findIndex(h => h.includes('CTR'));

        for (const row of t.rows) {
          const kwName = (kwIdx >= 0 ? row[kwIdx] : row[2] || '').split('\n')[0].trim();
          if (kwName) {
            const rawSearches = searchIdx >= 0 ? row[searchIdx] : null;
            const rawComp = compIdx >= 0 ? row[compIdx] : null;
            relatedKeywords.push({
              keyword: kwName,
              avg_searches: rawSearches ? parseInt(rawSearches.replace(/,/g,'')) || rawSearches : null,
              competition: rawComp ? parseInt(rawComp.replace(/,/g,'')) || rawComp : null,
              kd: kdIdx >= 0 ? row[kdIdx] : null,
              ctr: ctrIdx >= 0 ? row[ctrIdx] : null,
            });
          }
        }
      }

      // If no data, print partial page text for debugging
      if (!avg_searches && relatedKeywords.length === 0) {
        console.log('⚠️ אין נתונים! page text snippet:', pageText.substring(200, 800));
      }

      const result = { keyword: kw, avg_searches, competition, ctr, relatedKeywords, tables: tableData };
      allResults.push(result);

      console.log(`✅ ${kw}: searches=${avg_searches}, competition=${competition}, ctr=${ctr}, related=${relatedKeywords.length}`);
      if (relatedKeywords.length > 0) {
        relatedKeywords.slice(0, 3).forEach(r =>
          console.log(`   └ ${r.keyword}: searches=${r.avg_searches}, comp=${r.competition}`)
        );
      }

    } catch(err) {
      console.log(`❌ שגיאה "${kw}":`, err.message.substring(0, 150));
      allResults.push({ keyword: kw, error: err.message });
    }
  }

  // Save JSON
  fs.writeFileSync('C:\\Windows\\Temp\\erank_results_final.json', JSON.stringify(allResults, null, 2), 'utf8');
  console.log('\n✅ נשמר ב: C:\\Windows\\Temp\\erank_results_final.json');

  // Summary
  console.log('\n📊 === סיכום ===');
  allResults.filter(r => !r.error).forEach(r => {
    console.log(`${r.keyword.padEnd(25)} | searches: ${String(r.avg_searches || 'N/A').padStart(8)} | competition: ${String(r.competition || 'N/A').padStart(10)} | CTR: ${r.ctr || 'N/A'}`);
  });

  // Save to DB
  const dbPw = await getDbPassword();
  if (dbPw !== null) {
    const db = new Client({ host: 'localhost', port: 5432, database: 'profitly_research', user: 'postgres', password: dbPw });
    await db.connect();
    console.log('\n💾 שומר ל-DB...');
    let saved = 0;
    for (const r of allResults) {
      if (r.error) continue;
      try {
        await db.query(`
          INSERT INTO research_keywords_raw (keyword, source, raw_data, created_at)
          VALUES ($1, 'erank', $2::jsonb, NOW())
          ON CONFLICT DO NOTHING
        `, [r.keyword, JSON.stringify(r)]);
        saved++;
        for (const rel of (r.relatedKeywords || [])) {
          if (!rel.keyword) continue;
          try {
            await db.query(`
              INSERT INTO research_keywords_raw (keyword, source, raw_data, created_at)
              VALUES ($1, 'erank_related', $2::jsonb, NOW())
              ON CONFLICT DO NOTHING
            `, [rel.keyword, JSON.stringify(rel)]);
            saved++;
          } catch(e) {}
        }
      } catch(e) {
        console.log('DB insert error:', e.message.substring(0, 80));
      }
    }
    await db.end();
    console.log(`✅ ${saved} records נשמרו ב-DB`);
  } else {
    console.log('⚠️ לא הצלחתי להתחבר ל-DB');
  }

  await browser.close();
  console.log('\n🏁 סיום!');
}

scrapeErank().catch(err => {
  console.error('❌ שגיאה:', err.message);
  process.exit(1);
});
