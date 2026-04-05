/**
 * Alura Keyword Scraper
 * API: alura-api-3yk57ena2a-uc.a.run.app/api/v3/keywords/{keyword}
 * Token: Firebase JWT from alura_auth.json (expires ~1hr from issue)
 * Guide criteria: score>=60, competition<21K ideal, conv>=1.25%, price USD>=50
 */

const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');
const { chromium } = require('playwright');

const DB = new Client({ host:'localhost', port:5432, database:'profitly', user:'profitly', password:'profitly123' });

const KEYWORDS_TO_SCRAPE = [
  // High-ticket furniture
  'murphy bed','wall bed','loft bed','bunk bed frame','tv stand','entertainment center',
  'bookcase','floating shelves','storage bench','nightstand','coffee table','side table',
  'dining table','dining bench','bar cart','wine rack','sofa table','bar stool',
  'hanging chair','hammock chair','accent chair','vanity table',
  // Lighting
  'himalayan salt lamp','crystal lamp','pendant light','chandelier','floor lamp',
  'table lamp','neon sign','moon lamp','fairy light curtain','edison bulb lamp',
  // Crystals & spiritual
  'crystal set','amethyst crystal','rose quartz','crystal cluster','crystal wand',
  'selenite','obsidian','crystal tower','raw crystals','healing crystals',
  'tibetan singing bowl','singing bowl','crystal singing bowl','chakra set','mala beads',
  // Rugs
  'area rug','boho rug','vintage rug','wool rug','jute rug','turkish rug',
  'moroccan rug','runner rug','sheepskin rug','cowhide rug',
  // Leather goods
  'leather bag','leather tote','leather backpack','leather wallet',
  'leather belt','leather journal','leather notebook','leather shoulder bag',
  // Woodworking
  'wooden serving board','charcuterie board','cutting board','wooden tray',
  'wood planter','wooden bowl','lazy susan','wood wall art','wood sign',
  // Ceramics
  'ceramic vase','ceramic bowl','ceramic mug','ceramic planter','pottery vase',
  'stoneware mug','ceramic candle holder','ceramic dinnerware','clay pot',
  // Musical instruments
  'ukulele','kalimba','hand drum','djembe','tongue drum','ocarina','steel tongue drum',
  // Outdoor
  'wind chimes','metal wind chimes','garden statue','bird bath','garden planter',
  'hanging planter','plant stand','outdoor lantern','solar lights garden',
  // Art
  'framed wall art','canvas print','botanical print','abstract art',
  'watercolor print','gallery wall set','vintage poster','line art print',
  // Bath
  'bath bomb set','essential oil diffuser','aromatherapy diffuser',
  'bamboo bath tray','shower steamers','bath salts set',
  // Tech
  'wireless charger','desk organizer','laptop stand','monitor stand',
  'desk mat','phone stand','cable organizer',
  // Macrame
  'macrame wall hanging','macrame plant hanger','macrame table runner',
  'woven wall art','tapestry wall hanging','fiber art',
  // Candles
  'soy candle','beeswax candle','crystal candle','luxury candle set',
  'scented candle set','wooden wick candle','candle making kit',
  // Plants & botanical
  'succulent arrangement','air plant','terrarium kit','dried flower arrangement',
  'bonsai tree','pressed flower art',
  // Wedding
  'wedding centerpiece','floral crown','ceremony arch','wedding arch',
  'bridal hair piece','flower crown',
  // Kitchen
  'spice rack','herb garden kit','bamboo utensil set','marble rolling pin',
  'ceramic knife set','cast iron skillet',
  // Baby & kids
  'baby mobile','wooden toys','montessori toys','sensory toys',
  'nursery wall art','kids room decor',
  // Pet
  'dog bed','cat tree','cat bed','leather dog collar','dog bandana',
  // Office
  'planner notebook','fountain pen','calligraphy set','art supply set',
  'washi tape set','desk plant',
  // Jewelry
  'gold necklace','turquoise jewelry','gemstone ring',
  'crystal necklace','moonstone ring','statement earrings'
];

