const { chromium } = require('playwright');
const { Client } = require('pg');
const https = require('https');
const fs = require('fs');

const API_BASE = 'alura-api-3yk57ena2a-uc.a.run.app';
const DB = { host: 'localhost', port: 5432, database: 'profitly', user: 'profitly', password: 'profitly123' };

// 500+ keywords focused on HIGH-TICKET, NON-PERSONALIZED Etsy niches ($50-$1000+)
const ALL_KEYWORDS = [
  // ═══════════════════════════════════════════════
  // FURNITURE & HOME - $100-$2000
  // ═══════════════════════════════════════════════
  'floating shelf', 'wall shelf', 'bookshelf', 'wooden shelf',
  'floating shelves set', 'corner shelf', 'ladder shelf', 'pipe shelf',
  'coffee table', 'side table', 'end table', 'nightstand',
  'farmhouse table', 'dining table', 'reclaimed wood table', 'live edge table',
  'wooden bench', 'entryway bench', 'storage bench', 'bed bench',
  'tv stand', 'media console', 'entertainment center',
  'bookcase', 'wooden bookcase', 'industrial bookcase',
  'kitchen island', 'butcher block', 'wooden kitchen island',
  'bar cart', 'wine rack', 'wine cabinet',
  'plant stand', 'plant shelf', 'plant ladder',
  'mirror', 'round mirror', 'arch mirror', 'boho mirror',
  'wall mirror', 'decorative mirror', 'vintage mirror',
  'coat rack', 'hat rack', 'entryway organizer',
  'murphy bed', 'loft bed', 'platform bed frame',
  'headboard', 'wooden headboard', 'upholstered headboard',
  'ottoman', 'storage ottoman', 'pouf',

  // ═══════════════════════════════════════════════
  // LARGE WALL ART & CANVAS - $50-$500
  // ═══════════════════════════════════════════════
  'large wall art', 'oversized wall art', 'canvas wall art',
  'framed wall art', 'canvas print', 'large canvas print',
  'abstract painting', 'original painting', 'acrylic painting',
  'oil painting', 'watercolor painting', 'large abstract art',
  'triptych wall art', 'set of 3 prints', 'gallery wall set',
  'black and white photography', 'fine art photography', 'nature photography print',
  'landscape painting', 'seascape painting', 'mountain painting',
  'botanical art print', 'large botanical print', 'vintage botanical',
  'celestial art', 'moon phase art', 'constellation art',
  'tapestry', 'large tapestry', 'woven tapestry',
  'metal wall art', 'wood wall art', 'wood slice art',
  '3d wall art', 'shadow box', 'wall sculpture',
  'neon sign', 'led neon sign', 'neon light',
  'string lights art', 'light up sign',
  'stained glass panel', 'stained glass art',
  'mosaic art', 'tile art', 'ceramic wall art',

  // ═══════════════════════════════════════════════
  // HANDMADE POTTERY & CERAMICS - $30-$300
  // ═══════════════════════════════════════════════
  'handmade pottery', 'ceramic mug', 'handmade mug', 'pottery mug',
  'ceramic vase', 'handmade vase', 'pottery vase',
  'ceramic bowl', 'handmade bowl', 'pottery bowl',
  'ceramic planter', 'handmade planter', 'ceramic pot',
  'ceramic plate', 'handmade plate', 'pottery plate',
  'ceramic pitcher', 'ceramic teapot', 'ceramic set',
  'stoneware mug', 'stoneware bowl', 'stoneware vase',
  'raku pottery', 'wheel thrown pottery', 'hand built pottery',
  'ceramic sculpture', 'clay sculpture', 'pottery sculpture',
  'salt fired pottery', 'wood fired pottery',
  'ceramic jewelry', 'ceramic pendant', 'ceramic earrings',
  'terracotta pot', 'terracotta planter', 'terracotta decor',

  // ═══════════════════════════════════════════════
  // MACRAME & FIBER ARTS - $50-$500
  // ═══════════════════════════════════════════════
  'large macrame wall hanging', 'macrame curtain', 'macrame room divider',
  'macrame headboard', 'macrame canopy', 'macrame arch',
  'macrame chair', 'macrame swing chair', 'hanging chair',
  'macrame bag', 'macrame purse', 'macrame tote',
  'woven blanket', 'handwoven blanket', 'throw blanket',
  'tapestry weaving', 'fiber art', 'textile art',
  'crochet blanket', 'chunky knit blanket', 'merino wool blanket',
  'wall weaving', 'boho wall hanging', 'woven wall decor',
  'macrame plant hanger', 'hanging planter', 'plant hanger set',
  'rope light', 'macrame lampshade', 'macrame pendant light',
  'hammock', 'cotton hammock', 'rope hammock',

  // ═══════════════════════════════════════════════
  // CRYSTALS & GEMSTONES - $20-$500
  // ═══════════════════════════════════════════════
  'raw crystal', 'crystal cluster', 'amethyst cluster',
  'amethyst geode', 'quartz crystal', 'rose quartz',
  'selenite lamp', 'crystal lamp', 'himalayan salt lamp',
  'crystal set', 'healing crystals', 'crystal collection',
  'large amethyst', 'large crystal', 'specimen crystal',
  'crystal sphere', 'crystal ball', 'obsidian sphere',
  'crystal tower', 'crystal point', 'selenite tower',
  'crystal bowl', 'singing bowl', 'tibetan singing bowl',
  'orgonite', 'crystal grid', 'crystal altar set',
  'gemstone necklace', 'crystal pendant', 'raw crystal ring',
  'labradorite', 'moonstone ring', 'opal ring',
  'turquoise ring', 'turquoise necklace', 'native american jewelry',
  'amber jewelry', 'amber necklace', 'baltic amber',

  // ═══════════════════════════════════════════════
  // FINE JEWELRY - $50-$1000+
  // ═══════════════════════════════════════════════
  'gold ring', 'solid gold ring', '14k gold ring',
  'diamond ring', 'engagement ring', 'wedding band',
  'gold necklace', 'gold chain necklace', 'layered necklace',
  'silver bracelet', 'gold bracelet', 'cuff bracelet',
  'statement ring', 'cocktail ring', 'gemstone ring',
  'art deco ring', 'vintage ring', 'antique ring',
  'handmade ring', 'forged ring', 'blacksmith ring',
  'mens ring', 'mens jewelry', 'mens bracelet',
  'silver ring set', 'ring stack', 'midi rings',
  'choker necklace', 'collar necklace', 'statement necklace',
  'locket necklace', 'photo locket', 'heart locket',
  'tennis bracelet', 'link bracelet', 'chain bracelet',
  'anklet', 'gold anklet', 'dainty anklet',

  // ═══════════════════════════════════════════════
  // LEATHER GOODS - $50-$500
  // ═══════════════════════════════════════════════
  'leather bag', 'leather tote bag', 'leather handbag',
  'leather backpack', 'leather laptop bag', 'leather briefcase',
  'leather wallet', 'mens leather wallet', 'bifold wallet',
  'leather belt', 'handmade leather belt', 'tooled leather belt',
  'leather journal', 'leather notebook', 'leather sketchbook',
  'leather camera strap', 'leather watch strap', 'leather band',
  'leather apron', 'leather tool roll', 'leather pouch',
  'leather crossbody bag', 'leather shoulder bag', 'leather clutch',
  'leather phone case', 'leather card holder', 'leather organizer',
  'vegan leather bag', 'cork bag', 'cork wallet',

  // ═══════════════════════════════════════════════
  // WOODWORKING - $50-$1000+
  // ═══════════════════════════════════════════════
  'cutting board', 'wooden cutting board', 'charcuterie board',
  'serving board', 'cheese board', 'bread board',
  'wooden tray', 'decorative tray', 'serving tray',
  'wooden bowl', 'turned wood bowl', 'fruit bowl',
  'wooden box', 'wooden storage box', 'keepsake box',
  'wood sign', 'rustic wood sign', 'farmhouse sign',
  'wooden clock', 'wall clock', 'rustic clock',
  'wooden toys', 'wooden puzzle', 'wooden game',
  'chess set', 'wooden chess set', 'handmade chess set',
  'lazy susan', 'turntable tray', 'rotating tray',
  'wooden utensils', 'wooden spoon set', 'kitchen utensil set',
  'butcher block cutting board', 'end grain cutting board',
  'knife block', 'wooden knife holder', 'magnetic knife strip',
  'floating bed frame', 'wood bed frame', 'platform bed',

  // ═══════════════════════════════════════════════
  // LIGHTING - $50-$500
  // ═══════════════════════════════════════════════
  'pendant light', 'hanging pendant light', 'rattan pendant light',
  'wicker pendant light', 'bamboo pendant light', 'boho pendant light',
  'chandelier', 'boho chandelier', 'rattan chandelier',
  'table lamp', 'bedside lamp', 'ceramic table lamp',
  'floor lamp', 'arc floor lamp', 'tripod floor lamp',
  'wall sconce', 'wall light', 'boho wall sconce',
  'string lights', 'fairy lights', 'globe string lights',
  'edison bulb lamp', 'industrial lamp', 'pipe lamp',
  'driftwood lamp', 'wood lamp', 'natural lamp',
  'crystal lamp', 'selenite lamp', 'geode lamp',
  'salt lamp', 'himalayan lamp', 'natural salt lamp',
  'mushroom lamp', 'night light', 'led night light',

  // ═══════════════════════════════════════════════
  // RUGS & TEXTILES - $50-$1000+
  // ═══════════════════════════════════════════════
  'area rug', 'boho rug', 'vintage rug',
  'moroccan rug', 'kilim rug', 'berber rug',
  'wool rug', 'handwoven rug', 'hand knotted rug',
  'jute rug', 'natural fiber rug', 'seagrass rug',
  'bathroom rug', 'kitchen rug', 'runner rug',
  'round rug', 'sheepskin rug', 'cowhide rug',
  'tapestry rug', 'aztec rug', 'tribal rug',
  'outdoor rug', 'porch rug', 'patio rug',
  'yoga mat', 'cork yoga mat', 'natural rubber mat',
  'meditation cushion', 'floor cushion', 'zafu cushion',
  'throw pillow', 'decorative pillow', 'lumbar pillow',
  'pillow cover', 'linen pillow cover', 'velvet pillow',
  'blanket', 'throw blanket', 'sherpa blanket',

  // ═══════════════════════════════════════════════
  // PLANTS & TERRARIUMS - $30-$300
  // ═══════════════════════════════════════════════
  'terrarium', 'glass terrarium', 'geometric terrarium',
  'succulent terrarium', 'moss terrarium', 'closed terrarium',
  'air plant holder', 'air plant display', 'tillandsia',
  'bonsai tree', 'live bonsai', 'bonsai starter kit',
  'kokedama', 'moss ball', 'string garden',
  'hanging planter', 'wall planter', 'vertical garden',
  'window box', 'herb garden kit', 'indoor garden kit',
  'hydroponic kit', 'grow kit', 'mushroom grow kit',
  'succulent arrangement', 'cactus arrangement', 'plant arrangement',
  'pressed flower art', 'dried flower arrangement', 'dried flowers',
  'flower crown', 'dried flower wreath', 'eucalyptus wreath',

  // ═══════════════════════════════════════════════
  // MUSICAL INSTRUMENTS - $50-$2000
  // ═══════════════════════════════════════════════
  'handpan drum', 'tongue drum', 'steel tongue drum',
  'kalimba', 'thumb piano', 'mbira',
  'ukulele', 'handmade ukulele',
  'drums', 'djembe drum', 'bongo drums',
  'guitar strap', 'leather guitar strap', 'handmade guitar strap',
  'ocarina', 'clay ocarina', 'ceramic ocarina',
  'rain stick', 'shaker instrument', 'percussion',
  'wind chime', 'metal wind chime', 'bamboo wind chime',
  'singing bowl', 'crystal singing bowl', 'quartz singing bowl',
  'harp', 'lap harp', 'small harp',

  // ═══════════════════════════════════════════════
  // ELECTRONICS & TECH ACCESSORIES - $50-$500
  // ═══════════════════════════════════════════════
  'mechanical keyboard', 'handmade keyboard',
  'keyboard kit', 'keyboard case', 'wooden keyboard',
  'phone stand', 'wooden phone stand', 'desk organizer',
  'cable management', 'cable organizer', 'desk accessories',
  'laptop stand', 'wood laptop stand', 'bamboo laptop stand',
  'monitor stand', 'wooden monitor stand', 'desk riser',
  'mouse pad', 'large mouse pad', 'desk mat',
  'cable clip', 'cable holder', 'cord organizer',
  'earbud case', 'airpod case', 'tech accessories',
  'power bank case', 'charging station', 'wireless charger',
  'camera bag', 'camera strap', 'lens pouch',

  // ═══════════════════════════════════════════════
  // BATH & SPA - $20-$200 (higher-end versions)
  // ═══════════════════════════════════════════════
  'bath set', 'luxury bath set', 'spa gift set',
  'organic soap set', 'natural soap bar', 'goat milk soap',
  'bath salts', 'himalayan bath salts', 'dead sea salt',
  'shower steamer', 'shower bomb', 'aromatherapy shower',
  'face serum', 'natural face serum', 'vitamin c serum',
  'face mask', 'clay face mask', 'sheet mask',
  'massage oil', 'body oil', 'aromatherapy oil',
  'diffuser', 'reed diffuser', 'essential oil diffuser',
  'candle set', 'luxury candle', 'soy candle set',
  'bath pillow', 'bath caddy', 'bamboo bath tray',
  'loofah', 'natural loofah', 'bath brush',
  'perfume', 'natural perfume', 'solid perfume',

  // ═══════════════════════════════════════════════
  // VINTAGE & ANTIQUE - $50-$5000
  // ═══════════════════════════════════════════════
  'vintage jewelry', 'antique jewelry', 'estate jewelry',
  'vintage brooch', 'vintage earrings', 'vintage necklace',
  'antique ring', 'vintage ring', 'art deco jewelry',
  'vintage watch', 'pocket watch', 'antique watch',
  'vintage map', 'antique map', 'old map print',
  'vintage poster', 'retro poster', 'vintage advertisement',
  'vintage camera', 'film camera', 'vintage polaroid',
  'vintage book', 'antique book', 'leather bound book',
  'vintage coin', 'rare coin', 'coin collection',
  'vintage toy', 'antique toy', 'vintage doll',
  'vintage lamp', 'antique lamp', 'vintage light',
  'vintage textile', 'antique fabric', 'vintage quilt',

  // ═══════════════════════════════════════════════
  // OUTDOOR & GARDEN - $50-$1000
  // ═══════════════════════════════════════════════
  'garden sculpture', 'garden art', 'yard art',
  'garden stake', 'metal garden art', 'wind spinner',
  'bird bath', 'garden fountain', 'outdoor fountain',
  'planter box', 'raised garden bed', 'wooden planter',
  'garden bench', 'wooden garden bench', 'outdoor bench',
  'fire pit', 'portable fire pit', 'chiminea',
  'outdoor lantern', 'garden lantern', 'solar lantern',
  'hammock stand', 'hammock chair', 'swing chair outdoor',
  'garden trellis', 'plant trellis', 'climbing plant support',
  'fairy garden', 'miniature garden', 'garden miniatures',
  'stepping stone', 'garden stone', 'concrete decor',

  // ═══════════════════════════════════════════════
  // ART SUPPLIES & CRAFT SUPPLIES - $30-$300
  // ═══════════════════════════════════════════════
  'paint set', 'watercolor set', 'acrylic paint set',
  'oil paint set', 'brush set', 'artist brush set',
  'sketchbook set', 'drawing kit', 'art kit',
  'calligraphy set', 'brush lettering kit', 'pen set',
  'linocut set', 'printmaking kit', 'block printing',
  'pottery clay', 'air dry clay', 'polymer clay set',
  'resin kit', 'epoxy resin kit', 'resin molds set',
  'embroidery kit', 'cross stitch kit', 'needlepoint kit',
  'knitting kit', 'crochet kit', 'yarn set',
  'weaving kit', 'loom kit', 'tapestry kit',
  'leather tooling kit', 'leather craft kit', 'leather tools',
  'woodcarving kit', 'carving tools', 'wood burning kit',

  // ═══════════════════════════════════════════════
  // BOOKS & EDUCATIONAL - $20-$200
  // ═══════════════════════════════════════════════
  'tarot card deck', 'oracle card deck', 'tarot set',
  'astrology book', 'witchcraft book', 'herbalism book',
  'cookbook', 'recipe book', 'cooking guide',
  'art book', 'coffee table book', 'photography book',
  'journal set', 'notebook set', 'planner set',
  'card game', 'board game', 'strategy game',
  'puzzle', 'wooden puzzle', 'jigsaw puzzle',
  'chess board', 'checkers set', 'backgammon set',
  'tarot cloth', 'altar cloth', 'crystal cloth',
  'incense set', 'incense holder', 'incense burner',
  'ritual kit', 'witchcraft kit', 'meditation kit',

  // ═══════════════════════════════════════════════
  // CLOTHING - $50-$300
  // ═══════════════════════════════════════════════
  'handmade coat', 'wool coat', 'alpaca coat',
  'handmade sweater', 'knit sweater', 'alpaca sweater',
  'handwoven scarf', 'silk scarf', 'cashmere scarf',
  'hand dyed clothing', 'natural dye shirt', 'indigo shirt',
  'linen dress', 'handmade linen dress', 'boho dress',
  'linen pants', 'wide leg pants', 'handmade pants',
  'kimono', 'silk kimono', 'haori jacket',
  'vintage denim jacket', 'hand painted jacket', 'embroidered jacket',
  'hand embroidered clothing', 'embroidered shirt', 'hand stitched',
  'felt hat', 'wool hat', 'handmade hat',
  'bucket hat', 'sun hat', 'straw hat',

  // ═══════════════════════════════════════════════
  // COLLECTIBLES & FIGURINES - $20-$500
  // ═══════════════════════════════════════════════
  'ceramic figurine', 'handmade figurine', 'clay figurine',
  'resin figurine', 'resin art', 'resin sculpture',
  'wooden figurine', 'carved figure', 'wood carving',
  'metal sculpture', 'bronze sculpture', 'steel sculpture',
  'glass art', 'fused glass', 'blown glass',
  'stained glass', 'stained glass window', 'sun catcher',
  'mosaic art', 'mosaic tile', 'glass mosaic',
  'anime figurine', 'fantasy figurine', 'dragon figurine',
  'fairy figurine', 'mushroom figurine', 'forest figurine',
  'gnome figurine', 'elf figurine', 'wizard figurine',

  // ═══════════════════════════════════════════════
  // WEDDING NON-PERSONALIZED - $50-$500
  // ═══════════════════════════════════════════════
  'wedding arch', 'wedding arch frame', 'gold wedding arch',
  'wedding backdrop', 'floral backdrop', 'greenery backdrop',
  'table centerpiece', 'wedding centerpiece', 'floral centerpiece',
  'wedding chandelier', 'hanging floral', 'ceiling installation',
  'wedding runner', 'aisle runner', 'flower petal runner',
  'flower wall', 'faux flower wall', 'wedding flower wall',
  'wedding candles', 'pillar candles', 'taper candles set',
  'wedding lanterns', 'mercury glass vase', 'wedding vases',
  'flower girl basket', 'ring bearer pillow', 'ring box',
  'wedding unity candle', 'unity ceremony kit', 'sand ceremony',

  // ═══════════════════════════════════════════════
  // PET PRODUCTS - $30-$200
  // ═══════════════════════════════════════════════
  'cat tree', 'cat tower', 'cat condo',
  'cat bed', 'cat cave', 'cat hammock',
  'dog bed', 'dog crate', 'dog crate cover',
  'dog harness', 'leather dog collar', 'dog leash',
  'pet stairs', 'dog ramp', 'pet ramp',
  'fish tank decor', 'aquarium plants', 'aquarium decoration',
  'bird cage', 'bird perch', 'bird toys',
  'rabbit hutch', 'guinea pig cage', 'hamster cage',
  'pet portrait painting', 'animal painting', 'pet art',
  'catnip toys', 'cat toy set', 'interactive cat toy',
  'dog toy set', 'chew toy', 'fetch toy',
];

