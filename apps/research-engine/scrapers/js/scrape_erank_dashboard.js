const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');

async function scrapeERankDashboard() {
  console.log('🔗 מתחבר ל-Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('erank.com')) || await context.newPage();

  const db = new Client({ host: 'localhost', port: 5432, database: 'profitly', user: 'profitly', password: 'profitly123' });
  await db.connect();

  const allData = {};

  // ===== 1. DASHBOARD - Most Sales + Trending =====
  console.log('\n📊 1. Dashboard...');
  await page.goto('https://members.erank.com/dashboard', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const dashboardData = await page.evaluate(() => {
    const result = {};

    // Most Sales on Etsy
    const salesSection = Array.from(document.querySelectorAll('h2, h3, [class*="title"], [class*="heading"]'))
      .find(el => el.innerText.includes('Most Sales'));
    if (salesSection) {
      const container = salesSection.closest('[class*="card"], [class*="widget"], .panel, section, div');
      if (container) {
        const rows = Array.from(container.querySelectorAll('tr, [class*="row"]'));
        result.topSellers = rows.slice(0, 20).map(row => ({
          text: row.innerText.trim().substring(0, 100)
        })).filter(r => r.text);
      }
    }

    // Trending Categories
    const trendingSection = Array.from(document.querySelectorAll('h2, h3, [class*="title"], [class*="heading"]'))
      .find(el => el.innerText.includes('Trending'));
    if (trendingSection) {
      const container = trendingSection.closest('[class*="card"], [class*="widget"], .panel, section, div');
      if (container) {
        result.trending = container.innerText.trim().substring(0, 2000);
      }
    }

    // Full page text
    result.pageText = document.body.innerText.substring(0, 5000);
    return result;
  });
  allData.dashboard = dashboardData;
  console.log('Dashboard pageText snippet:', dashboardData.pageText.substring(0, 500));
  await page.screenshot({ path: 'C:\\Windows\\Temp\\erank_dash.png' });

  // ===== 2. TOP SELLERS =====
  console.log('\n🏆 2. Top Sellers...');
  await page.goto('https://members.erank.com/top-sellers', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const topSellersData = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({
      headers: Array.from(t.querySelectorAll('thead th')).map(h => h.innerText.trim()),
      rows: Array.from(t.querySelectorAll('tbody tr')).slice(0, 50).map(r =>
        Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim())
      )
    })).filter(t => t.rows.length > 0);

    return {
      tables,
      pageText: document.body.innerText.substring(0, 3000)
    };
  });
  allData.topSellers = topSellersData;
  await page.screenshot({ path: 'C:\\Windows\\Temp\\erank_topsellers.png' });
  console.log(`Top sellers: ${topSellersData.tables.length} tables`);
  if (topSellersData.tables.length > 0) {
    console.log('Headers:', topSellersData.tables[0].headers.join(' | '));
    topSellersData.tables[0].rows.slice(0, 5).forEach(r => console.log('  Row:', r.join(' | ')));
  }

  // ===== 3. TREND BUZZ =====
  console.log('\n📈 3. Trend Buzz...');
  await page.goto('https://members.erank.com/trend-buzz', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const trendData = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({
      headers: Array.from(t.querySelectorAll('thead th')).map(h => h.innerText.trim()),
      rows: Array.from(t.querySelectorAll('tbody tr')).slice(0, 30).map(r =>
        Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim())
      )
    })).filter(t => t.rows.length > 0);

    const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="item"], [class*="keyword"]'))
      .map(el => el.innerText.trim().substring(0, 200))
      .filter(t => t.length > 5 && t.length < 200)
      .slice(0, 50);

    return { tables, cards, pageText: document.body.innerText.substring(0, 3000) };
  });
  allData.trends = trendData;
  await page.screenshot({ path: 'C:\\Windows\\Temp\\erank_trends.png' });
  console.log(`Trends: ${trendData.tables.length} tables, ${trendData.cards.length} cards`);
  if (trendData.tables.length > 0) {
    console.log('Headers:', trendData.tables[0].headers.join(' | '));
    trendData.tables[0].rows.slice(0, 5).forEach(r => console.log('  Row:', r.join(' | ')));
  }

  // ===== 4. MONTHLY TRENDS =====
  console.log('\n📅 4. Monthly Trends...');
  await page.goto('https://members.erank.com/trending', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const monthlyData = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({
      headers: Array.from(t.querySelectorAll('thead th')).map(h => h.innerText.trim()),
      rows: Array.from(t.querySelectorAll('tbody tr')).slice(0, 30).map(r =>
        Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim())
      )
    })).filter(t => t.rows.length > 0);
    return { tables, pageText: document.body.innerText.substring(0, 3000) };
  });
  allData.monthly = monthlyData;
  await page.screenshot({ path: 'C:\\Windows\\Temp\\erank_monthly.png' });
  console.log(`Monthly: ${monthlyData.tables.length} tables`);
  if (monthlyData.tables.length > 0) {
    console.log('Headers:', monthlyData.tables[0].headers.join(' | '));
    monthlyData.tables[0].rows.slice(0, 5).forEach(r => console.log('  Row:', r.join(' | ')));
  }

  // ===== 5. COMPETITOR SALES =====
  console.log('\n🔍 5. Competitor Sales...');
  await page.goto('https://members.erank.com/competitor-sales', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  const compData = await page.evaluate(() => ({
    pageText: document.body.innerText.substring(0, 2000)
  }));
  allData.competitor = compData;
  console.log('Competitor page snippet:', compData.pageText.substring(0, 300));

  // Save all data
  fs.writeFileSync('C:\\Windows\\Temp\\erank_dashboard_data.json', JSON.stringify(allData, null, 2), 'utf8');
  console.log('\n✅ נתוני דשבורד נשמרו ב: C:\\Windows\\Temp\\erank_dashboard_data.json');

  // Save top sellers to DB
  if (topSellersData.tables.length > 0) {
    const t = topSellersData.tables[0];
    for (const row of t.rows.slice(0, 30)) {
      if (row.length >= 2) {
        const shopName = row[0] || row[1];
        if (shopName && shopName.trim()) {
          try {
            await db.query(`
              INSERT INTO research_shops (shop_name, source, raw_data, created_at)
              VALUES ($1, 'erank_top_sellers', $2::jsonb, NOW())
              ON CONFLICT DO NOTHING
            `, [shopName.trim(), JSON.stringify({ headers: t.headers, data: row })]);
          } catch(e) {
            // ignore duplicates / schema issues
          }
        }
      }
    }
    console.log('✅ Top sellers saved to research_shops');
  }

  await db.end();
  await browser.close();
  console.log('\n🏁 סיום!');
}

scrapeERankDashboard().catch(e => console.error('Error:', e.message));
