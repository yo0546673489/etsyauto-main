const { chromium } = require('playwright');
const { Client } = require('pg');
const https = require('https');
const fs = require('fs');

const API_BASE = 'alura-api-3yk57ena2a-uc.a.run.app';
const DB = { host: 'localhost', port: 5432, database: 'profitly', user: 'profitly', password: 'profitly123' };

// 200 keywords to research across all major Etsy niches
const ALL_KEYWORDS = [
  // Personalized & Custom
  'personalized gift', 'custom jewelry', 'custom portrait', 'personalized necklace',
  'custom name necklace', 'personalized ornament', 'custom phone case', 'personalized mug',
  'custom tote bag', 'personalized keychain', 'custom wedding gift', 'personalized baby gift',
  'custom pet portrait', 'personalized cutting board', 'custom book nook',

  // Digital Products
  'digital download', 'printable wall art', 'digital planner', 'svg cut files',
  'printable planner', 'digital stickers', 'canva template', 'printable art',
  'digital invitation', 'printable gift', 'digital art print', 'notion template',
  'printable coloring page', 'digital recipe card', 'budget planner printable',

  // Home Decor
  'wall art', 'boho wall art', 'minimalist print', 'botanical print',
  'gallery wall set', 'abstract wall art', 'motivational print', 'vintage poster',
  'nursery wall art', 'kitchen wall art', 'bathroom wall art', 'bedroom wall decor',
  'macrame wall hanging', 'woven wall hanging', 'tapestry wall hanging',

  // Jewelry
  'minimalist jewelry', 'dainty necklace', 'gold necklace', 'silver ring',
  'stacking rings', 'earrings', 'hoop earrings', 'statement earrings',
  'crystal necklace', 'charm bracelet', 'birth flower necklace', 'zodiac jewelry',
  'pearl earrings', 'turquoise jewelry', 'resin earrings',

  // Clothing & Accessories
  'graphic tee', 'vintage t shirt', 'funny sweatshirt', 'aesthetic hoodie',
  'custom hat', 'embroidered shirt', 'tie dye shirt', 'oversized sweater',
  'custom tote', 'beaded bag', 'crochet bag', 'leather wallet',

  // Wedding
  'wedding decoration', 'wedding invitation', 'bridal shower', 'bachelorette party',
  'wedding favor', 'table centerpiece', 'wedding sign', 'flower crown',
  'bridesmaid gift', 'groomsmen gift', 'wedding guest book', 'wedding backdrop',

  // Baby & Kids
  'baby gift', 'baby shower gift', 'baby name sign', 'nursery decor',
  'personalized baby blanket', 'baby mobile', 'stuffed animal', 'wooden toy',
  'kids room decor', 'personalized backpack', 'birth announcement', 'baby keepsake',

  // Handmade & Craft
  'handmade soap', 'soy candle', 'beeswax candle', 'bath bomb',
  'lip balm', 'body scrub', 'essential oil blend', 'crystal set',
  'macrame kit', 'embroidery kit', 'crochet pattern', 'knitting pattern',
  'resin art', 'polymer clay earrings', 'pressed flower',

  // Art & Prints
  'watercolor print', 'illustration print', 'map print', 'city poster',
  'animal print', 'portrait illustration', 'custom illustration', 'pet illustration',
  'birth flower print', 'astrology chart', 'star map print', 'vintage map',

  // Stationery & Paper
  'sticker sheet', 'planner stickers', 'washi tape', 'greeting card',
  'thank you card', 'birthday card', 'journal', 'notebook',
  'gift wrap', 'ribbon', 'tissue paper', 'stamp set',

  // Trending 2025
  'coquette aesthetic', 'dark academia', 'cottagecore', 'y2k aesthetic',
  'mushroom decor', 'frog art', 'cat lover gift', 'dog mom gift',
  'plant lover gift', 'book lover gift', 'gamer gift', 'teacher gift',
  'nurse gift', 'new home gift', 'graduation gift', 'retirement gift',

  // Pet Products
  'pet bandana', 'dog bow tie', 'cat collar', 'dog tag',
  'pet memorial', 'dog mom', 'cat mom', 'pet sticker',
  'dog portrait', 'cat portrait', 'custom pet bowl', 'pet ornament',

  // Seasonal
  'christmas ornament', 'christmas stocking', 'holiday card', 'advent calendar',
  'halloween decoration', 'easter basket', 'mothers day gift', 'fathers day gift',
  'valentines day gift', 'birthday gift for her', 'gift for him', 'gift for teen',
];

