import { query, queryOne, withTransaction } from './database';
import { PoolClient } from 'pg';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Shop {
  id?: number;
  etsy_shop_id: string;
  shop_name: string;
  total_sales?: number;
  rating?: number;
  main_category?: string;
  country?: string;
  listing_count?: number;
  open_date?: string;
  sources?: string[];
}

export interface Product {
  id?: number;
  etsy_listing_id: number;
  shop_id?: number;
  title: string;
  price?: number;
  sales_estimate?: number;
  monthly_sales?: number;
  favorites?: number;
  reviews?: number;
  tags?: string[];
  category_path?: string;
  image_urls?: string[];
  is_digital?: boolean;
  sources?: string[];
}

export interface Niche {
  id?: number;
  niche_name: string;
  parent_niche?: string;
  category?: string;
  sub_niche_level?: number;
  keywords: string[];
  product_type?: string;
  price_range_min?: number;
  price_range_max?: number;
  target_audience?: string;
  production_method?: string;
  shop_examples?: string[];
  niche_score?: number;
  demand_score?: number;
  opportunity_score?: number;
  trend_score?: number;
  profitability_score?: number;
  recommendation?: string;
  ai_analysis?: string;
}

export interface Keyword {
  id?: number;
  keyword: string;
  niche_id?: number;
  erank_searches?: number;
  erank_competition?: string;
  erank_click_rate?: number;
  koalanda_search_score?: number;
  koalanda_trend?: string;
  alura_volume?: string;
  alura_competition?: number;
  avg_volume?: number;
  competition_score?: number;
  trend?: string;
  recommendation?: string;
}

// ─── Shops ────────────────────────────────────────────────────────────────────

export async function upsertShop(shop: Shop): Promise<number> {
  const rows = await query<{ id: number }>(`
    INSERT INTO research_shops
      (etsy_shop_id, shop_name, total_sales, rating, main_category, country, listing_count, open_date, sources, last_scraped_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (etsy_shop_id) DO UPDATE SET
      shop_name = EXCLUDED.shop_name,
      total_sales = EXCLUDED.total_sales,
      rating = EXCLUDED.rating,
      main_category = EXCLUDED.main_category,
      country = EXCLUDED.country,
      listing_count = EXCLUDED.listing_count,
      sources = EXCLUDED.sources,
      last_scraped_at = NOW()
    RETURNING id
  `, [
    shop.etsy_shop_id, shop.shop_name, shop.total_sales, shop.rating,
    shop.main_category, shop.country, shop.listing_count, shop.open_date,
    shop.sources
  ]);
  return rows[0].id;
}

export async function getShopByEtsyId(etsyShopId: string): Promise<Shop | null> {
  return queryOne<Shop>('SELECT * FROM research_shops WHERE etsy_shop_id = $1', [etsyShopId]);
}