async function refreshAluraToken() {
  console.log('Refreshing Alura token via CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  let aluraPage = pages.find(p => p.url().includes('alura.io'));

  if (!aluraPage) {
    aluraPage = await context.newPage();
    await aluraPage.goto('https://app.alura.io/research/keyword', { waitUntil: 'networkidle', timeout: 20000 });
  }

  let newToken = null;
  const tokenPromise = new Promise((resolve) => {
    const handler = req => {
      const headers = req.headers();
      if (headers['authorization'] && req.url().includes('alura-api')) {
        newToken = headers['authorization'];
        aluraPage.off('request', handler);
        resolve(newToken);
      }
    };
    aluraPage.on('request', handler);
  });

  // Trigger a navigation to force auth headers
  await aluraPage.goto('https://app.alura.io/research/keyword', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await Promise.race([tokenPromise, new Promise(r => setTimeout(r, 8000))]);

  await browser.close();

  if (newToken) {
    const auth = { token: newToken, captured_at: new Date().toISOString() };
    fs.writeFileSync('C:/Windows/Temp/alura_auth.json', JSON.stringify(auth, null, 2));
    console.log('Token refreshed');
    return newToken;
  }

  // Fallback: return existing token
  const auth = JSON.parse(fs.readFileSync('C:/Windows/Temp/alura_auth.json', 'utf8'));
  return auth.token;
}

async function getAluraData(keyword, token) {
  try {
    const enc = encodeURIComponent(keyword);
    const resp = await axios.get(
      `https://alura-api-3yk57ena2a-uc.a.run.app/api/v3/keywords/${enc}?language=en&forceUpdate=false&tool=keyword-finder-new`,
      {
        headers: {
          'Authorization': token,
          'Accept': 'application/json',
          'Origin': 'https://app.alura.io',
          'Referer': 'https://app.alura.io/'
        },
        timeout: 15000
      }
    );
    const d = resp.data.results || resp.data;
    return {
      keyword,
      source: 'alura',
      keyword_score: d.keyword_score || 0,
      competing_listings: d.competing_listings || 0,
      google_volume_mo: d.google_volume_mo || 0,
      avg_conversion_rate: parseFloat(d.avg_conversion_rate || 0),
      competition_level: d.competition_level || '',
      avg_price_usd: d.avg_prices?.USD || 0,
      avg_price_ils: d.avg_prices?.ILS || 0,
      avg_sales: parseFloat(d.avg_sales || 0),
      avg_revenue: parseFloat(d.avg_revenue || 0),
      avg_views: parseFloat(d.avg_views || 0),
      avg_lqs: d.avg_lqs || 0,
      long_tail: d.long_tail_keyword || false,
      raw: d
    };
  } catch(e) {
    return { error: e.response?.status || e.message.substring(0, 50), keyword };
  }
}

async function saveToDb(data) {
  await DB.query(`
    INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (keyword, source, scraped_date)
    DO UPDATE SET data=$3, scraped_at=NOW()
  `, [data.keyword, 'alura', JSON.stringify(data)]);
}

async function main() {
  await DB.connect();
  console.log('Connected to DB');

  const existing = await DB.query("SELECT keyword FROM research_keywords_raw WHERE source='alura'");
  const done = new Set(existing.rows.map(r => r.keyword));
  const remaining = KEYWORDS_TO_SCRAPE.filter(k => !done.has(k));

  // Use max 120 searches today to preserve daily limit
  const toScrape = remaining.slice(0, 120);
  console.log(`Total: ${KEYWORDS_TO_SCRAPE.length} | Done: ${done.size} | Scraping: ${toScrape.length} today`);

  let auth = JSON.parse(fs.readFileSync('C:/Windows/Temp/alura_auth.json', 'utf8'));
  let token = auth.token;
  let count = 0;
  let errors = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const keyword = toScrape[i];
    const data = await getAluraData(keyword, token);

    if (data.error) {
      consecutiveErrors++;
      console.log(`❌ [${i+1}/${toScrape.length}] ${keyword}: ${data.error}`);
      errors++;

      if (data.error === 401 || data.error === 403 || consecutiveErrors >= 3) {
        console.log('Refreshing token...');
        try { token = await refreshAluraToken(); consecutiveErrors = 0; }
        catch(e) { console.log('Refresh failed:', e.message); }
        await new Promise(r => setTimeout(r, 3000));
      }
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    consecutiveErrors = 0;
    count++;
    await saveToDb(data);

    // Guide criteria evaluation
    const passScore = data.keyword_score >= 60;
    const passComp = data.competing_listings < 21000;
    const passCompOk = data.competing_listings < 1000000;
    const passConv = data.avg_conversion_rate >= 0.0125; // 1.25%
    const passPrice = data.avg_price_usd >= 50;

    let status;
    if (passScore && passComp && passConv) status = '🟢';
    else if (passScore && passCompOk && passConv) status = '🟡';
    else status = '🔴';

    const priceStr = data.avg_price_usd > 0 ? `$${data.avg_price_usd.toFixed(0)}` : 'N/A';
    console.log(`${status} [${count}] ${keyword.padEnd(30)} score:${String(data.keyword_score).padStart(3)} comp:${String(data.competing_listings).padStart(8)} conv:${(data.avg_conversion_rate*100).toFixed(1)}% price:${priceStr}`);

    // 500ms between requests
    await new Promise(r => setTimeout(r, 500));
  }

  const total = await DB.query("SELECT COUNT(*) FROM research_keywords_raw WHERE source='alura'");
  console.log(`\n✅ Done! Total Alura keywords in DB: ${total.rows[0].count} | Success: ${count} | Errors: ${errors}`);
  await DB.end();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  DB.end().catch(() => {});
});
