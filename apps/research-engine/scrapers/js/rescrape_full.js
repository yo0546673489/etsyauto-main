/**
 * Re-scrape ALL keywords with FULL data including:
 * - avg_prices.USD (real average price)
 * - etsy_volume_mo (Etsy monthly searches)
 * - revenue, avg_revenue
 * - avg_sales, sales
 * - competition_level
 * - avg_listing_age
 */
const { chromium } = require('playwright');
const { Client } = require('pg');
const https = require('https');
const fs = require('fs');

const API_BASE = 'alura-api-3yk57ena2a-uc.a.run.app';
const DB = { host: 'localhost', port: 5432, database: 'profitly', user: 'profitly', password: 'profitly123' };

async function getAuthToken() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('alura.io'));
  if (!page) { page = await context.newPage(); await page.setViewportSize({ width: 1920, height: 1080 }); }
  let token = null;
  page.on('request', req => { if (req.url().includes('alura-api') && req.headers()['authorization']) token = req.headers()['authorization']; });
  await page.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await browser.close();
  return token;
}

function apiGet(token, keyword) {
  return new Promise((resolve, reject) => {
    const path = `/api/v3/keywords/${encodeURIComponent(keyword)}?language=en&forceUpdate=false&tool=keyword-finder-new&source=research-keyword`;
    const options = {
      hostname: API_BASE, path, method: 'GET',
      headers: {
        'Authorization': token, 'Accept': 'application/json',
        'Origin': 'https://app.alura.io', 'Referer': 'https://app.alura.io/research/keyword',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, raw: data.substring(0, 200) }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function extractItem(r, kw) {
  return {
    keyword: r.keyword || kw,
    // Google data
    google_volume: r.google_volume_mo,
    google_change_qr: parseFloat(r.google_change_qr) || 0,
    google_change_yr: parseFloat(r.google_change_yr) || 0,
    // Etsy data
    etsy_volume: r.etsy_volume_mo,
    etsy_change_qr: parseFloat(r.etsy_change_qr) || 0,
    etsy_change_yr: parseFloat(r.etsy_change_yr) || 0,
    // Competition
    competing_listings: r.competing_listings,
    competition_level: r.competition_level,
    keyword_score: r.keyword_score,
    // Pricing
    avg_price_usd: r.avg_prices && r.avg_prices.USD ? parseFloat(r.avg_prices.USD) : null,
    avg_prices_all: r.avg_prices || null,
    // Sales & Revenue
    total_sales: r.sales ? parseInt(r.sales) : null,
    avg_sales_per_listing: r.avg_sales ? parseFloat(r.avg_sales) : null,
    total_revenue: r.revenue ? parseFloat(r.revenue) : null,
    avg_revenue_per_listing: r.avg_revenue ? parseFloat(r.avg_revenue) : null,
    // Engagement
    avg_conversion: r.avg_conversion_rate,
    avg_views: r.avg_views ? parseInt(r.avg_views) : null,
    total_views: r.views ? parseInt(r.views) : null,
    avg_lqs: r.avg_lqs ? parseFloat(r.avg_lqs) : null,
    // Review data
    avg_review_score: r.avg_review_score ? parseFloat(r.avg_review_score) : null,
    avg_review_count: r.avg_review_count ? parseFloat(r.avg_review_count) : null,
    // Listing characteristics
    avg_listing_age_days: r.avg_listing_age ? parseInt(r.avg_listing_age) : null,
    // Search characteristics
    competition_index: r.competition_index_google,
    avg_google_cpc: r.avg_google_cpc,
    // Monthly Etsy history
    etsy_trend_history: r.etsy_volumes ? r.etsy_volumes.slice(-6) : null,
    source: 'alura'
  };
}

async function main() {
  console.log('📊 Full Re-scrape — מוריד נתונים מלאים לכל keywords\n');

  // Get token
  let token = null;
  try {
    token = fs.readFileSync('C:\\Windows\\Temp\\alura_token.txt', 'utf8').trim();
    console.log('✅ Token loaded');
  } catch(e) {
    console.log('🔑 Getting fresh token...');
    token = await getAuthToken();
    if (token) fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8');
  }
  if (!token) { console.log('❌ No token!'); process.exit(1); }

  const db = new Client(DB);
  await db.connect();
  console.log('✅ DB connected\n');

  // Get all keywords from DB
  const existing = await db.query("SELECT DISTINCT keyword FROM research_keywords_raw WHERE source='alura' ORDER BY keyword");
  const keywords = existing.rows.map(r => r.keyword);
  console.log(`📦 ${keywords.length} keywords to re-scrape with full data\n`);

  const results = [];
  let success = 0, failed = 0;
  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < keywords.length; i += BATCH_SIZE) batches.push(keywords.slice(i, i + BATCH_SIZE));

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const pct = ((bi / batches.length) * 100).toFixed(1);
    process.stdout.write(`[${pct}%] Batch ${bi+1}/${batches.length}\r`);

    const batchResults = await Promise.all(batch.map(async kw => {
      try {
        const res = await apiGet(token, kw);
        if (res.status === 200 && res.data && (res.data.results || res.data.result)) {
          if (!res.data.results && res.data.result) res.data.results = res.data.result;
          const item = extractItem(res.data.results, kw);
          return { success: true, item };
        } else if (res.status === 429) {
          return { success: false, error: 'rate_limited', kw };
        } else if (res.status === 401) {
          return { success: false, error: 'unauthorized', kw };
        } else {
          return { success: false, error: `status ${res.status}`, kw };
        }
      } catch(e) {
        return { success: false, error: e.message, kw };
      }
    }));

    let needsRefresh = false;
    for (const br of batchResults) {
      if (br.success) {
        success++;
        results.push(br.item);
        // UPSERT — update existing records with full data
        try {
          await db.query(`
            INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
            VALUES ($1, 'alura', $2::jsonb, NOW())
            ON CONFLICT (keyword, source, scraped_date)
            DO UPDATE SET data = $2::jsonb, scraped_at = NOW()
          `, [br.item.keyword, JSON.stringify(br.item)]);
        } catch(e) {
          // Ignore
        }
      } else {
        failed++;
        if (br.error === 'rate_limited') { await new Promise(r => setTimeout(r, 15000)); }
        else if (br.error === 'unauthorized') needsRefresh = true;
      }
    }

    if (needsRefresh) {
      console.log('\n🔄 Refreshing token...');
      try {
        const newToken = await getAuthToken();
        if (newToken) { token = newToken; fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8'); }
      } catch(e) {}
    }

    if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 200));
    if (bi % 50 === 49) {
      fs.writeFileSync('C:\\Windows\\Temp\\fulldata_progress.json', JSON.stringify(results, null, 2), 'utf8');
      console.log(`\n💾 Progress: ${success} done`);
    }
  }

  // Save results
  fs.writeFileSync('C:\\Windows\\Temp\\fulldata_keywords.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n\n✅ Done! ${success} success, ${failed} failed`);

  // TOP 30 by price
  const withPrice = results.filter(r => r.avg_price_usd > 0).sort((a,b) => b.avg_price_usd - a.avg_price_usd);
  console.log('\n💰 TOP 30 BY PRICE (USD):');
  console.log('Keyword'.padEnd(35) + ' | Price   | Score | EtsyVol  | Competition | Revenue/listing');
  console.log('-'.repeat(110));
  withPrice.slice(0, 30).forEach(r => {
    const rev = r.avg_revenue_per_listing ? '$' + Math.round(r.avg_revenue_per_listing).toLocaleString() : '–';
    console.log(
      r.keyword.padEnd(35) + ' | $' + String(Math.round(r.avg_price_usd)).padStart(5) +
      ' | ' + String(r.keyword_score||'').padStart(5) +
      ' | ' + String(r.etsy_volume||r.google_volume||'').padStart(8) +
      ' | ' + String(r.competing_listings||'').padStart(11) +
      ' | ' + rev
    );
  });

  // TOP 30 by opportunity
  const withOpp = results.map(r => {
    const opp = ((r.google_volume||0) / Math.max(r.competing_listings||1,1)) * (r.keyword_score||0) * parseFloat(r.avg_conversion||0) * 1000;
    return { ...r, opp };
  }).sort((a,b) => b.opp - a.opp);

  console.log('\n💎 TOP 30 BY OPPORTUNITY:');
  console.log('Keyword'.padEnd(35) + ' | Opp   | Score | Price   | EtsyVol  | Competition');
  console.log('-'.repeat(105));
  withOpp.slice(0, 30).forEach(r => {
    const oppStr = r.opp > 10000 ? (r.opp/1000).toFixed(0)+'K' : Math.round(r.opp).toString();
    console.log(
      r.keyword.padEnd(35) + ' | ' + oppStr.padStart(5) +
      ' | ' + String(r.keyword_score||'').padStart(5) +
      ' | ' + (r.avg_price_usd ? '$'+Math.round(r.avg_price_usd) : '–').padStart(7) +
      ' | ' + String(r.etsy_volume||r.google_volume||'').padStart(8) +
      ' | ' + String(r.competing_listings||'')
    );
  });

  await db.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
