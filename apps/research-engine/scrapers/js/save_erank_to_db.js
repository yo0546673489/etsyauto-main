const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('C:\\Windows\\Temp\\erank_results_final.json', 'utf8'));

const db = new Client({ host: 'localhost', port: 5432, database: 'profitly', user: 'profitly', password: 'profitly123' });

db.connect().then(async () => {
  console.log('✅ מחובר ל-DB');
  let saved = 0;

  for (const r of data) {
    if (r.error || !r.avg_searches) continue;
    try {
      // research_keywords_raw uses: keyword, source, data, scraped_at, scraped_date
      // scraped_date is a generated column — don't insert it
      await db.query(`
        INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
        VALUES ($1, 'erank', $2::jsonb, NOW())
        ON CONFLICT (keyword, source, scraped_date) DO NOTHING
      `, [r.keyword, JSON.stringify(r)]);
      saved++;
      console.log(`✅ ${r.keyword} | searches: ${r.avg_searches} | competition: ${r.competition} | CTR: ${r.ctr}`);
    } catch(e) {
      console.log('Error:', e.message.substring(0, 80));
    }
  }

  // Also save to research_keywords table with parsed data
  // Columns: keyword, erank_searches, erank_competition, erank_click_rate
  for (const r of data) {
    if (r.error || !r.avg_searches) continue;
    try {
      // erank_click_rate is numeric(3,2) — store as decimal e.g. 1.05 for 105%
      const ctrNum = r.ctr ? parseFloat(r.ctr) / 100 : null;
      await db.query(`
        INSERT INTO research_keywords (keyword, erank_searches, erank_competition, erank_click_rate, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (keyword) DO UPDATE SET
          erank_searches = EXCLUDED.erank_searches,
          erank_competition = EXCLUDED.erank_competition,
          erank_click_rate = EXCLUDED.erank_click_rate,
          last_updated_at = NOW()
      `, [r.keyword, r.avg_searches, String(r.competition), ctrNum]);
      console.log(`   💾 research_keywords: ${r.keyword}`);
    } catch(e) {
      console.log('   keywords insert error:', e.message.substring(0, 80));
    }
  }

  console.log(`\n✅ ${saved} records נשמרו`);
  await db.end();
}).catch(e => console.log('DB Error:', e.message));