export async function getRecentShops(limit = 50): Promise<Shop[]> {
  return query<Shop>('SELECT * FROM research_shops ORDER BY last_scraped_at DESC LIMIT $1', [limit]);
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function upsertProduct(product: Product): Promise<number> {
  const rows = await query<{ id: number }>(`
    INSERT INTO research_products
      (etsy_listing_id, shop_id, title, price, sales_estimate, monthly_sales, favorites, reviews, tags, category_path, image_urls, is_digital, sources)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (etsy_listing_id) DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      sales_estimate = EXCLUDED.sales_estimate,
      monthly_sales = EXCLUDED.monthly_sales,
      favorites = EXCLUDED.favorites,
      reviews = EXCLUDED.reviews,
      tags = EXCLUDED.tags,
      sources = EXCLUDED.sources,
      last_scraped_at = NOW()
    RETURNING id
  `, [
    product.etsy_listing_id, product.shop_id, product.title, product.price,
    product.sales_estimate, product.monthly_sales, product.favorites, product.reviews,
    product.tags, product.category_path, product.image_urls, product.is_digital,
    product.sources
  ]);
  return rows[0].id;
}

export async function getProductsByShop(shopId: number, limit = 30): Promise<Product[]> {
  return query<Product>(
    'SELECT * FROM research_products WHERE shop_id = $1 ORDER BY monthly_sales DESC NULLS LAST LIMIT $2',
    [shopId, limit]
  );
}

// ─── Niches ───────────────────────────────────────────────────────────────────

export async function upsertNiche(niche: Niche): Promise<number> {
  const rows = await query<{ id: number }>(`
    INSERT INTO research_niches
      (niche_name, parent_niche, category, sub_niche_level, keywords, product_type,
       price_range_min, price_range_max, target_audience, production_method, shop_examples,
       niche_score, demand_score, opportunity_score, trend_score, profitability_score,
       recommendation, ai_analysis, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
    ON CONFLICT (niche_name) DO UPDATE SET
      niche_score = EXCLUDED.niche_score,
      demand_score = EXCLUDED.demand_score,
      opportunity_score = EXCLUDED.opportunity_score,
      trend_score = EXCLUDED.trend_score,
      profitability_score = EXCLUDED.profitability_score,
      recommendation = EXCLUDED.recommendation,
      ai_analysis = EXCLUDED.ai_analysis,
      keywords = EXCLUDED.keywords,
      shop_examples = EXCLUDED.shop_examples,
      updated_at = NOW()
    RETURNING id
  `, [
    niche.niche_name, niche.parent_niche, niche.category, niche.sub_niche_level ?? 1,
    niche.keywords, niche.product_type, niche.price_range_min, niche.price_range_max,
    niche.target_audience, niche.production_method, niche.shop_examples,
    niche.niche_score ?? 0, niche.demand_score ?? 0, niche.opportunity_score ?? 0,
    niche.trend_score ?? 0, niche.profitability_score ?? 0,
    niche.recommendation, niche.ai_analysis
  ]);
  return rows[0].id;
}

export async function getTopNiches(limit = 20): Promise<Niche[]> {
  return query<Niche>(
    "SELECT * FROM research_niches WHERE is_active = true ORDER BY niche_score DESC LIMIT $1",
    [limit]
  );
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

export async function upsertKeyword(kw: Keyword): Promise<void> {
  await query(`
    INSERT INTO research_keywords
      (keyword, niche_id, erank_searches, erank_competition, erank_click_rate,
       koalanda_search_score, koalanda_trend, alura_volume, alura_competition,
       avg_volume, competition_score, trend, recommendation, last_updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (keyword) DO UPDATE SET
      erank_searches = COALESCE(EXCLUDED.erank_searches, research_keywords.erank_searches),
      erank_competition = COALESCE(EXCLUDED.erank_competition, research_keywords.erank_competition),
      erank_click_rate = COALESCE(EXCLUDED.erank_click_rate, research_keywords.erank_click_rate),
      koalanda_search_score = COALESCE(EXCLUDED.koalanda_search_score, research_keywords.koalanda_search_score),
      koalanda_trend = COALESCE(EXCLUDED.koalanda_trend, research_keywords.koalanda_trend),
      alura_volume = COALESCE(EXCLUDED.alura_volume, research_keywords.alura_volume),
      alura_competition = COALESCE(EXCLUDED.alura_competition, research_keywords.alura_competition),
      avg_volume = EXCLUDED.avg_volume,
      competition_score = EXCLUDED.competition_score,
      trend = EXCLUDED.trend,
      recommendation = EXCLUDED.recommendation,
      last_updated_at = NOW()
  `, [
    kw.keyword, kw.niche_id, kw.erank_searches, kw.erank_competition, kw.erank_click_rate,
    kw.koalanda_search_score, kw.koalanda_trend, kw.alura_volume, kw.alura_competition,
    kw.avg_volume, kw.competition_score, kw.trend, kw.recommendation
  ]);
}

export async function saveRawKeyword(keyword: string, source: string, data: object): Promise<void> {
  await query(`
    INSERT INTO research_keywords_raw (keyword, source, data)
    VALUES ($1, $2, $3)
    ON CONFLICT (keyword, source, scraped_date) DO UPDATE SET data = EXCLUDED.data
  `, [keyword, source, JSON.stringify(data)]);
}

// ─── Scrape Log ───────────────────────────────────────────────────────────────

export async function logScrape(
  tool: string,
  action: string,
  status: 'success' | 'failed' | 'blocked',
  itemsScraped: number,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  await query(
    'INSERT INTO research_scrape_log (tool, action, status, items_scraped, duration_ms, error_message) VALUES ($1,$2,$3,$4,$5,$6)',
    [tool, action, status, itemsScraped, durationMs, errorMessage]
  );
}

export async function getDailyUsage(tool: string): Promise<number> {
  const rows = await query<{ total: string }>(
    "SELECT SUM(items_scraped) as total FROM research_scrape_log WHERE tool = $1 AND created_at > NOW() - INTERVAL '24 hours' AND status = 'success'",
    [tool]
  );
  return parseInt(rows[0]?.total || '0');
}
