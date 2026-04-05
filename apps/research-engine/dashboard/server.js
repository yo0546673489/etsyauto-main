/**
 * Profitly Research Dashboard - Express Server
 */
const PROJ = 'C:\\Users\\Administrator\\Desktop\\\u05E7\u05DC\u05D5\u05D3\\\u05DE\u05D7\u05E7\u05E8';
process.chdir(PROJ);
require(PROJ + '\\node_modules\\dotenv').config({ path: PROJ + '\\.env' });

const express = require(PROJ + '\\node_modules\\express');
const { Pool } = require(PROJ + '\\node_modules\\pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'profitly', user: 'profitly', password: 'profitly123',
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Helper: load JSON files with fallback ──────────────────────────────────
function loadJSON(fpath) {
  try { return JSON.parse(fs.readFileSync(fpath, 'utf8')); } catch(e) { return []; }
}

// ── Estimated prices based on Etsy market knowledge ───────────────────────
const PRICE_ESTIMATES = {
  'murphy bed': 450, 'murphy bed hardware': 250, 'murphy bed kit': 300, 'murphy bed plans': 25,
  'loft bed': 350, 'platform bed frame': 280, 'bed frame': 200, 'headboard': 120,
  'upholstered headboard': 180, 'wooden headboard': 150, 'floating bed frame': 300,
  'tv stand': 180, 'entertainment center': 280, 'media console': 220, 'tv console': 200,
  'credenza': 350, 'sideboard': 300, 'buffet table': 280,
  'bookcase': 250, 'wooden bookcase': 220, 'bookshelf': 180, 'ladder shelf': 150,
  'floating shelf': 60, 'corner shelf': 80, 'wall shelf': 70, 'pipe shelf': 90,
  'coffee table': 220, 'side table': 120, 'end table': 100, 'nightstand': 130,
  'farmhouse table': 500, 'dining table': 600, 'live edge table': 800,
  'kitchen island': 400, 'butcher block': 180, 'wooden bench': 200,
  'storage bench': 180, 'entryway bench': 160, 'bed bench': 180,
  'bar cart': 180, 'wine rack': 120, 'wine cabinet': 280, 'wine storage': 200,
  'plant stand': 80, 'plant shelf': 70, 'ladder bookcase': 160,
  'hanging chair': 200, 'hammock': 120, 'rope hammock': 100, 'macrame hanging chair': 250,
  'round mirror': 180, 'arch mirror': 250, 'floor mirror': 300, 'wall mirror': 200,
  'oversized mirror': 350, 'sunburst mirror': 220, 'rattan mirror': 180,
  'himalayan salt lamp': 45, 'selenite lamp': 55, 'crystal lamp': 65,
  'singing bowl': 60, 'tibetan singing bowl': 80, 'crystal singing bowl': 120,
  'singing bowl set': 200, 'chakra singing bowl': 180,
  'pendant light': 120, 'chandelier': 280, 'rattan pendant light': 150,
  'boho chandelier': 250, 'floor lamp': 180, 'table lamp': 120,
  'ceramic table lamp': 160, 'crystal chandelier': 350,
  'area rug': 200, 'moroccan rug': 300, 'kilim rug': 250, 'wool rug': 350,
  'cowhide rug': 250, 'sheepskin rug': 180, 'jute rug': 120,
  'leather bag': 180, 'leather tote bag': 160, 'leather backpack': 200,
  'leather briefcase': 280, 'leather wallet': 80, 'leather journal': 90,
  'leather apron': 120, 'leather belt': 70, 'leather tool roll': 100,
  'astrology chart': 12, 'notion template': 10, 'tarot card deck': 35,
  'oracle card deck': 30, 'digital planner': 12,
  'cutting board': 60, 'charcuterie board': 80, 'wooden cutting board': 70,
  'butcher block cutting board': 120, 'end grain cutting board': 150,
  'cheese board': 70, 'serving board': 65, 'bread board': 50,
  'lazy susan': 50, 'wooden tray': 55, 'chess set': 120,
  'body scrub': 22, 'bath bomb': 18, 'lip balm': 12, 'handmade soap': 15,
  'beeswax candle': 24, 'bath set': 45, 'spa gift set': 55,
  'amethyst geode': 80, 'amethyst cluster': 60, 'crystal set': 45,
  'crystal sphere': 50, 'rose quartz': 40, 'orgonite': 35,
  'terrarium': 65, 'glass terrarium': 75, 'geometric terrarium': 80,
  'kokedama': 40, 'bonsai tree': 70, 'air plant display': 45,
  'stained glass': 120, 'stained glass panel': 180, 'sun catcher': 45,
  'resin art': 80, 'resin table': 400, 'epoxy table': 600,
  'macrame wall hanging': 90, 'large macrame wall hanging': 180,
  'macrame plant hanger': 30, 'hanging planter': 35, 'macrame bag': 70,
  'woven blanket': 120, 'chunky knit blanket': 150, 'throw blanket': 80,
  'gold ring': 180, 'silver ring': 80, 'diamond ring': 500,
  'engagement ring': 600, 'gold necklace': 150, 'bracelet': 60,
  'pearl necklace': 200, 'tennis bracelet': 280, 'anklet': 45,
  'cat tree': 150, 'cat tower': 130, 'dog bed': 120, 'dog crate': 200,
};

function estimatePrice(keyword) {
  const kw = keyword.toLowerCase();
  // Exact match
  if (PRICE_ESTIMATES[kw]) return PRICE_ESTIMATES[kw];
  // Partial match
  for (const [k, v] of Object.entries(PRICE_ESTIMATES)) {
    if (kw.includes(k) || k.includes(kw.split(' ')[0])) return v;
  }
  return null;
}

// ── API: All raw Alura keywords (combined from DB) ─────────────────────────
app.get('/api/raw-keywords', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT keyword, data, scraped_at
      FROM research_keywords_raw
      WHERE source = 'alura'
      ORDER BY (data->>'keyword_score')::float DESC NULLS LAST
    `);
    const rows = r.rows.map(row => {
      const d = { ...row.data, scraped_at: row.scraped_at };
      if (!d.avg_price_usd) d.avg_price_usd = estimatePrice(d.keyword);
      return d;
    });
    res.json(rows);
  } catch(e) {
    // Fallback to JSON files
    const old = loadJSON('C:\\Windows\\Temp\\alura_keywords.json');
    const newData = loadJSON('C:\\Windows\\Temp\\highticket_keywords.json');
    const prog = loadJSON('C:\\Windows\\Temp\\highticket_progress.json');
    const all = [...old, ...newData, ...prog];
    const seen = new Set();
    const unique = all.filter(r => {
      if (seen.has(r.keyword)) return false;
      seen.add(r.keyword);
      return true;
    });
    res.json(unique);
  }
});

// ── API: Niche groups (computed from raw data) ─────────────────────────────
app.get('/api/niche-groups', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT keyword, data FROM research_keywords_raw WHERE source='alura'
    `);
    const rows = r.rows.map(row => row.data);

    // Group into niches
    const niches = computeNiches(rows);
    res.json(niches);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Top opportunities ──────────────────────────────────────────────────
app.get('/api/top-opportunities', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT data FROM research_keywords_raw
      WHERE source='alura'
        AND (data->>'keyword_score')::float >= 70
        AND (data->>'competing_listings')::float < 500000
        AND data->>'avg_price' IS NOT NULL
      ORDER BY (
        (data->>'google_volume')::float /
        NULLIF((data->>'competing_listings')::float, 0) *
        (data->>'keyword_score')::float *
        (data->>'avg_conversion')::float
      ) DESC NULLS LAST
      LIMIT 50
    `);
    res.json(r.rows.map(r => r.data));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Stats ─────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) as total_keywords,
        COUNT(CASE WHEN (data->>'keyword_score')::float >= 90 THEN 1 END) as score_90plus,
        COUNT(CASE WHEN (data->>'keyword_score')::float >= 80 THEN 1 END) as score_80plus,
        AVG((data->>'keyword_score')::float)::int as avg_score,
        MAX((data->>'avg_price_usd')::float) as max_price,
        AVG((data->>'avg_price_usd')::float)::int as avg_price,
        COUNT(CASE WHEN (data->>'avg_price_usd')::float > 100 THEN 1 END) as high_ticket_count,
        SUM((data->>'total_sales')::float) as total_etsy_sales,
        MAX(scraped_at) as last_updated
      FROM research_keywords_raw WHERE source='alura'
    `);
    // Check scraper status from progress files
    let scraperStatus = 'idle';
    for (const f of ['highticket_progress.json','fulldata_progress.json']) {
      try {
        const prog = loadJSON(`C:\\Windows\\Temp\\${f}`);
        if (prog.length > 0) { scraperStatus = `running (${prog.length} keywords done)`; break; }
      } catch(e) {}
    }
    res.json({ ...r.rows[0], scraperStatus });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────
function computeNiches(rows) {
  const NICHE_MAP = {
    'Furniture & Home': ['shelf','table','bench','bookcase','cabinet','mirror','rack','stand','ottoman','headboard','bed frame'],
    'Large Wall Art': ['wall art','canvas','painting','print','poster','tapestry','metal wall','wood wall','neon sign','stained glass'],
    'Pottery & Ceramics': ['pottery','ceramic','stoneware','clay','raku','terracotta','porcelain'],
    'Macrame & Fiber': ['macrame','woven','weaving','fiber art','tapestry','hammock','rope'],
    'Crystals & Gemstones': ['crystal','amethyst','quartz','selenite','obsidian','gemstone','geode','orgonite'],
    'Fine Jewelry': ['gold ring','silver ring','diamond','engagement','bracelet','anklet','necklace','locket'],
    'Leather Goods': ['leather bag','leather tote','leather backpack','leather wallet','leather belt','leather journal'],
    'Woodworking': ['cutting board','charcuterie','wooden tray','wooden bowl','wooden box','wood sign','chess set','butcher block'],
    'Lighting': ['pendant light','chandelier','table lamp','floor lamp','wall sconce','neon','salt lamp','mushroom lamp'],
    'Rugs & Textiles': ['rug','blanket','pillow','throw','cushion','yoga mat'],
    'Plants & Garden': ['terrarium','bonsai','kokedama','succulent','planter','garden','wreath'],
    'Musical Instruments': ['handpan','tongue drum','kalimba','ukulele','drum','singing bowl','wind chime'],
    'Tech Accessories': ['mechanical keyboard','laptop stand','mouse pad','desk mat','monitor stand','camera'],
    'Bath & Spa': ['bath set','spa','soap set','bath salt','shower steamer','candle set','diffuser','perfume'],
    'Vintage & Antique': ['vintage','antique','estate jewelry','retro','old map'],
    'Outdoor & Garden': ['garden sculpture','bird bath','fountain','fire pit','hammock','stepping stone'],
    'Art & Collectibles': ['sculpture','glass art','fused glass','mosaic','figurine','resin art'],
    'Digital Products': ['notion template','digital planner','svg','printable','canva template','astrology chart'],
    'Wedding Decor': ['wedding arch','wedding backdrop','centerpiece','flower wall','wedding candle'],
    'Pet Products': ['cat tree','cat bed','dog bed','fish tank','cat toy','dog toy'],
  };

  const nicheData = {};
  for (const [niche, keywords] of Object.entries(NICHE_MAP)) {
    const matching = rows.filter(r => {
      const kw = (r.keyword || '').toLowerCase();
      return keywords.some(k => kw.includes(k));
    });
    if (matching.length === 0) continue;

    const avgScore = matching.reduce((s,r) => s + (r.keyword_score||0), 0) / matching.length;
    const maxVol = Math.max(...matching.map(r => r.google_volume || 0));
    const minComp = Math.min(...matching.filter(r => r.competing_listings > 0).map(r => r.competing_listings || Infinity));
    const avgPrice = matching.filter(r => r.avg_price).reduce((s,r) => s + parseFloat(r.avg_price||0), 0) / matching.filter(r=>r.avg_price).length;
    const avgConv = matching.filter(r => r.avg_conversion).reduce((s,r) => s + parseFloat(r.avg_conversion||0), 0) / matching.filter(r=>r.avg_conversion).length;

    // Best keyword in niche
    const best = matching.sort((a,b) => {
      const oA = ((a.google_volume||0) / Math.max(a.competing_listings||1,1)) * (a.keyword_score||0) * parseFloat(a.avg_conversion||0) * 1000;
      const oB = ((b.google_volume||0) / Math.max(b.competing_listings||1,1)) * (b.keyword_score||0) * parseFloat(b.avg_conversion||0) * 1000;
      return oB - oA;
    });

    const opportunityScore = ((maxVol / Math.max(minComp, 1)) * avgScore * avgConv * 1000).toFixed(0);

    nicheData[niche] = {
      niche,
      keywords: matching.length,
      avgScore: avgScore.toFixed(1),
      maxVolume: maxVol,
      minCompetition: minComp === Infinity ? null : minComp,
      avgPrice: avgPrice ? avgPrice.toFixed(0) : null,
      avgConversion: avgConv ? (avgConv * 100).toFixed(1) : null,
      opportunityScore: parseInt(opportunityScore),
      topKeywords: best.slice(0, 5).map(r => ({
        keyword: r.keyword,
        score: r.keyword_score,
        volume: r.google_volume,
        competition: r.competing_listings,
        avgPrice: r.avg_price,
        qTrend: r.google_change_qr,
        yTrend: r.google_change_yr,
      }))
    };
  }

  return Object.values(nicheData).sort((a,b) => b.opportunityScore - a.opportunityScore);
}

app.listen(PORT, () => {
  console.log(`\n🚀 Profitly Research Dashboard: http://localhost:${PORT}\n`);
});
