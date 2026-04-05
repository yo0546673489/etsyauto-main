/**
 * eRank Pro Scraper - 200 keywords/day limit
 * Per guide criteria: score, competition, avg_searches, trend stability
 */

const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');

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
  // Wedding (non-personalized)
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
  // Jewelry (high-price, non-personalized)
  'gold necklace','turquoise jewelry','gemstone ring',
  'crystal necklace','moonstone ring','statement earrings'
];

async function getErankData(keyword, headers) {
  try {
    const resp = await axios.get('https://members.erank.com/api/keyword-tool/stats', {
      params: { keyword, country: 'USA', marketplace: 'etsy' },
      headers,
      timeout: 15000
    });
    const d = resp.data;
    const trendData = d.search_trend_raw || {};
    const trendValues = Object.values(trendData);
    const trendAvg = trendValues.length > 0 ?
      Math.round(trendValues.reduce((a,b) => a+b, 0) / trendValues.length) : 0;

    return {
      keyword,
      source: 'erank',
      etsy_volume: d.avg_searches?.order_value || 0,
      avg_clicks: d.avg_clicks?.order_value || 0,
      ctr_pct: d.ctr?.order_value || 0,
      competition: d.competition?.order_value || 0,
      keyword_difficulty: d.keyword_difficulty?.order_value || 0,
      highly_converting: d.highly_converting || false,
      trend_12mo: (d.search_trend || []).slice(-12).map(t => t.value),
      trend_avg: trendAvg,
      trend_raw: trendData
    };
  } catch(e) {
    return { error: e.response?.status || e.message.substring(0, 50), keyword };
  }
}

async function refreshAuth() {
  const auth = JSON.parse(fs.readFileSync('C:/Windows/Temp/erank_auth.json', 'utf8'));
  const pageResp = await axios.get('https://members.erank.com/keyword-explorer', {
    headers: {
      'Cookie': auth.cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    maxRedirects: 5
  }).catch(e => ({ headers: {} }));

  const setCookies = pageResp.headers?.['set-cookie'] || [];
  let freshXsrf = auth.xsrf;
  let cookies = auth.cookies;

  for (const c of setCookies) {
    const xm = c.match(/XSRF-TOKEN=([^;]+)/);
    if (xm) freshXsrf = decodeURIComponent(xm[1]);
    const em = c.match(/er_sess_x=([^;]+)/);
    if (em) {
      const oldMatch = cookies.match(/er_sess_x=([^;& ]+)/);
      if (oldMatch) cookies = cookies.replace(oldMatch[1], em[1]);
    }
  }

  fs.writeFileSync('C:/Windows/Temp/erank_auth.json', JSON.stringify({ cookies, xsrf: freshXsrf }));

  return {
    'Cookie': cookies,
    'X-XSRF-TOKEN': freshXsrf,
    'X-User-Agent': 'erank-app/3.0',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
    'Referer': 'https://members.erank.com/keyword-explorer',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-mobile': '?0'
  };
}

async function saveToDb(data) {
  await DB.query(`
    INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (keyword, source, scraped_date)
    DO UPDATE SET data=$3, scraped_at=NOW()
  `, [data.keyword, 'erank', JSON.stringify(data)]);
}

async function main() {
  await DB.connect();
  console.log('Connected to DB');

  const existing = await DB.query("SELECT keyword FROM research_keywords_raw WHERE source='erank'");
  const done = new Set(existing.rows.map(r => r.keyword));
  const remaining = KEYWORDS_TO_SCRAPE.filter(k => !done.has(k));

  // Save 50 searches for later - use 150 now
  const toScrape = remaining.slice(0, 150);

  console.log(`Total: ${KEYWORDS_TO_SCRAPE.length} | Done: ${done.size} | Scraping: ${toScrape.length}/200 today`);

  let headers = await refreshAuth();
  let count = 0;
  let errors = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const keyword = toScrape[i];
    const data = await getErankData(keyword, headers);

    if (data.error) {
      consecutiveErrors++;
      console.log(`❌ [${i+1}/${toScrape.length}] ${keyword}: ${data.error}`);

      if (data.error === 403 || consecutiveErrors >= 3) {
        console.log('Refreshing auth...');
        try { headers = await refreshAuth(); } catch(e) { console.log('Refresh failed:', e.message); }
        consecutiveErrors = 0;
        await new Promise(r => setTimeout(r, 3000));
      }
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    consecutiveErrors = 0;
    count++;
    await saveToDb(data);

    // Guide criteria evaluation
    const passVol = data.etsy_volume >= 1000;
    const passComp = data.competition < 21000;
    const passCompOk = data.competition < 1000000;
    const status = passVol && passComp ? '🟢' : (passVol && passCompOk) ? '🟡' : '🔴';

    console.log(`${status} [${count}] ${keyword.padEnd(32)} vol:${String(data.etsy_volume).padStart(5)} comp:${String(data.competition).padStart(7)} ctr:${data.ctr_pct}% diff:${data.keyword_difficulty}`);

    // Rate limit
    await new Promise(r => setTimeout(r, 400));
  }

  const total = await DB.query("SELECT COUNT(*) FROM research_keywords_raw WHERE source='erank'");
  console.log(`\n✅ Done! Total eRank keywords in DB: ${total.rows[0].count}`);
  await DB.end();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  DB.end().catch(() => {});
});