async function getAuthToken() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

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

  // Try saved token first
  let token = null;
  try {
    token = fs.readFileSync('C:\\Windows\\Temp\\alura_token.txt', 'utf8').trim();
    console.log('✅ Token נטען מקובץ:', token.substring(0, 60) + '...');
  } catch(e) {
    token = await getAuthToken();
  }

  if (!token) { console.log('❌ אין token!'); process.exit(1); }

  // Connect to DB
  const db = new Client(DB);
  await db.connect();
  console.log('✅ DB connected');

  // Load previously scraped keywords
  let alreadyDone = new Set();
  try {
    const existing = await db.query("SELECT keyword FROM research_keywords_raw WHERE source='alura'");
    existing.rows.forEach(r => alreadyDone.add(r.keyword.toLowerCase()));
    console.log(`📦 כבר נסרקו ${alreadyDone.size} keywords`);
  } catch(e) {}

  const toScrape = ALL_KEYWORDS.filter(kw => !alreadyDone.has(kw.toLowerCase()));
  console.log(`\n🚀 צריך לסרוק: ${toScrape.length} keywords חדשים`);

  const results = [];
  let success = 0, failed = 0, rateLimited = 0;

  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < toScrape.length; i += BATCH_SIZE) {
    batches.push(toScrape.slice(i, i + BATCH_SIZE));
  }

  console.log(`📊 ${batches.length} batches (${BATCH_SIZE} במקביל)\n`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const pct = ((bi / batches.length) * 100).toFixed(1);
    console.log(`[${pct}%] Batch ${bi + 1}/${batches.length}: ${batch.join(', ')}`);

    const batchResults = await Promise.all(batch.map(async kw => {
      try {
        const res = await apiGet(token, kw);
        if (res.status === 200 && res.data && (res.data.results || res.data.result)) {
          if (!res.data.results && res.data.result) res.data.results = res.data.result;
          const r = res.data.results;
          const item = {
            keyword: r.keyword || kw,
            google_volume: r.google_volume_mo,
            google_change_qr: parseFloat(r.google_change_qr) || 0,
            google_change_yr: parseFloat(r.google_change_yr) || 0,
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
        const { item } = br;
        results.push(item);
        success++;
        const conv = item.avg_conversion ? (parseFloat(item.avg_conversion)*100).toFixed(1)+'%' : '';
        console.log(`  ✅ ${item.keyword.padEnd(35)} | score:${String(item.keyword_score||'').padStart(3)} | vol:${String(item.google_volume||'').padStart(8)} | comp:${String(item.competing_listings||'').padStart(8)} | $${item.avg_price||''}`);

        try {
          await db.query(`
            INSERT INTO research_keywords_raw (keyword, source, data, scraped_at)
            VALUES ($1, 'alura', $2::jsonb, NOW())
            ON CONFLICT (keyword, source, scraped_date) DO NOTHING
          `, [item.keyword, JSON.stringify(item)]);
        } catch(e) {}
      } else {
        failed++;
        console.log(`  ❌ ${br.kw}: ${br.error}`);
        if (br.error === 'rate_limited') {
          rateLimited++;
          console.log('  ⏸️ Rate limited! Waiting 15 seconds...');
          await new Promise(r => setTimeout(r, 15000));
        } else if (br.error === 'unauthorized') {
          needsRefresh = true;
        }
      }
    }

    // Refresh token if unauthorized
    if (needsRefresh) {
      console.log('🔄 Token פג תוקף, מחדש...');
      try {
        const newToken = await getAuthToken();
        if (newToken) {
          token = newToken;
          fs.writeFileSync('C:\\Windows\\Temp\\alura_token.txt', token, 'utf8');
          console.log('✅ Token חודש');
        }
      } catch(e) {
        console.log('❌ לא הצלחתי לחדש token:', e.message);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 300));

    // Save progress every 50 batches
    if (bi % 50 === 49) {
      fs.writeFileSync('C:\\Windows\\Temp\\highticket_progress.json', JSON.stringify(results, null, 2), 'utf8');
      console.log(`\n💾 Progress saved: ${success} keywords so far\n`);
    }
  }

  // Save all results
  fs.writeFileSync('C:\\Windows\\Temp\\highticket_keywords.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n✅ סיום! ${success} הצליחו, ${failed} נכשלו, ${rateLimited} rate limited`);
  console.log('📁 נשמר ב: C:\\Windows\\Temp\\highticket_keywords.json');

  // TOP 30 summary
  const sorted = results.sort((a, b) => {
    const scoreA = ((a.google_volume||0) / Math.max(a.competing_listings||1, 1)) * (a.keyword_score||0) * parseFloat(a.avg_conversion||0) * 1000;
    const scoreB = ((b.google_volume||0) / Math.max(b.competing_listings||1, 1)) * (b.keyword_score||0) * parseFloat(b.avg_conversion||0) * 1000;
    return scoreB - scoreA;
  });

  console.log('\n📊 TOP 30 HIGH-TICKET OPPORTUNITIES:');
  console.log('Keyword'.padEnd(35) + ' | Score | Volume   | Competition | AvgPrice | Conv%');
  console.log('-'.repeat(105));
  sorted.slice(0, 30).forEach(r => {
    const conv = r.avg_conversion ? (parseFloat(r.avg_conversion)*100).toFixed(1)+'%' : '';
    console.log(
      r.keyword.padEnd(35) + ' | ' +
      String(r.keyword_score||'').padStart(5) + ' | ' +
      String(r.google_volume||'').padStart(8) + ' | ' +
      String(r.competing_listings||'').padStart(11) + ' | ' +
      ('$'+String(r.avg_price||'')).padStart(8) + ' | ' +
      conv
    );
  });

  await db.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