async function getAuthToken() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  // Find existing Alura tab or create new one
  let page = context.pages().find(p => p.url().includes('alura.io'));
  if (!page) {
    page = await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
  }

  let token = null;
  page.on('request', req => {
    if (req.url().includes('alura-api') && req.headers()['authorization']) {
      token = req.headers()['authorization'];
    }
  });

  await page.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  await browser.close();
  return token;
}

function apiGet(token, keyword) {
  return new Promise((resolve, reject) => {
    const path = `/api/v3/keywords/${encodeURIComponent(keyword)}?language=en&forceUpdate=false&tool=keyword-finder-new&source=research-keyword`;
    const options = {
      hostname: API_BASE,
      path,
      method: 'GET',
      headers: {
        'Authorization': token,
        'Accept': 'application/json',
        'Origin': 'https://app.alura.io',
        'Referer': 'https://app.alura.io/research/keyword',
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

async function main() {
  console.log('🔑 מקבל auth token...');
  const token = await getAuthToken();
  if (!token) { console.log('❌ אין token!'); process.exit(1); }
  console.log('✅ Token:', token.substring(0, 60) + '...');

  // Save token
  fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8');

  // Connect to DB
  const db = new Client(DB);
  await db.connect();
  console.log('✅ DB connected');

  const results = [];
  let success = 0, failed = 0;

  // Process in batches of 5 concurrent requests
  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < ALL_KEYWORDS.length; i += BATCH_SIZE) {
    batches.push(ALL_KEYWORDS.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n🚀 מתחיל סריקה: ${ALL_KEYWORDS.length} keywords ב-${batches.length} batches (${BATCH_SIZE} במקביל)\n`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`Batch ${bi + 1}/${batches.length}: ${batch.join(', ')}`);

    const batchResults = await Promise.all(batch.map(async kw => {
      try {
        const res = await apiGet(token, kw);
        if (res.status === 200 && res.data && (res.data.results || res.data.result)) {
          if (!res.data.results && res.data.result) res.data.results = res.data.result;
          const r = res.data.results;
          const item = {
            keyword: r.keyword || kw,
            google_volume: r.google_volume_mo,
            google_change_qr: parseFloat(r.google_change_qr),
            google_change_yr: parseFloat(r.google_change_yr),
            competing_listings: r.competing_listings,
            keyword_score: r.keyword_score,
            avg_conversion: r.avg_conversion_rate,
            avg_price: r.avg_price,
            total_sales_30d: r.total_sales_30d,
            trend: r.trend,
            source: 'alura'
          };
          return { success: true, item };
        } else if (res.status === 429) {
          return { success: false, error: 'rate_limited', kw };
        } else {
          return { success: false, error: `status ${res.status}`, kw };
        }
      } catch(e) {
        return { success: false, error: e.message, kw };
      }
    }));

    for (const br of batchResults) {
      if (br.success) {
        const { item } = br;
        results.push(item);
        success++;
        console.log(`  ✅ ${item.keyword.padEnd(30)} | score: ${item.keyword_score} | vol: ${item.google_volume} | comp: ${item.competing_listings} | sales30d: ${item.total_sales_30d}`);

        // Save to DB
        try {
          await db.query(`
            INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
            VALUES ($1, 'alura', $2::jsonb, NOW())
            ON CONFLICT (keyword, source, scraped_date) DO NOTHING
          `, [item.keyword, JSON.stringify(item)]);
        } catch(e) {
          // ignore duplicate
        }
      } else {
        failed++;
        console.log(`  ❌ ${br.kw}: ${br.error}`);
        if (br.error === 'rate_limited') {
          console.log('  ⏸️ Rate limited! Waiting 10 seconds...');
          await new Promise(r => setTimeout(r, 10000));
        }
      }
    }

    // Small delay between batches
    if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // Save results
  fs.writeFileSync('C:\\Windows\\Temp\\alura_keywords.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n✅ סיום! ${success} הצליחו, ${failed} נכשלו`);
  console.log('📁 נשמר ב: C:\\Windows\\Temp\\alura_keywords.json');

  // Summary - top 20 by score
  const sorted = results.sort((a, b) => (b.keyword_score || 0) - (a.keyword_score || 0));
  console.log('\n📊 TOP 20 KEYWORDS BY SCORE:');
  console.log('Keyword'.padEnd(30) + ' | Score | Volume  | Competition | Sales30d | AvgPrice');
  console.log('-'.repeat(90));
  sorted.slice(0, 20).forEach(r => {
    console.log(
      r.keyword.padEnd(30) + ' | ' +
      String(r.keyword_score || '').padStart(5) + ' | ' +
      String(r.google_volume || '').padStart(7) + ' | ' +
      String(r.competing_listings || '').padStart(11) + ' | ' +
      String(r.total_sales_30d || '').padStart(8) + ' | $' +
      String(r.avg_price || '')
    );
  });

  await db.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
