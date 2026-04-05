import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { createModuleLogger } from '../utils/logger';
import { testConnection } from '../storage/database';
import { ApifyClient } from '../api-clients/apify-client';
import { ERankScraper } from '../scrapers/erank';
import { KoalandaScraper } from '../scrapers/koalanda';
import { AluraScraper, EHuntScraper } from '../scrapers/other-scrapers';
import { upsertShop, upsertProduct, getProductsByShop, getDailyUsage, getRecentShops, getTopNiches } from '../storage/models';
import { detectNichesFromShopBatch } from '../processors/niche-detector';
import { mergeAndSaveKeyword } from '../processors/data-merger';
import { scoreAllUnscored } from '../processors/niche-scorer';

const log = createModuleLogger('scheduler');

const categoriesConfig = require('../../config/categories.json');
const toolsConfig = require('../../config/tools.json');

// ─── Phase 1: Discovery ───────────────────────────────────────────────────────

export async function phase1_discovery() {
  log.info('=== PHASE 1: Shop Discovery ===');

  // Etsy API disabled by user request — using scrapers only

  // 1a. Koalanda — Top Shops
  const koalanda = new KoalandaScraper();
  try {
    await koalanda.connect();
    const shops = await koalanda.getTopShops();
    for (const shop of shops) {
      await upsertShop({ ...shop, sources: ['koalanda'] });
    }
    log.info(`Koalanda: saved ${shops.length} top shops`);
  } catch (err: any) {
    log.error(`Phase 1 Koalanda error: ${err.message}`);
  } finally {
    await koalanda.disconnect();
  }

  // 1c. eRank — Top Shops
  const erank = new ERankScraper();
  try {
    await erank.connect();
    const shops = await erank.getTopShops();
    for (const shop of shops) {
      await upsertShop({ ...shop, sources: ['erank'] });
    }
    log.info(`eRank: saved ${shops.length} top shops`);
  } catch (err: any) {
    log.error(`Phase 1 eRank error: ${err.message}`);
  } finally {
    await erank.disconnect();
  }
}

// ─── Phase 2: Product Analysis ────────────────────────────────────────────────

export async function phase2_analysis() {
  log.info('=== PHASE 2: Product Analysis ===');

  // Get top 20 recently discovered shops
  const shops = await getRecentShops(20);
  const apify = new ApifyClient();

  const shopBatchForAI: Array<{ shopName: string; products: any[] }> = [];

  for (const shop of shops) {
    try {
      // Use Apify to scrape products (no Etsy API needed)
      const apifyProducts = await apify.scrapeShop(`https://www.etsy.com/shop/${shop.etsy_shop_id}`, 30);
      const products = [];

      for (const ap of apifyProducts) {
        await upsertProduct({
          etsy_listing_id: parseInt(ap.id) || 0,
          shop_id: shop.id,
          title: ap.title,
          price: ap.price,
          favorites: ap.numFavorers,
          tags: ap.tags,
          is_digital: ap.isDigital,
          sources: ['apify']
        });
        products.push({
          title: ap.title,
          price: ap.price,
          tags: ap.tags,
          is_digital: ap.isDigital,
          favorites: ap.numFavorers
        });
      }

      if (products.length > 0) {
        shopBatchForAI.push({ shopName: shop.shop_name, products });
      }
    } catch (err: any) {
      log.error(`Phase 2 error for shop "${shop.shop_name}": ${err.message}`);
    }
  }

  // Run AI niche detection on batch
  if (shopBatchForAI.length > 0) {
    await detectNichesFromShopBatch(shopBatchForAI);
  }
}

// ─── Phase 3: Keyword Research ────────────────────────────────────────────────

export async function phase3_keywords() {
  log.info('=== PHASE 3: Keyword Research ===');

  // Get keywords from all active niches
  const niches = await getTopNiches(10);
  const allKeywords: string[] = [];
  for (const niche of niches) {
    allKeywords.push(...(niche.keywords || []).slice(0, 5));
  }
  const uniqueKeywords = [...new Set(allKeywords)].slice(0, 30);

  const erank = new ERankScraper();
  const koalanda = new KoalandaScraper();
  const alura = new AluraScraper();

  try {
    await erank.connect();
    await koalanda.connect();
    await alura.connect();

    for (const keyword of uniqueKeywords) {
      const [erankData, koalandaData, aluraData] = await Promise.allSettled([
        erank.searchKeyword(keyword),
        koalanda.searchKeyword(keyword),
        alura.searchKeyword(keyword)
      ]);

      await mergeAndSaveKeyword({
        keyword,
        erank: erankData.status === 'fulfilled' ? {
          searches: erankData.value.searches,
          competition: erankData.value.competition,
          click_rate: erankData.value.click_rate
        } : undefined,
        koalanda: koalandaData.status === 'fulfilled' ? {
          search_score: koalandaData.value.score,
          trend: koalandaData.value.trend
        } : undefined,
        alura: aluraData.status === 'fulfilled' ? {
          volume: aluraData.value.raw?.volume
        } : undefined
      });

      // Respect daily limits with a pause
      await new Promise(r => setTimeout(r, 60000)); // 1 min between searches
    }
  } finally {
    await erank.disconnect();
    await koalanda.disconnect();
    await alura.disconnect();
  }
}

// ─── Phase 4: Scoring & AI ────────────────────────────────────────────────────

export async function phase4_scoring() {
  log.info('=== PHASE 4: Scoring & AI Analysis ===');
  await scoreAllUnscored();
  log.info('Phase 4 complete');
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────

async function main() {
  const connected = await testConnection();
  if (!connected) {
    log.error('Cannot connect to database. Exiting.');
    process.exit(1);
  }

  log.info('Research Engine Scheduler started');

  // Phase 1: 06:00 — Shop Discovery
  cron.schedule('0 6 * * *', async () => {
    try { await phase1_discovery(); }
    catch (err: any) { log.error(`Phase 1 crashed: ${err.message}`); }
  });

  // Phase 2: 10:00 — Product Analysis
  cron.schedule('0 10 * * *', async () => {
    try { await phase2_analysis(); }
    catch (err: any) { log.error(`Phase 2 crashed: ${err.message}`); }
  });

  // Phase 3: 15:00 — Keywords
  cron.schedule('0 15 * * *', async () => {
    try { await phase3_keywords(); }
    catch (err: any) { log.error(`Phase 3 crashed: ${err.message}`); }
  });

  // Phase 4: 20:00 — Scoring
  cron.schedule('0 20 * * *', async () => {
    try { await phase4_scoring(); }
    catch (err: any) { log.error(`Phase 4 crashed: ${err.message}`); }
  });

  log.info('Cron jobs registered. Scheduler is running...');
  log.info('  06:00 — Phase 1: Shop Discovery');
  log.info('  10:00 — Phase 2: Product Analysis');
  log.info('  15:00 — Phase 3: Keyword Research');
  log.info('  20:00 — Phase 4: Scoring & AI');
}

// Only auto-start when run directly (not when imported as a module)
if (require.main === module) {
  main();
}
