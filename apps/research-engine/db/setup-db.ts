import dotenv from 'dotenv';
dotenv.config();

import { query, testConnection } from './database';
import { createModuleLogger } from '../utils/logger';

const log = createModuleLogger('setup-db');

const CREATE_TABLES = `
-- Shops discovered
CREATE TABLE IF NOT EXISTS research_shops (
    id SERIAL PRIMARY KEY,
    etsy_shop_id VARCHAR(100) UNIQUE NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    total_sales INT,
    rating DECIMAL(3,2),
    main_category VARCHAR(100),
    country VARCHAR(10),
    listing_count INT,
    open_date DATE,
    sources TEXT[],
    last_scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Top products
CREATE TABLE IF NOT EXISTS research_products (
    id SERIAL PRIMARY KEY,
    etsy_listing_id BIGINT UNIQUE NOT NULL,
    shop_id INT REFERENCES research_shops(id),
    title TEXT NOT NULL,
    price DECIMAL(10,2),
    sales_estimate INT,
    monthly_sales INT,
    favorites INT,
    reviews INT,
    tags TEXT[],
    category_path TEXT,
    image_urls TEXT[],
    is_digital BOOLEAN DEFAULT FALSE,
    sources TEXT[],
    last_scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Identified niches
CREATE TABLE IF NOT EXISTS research_niches (
    id SERIAL PRIMARY KEY,
    niche_name VARCHAR(255) NOT NULL,
    parent_niche VARCHAR(255),
    category VARCHAR(100),
    sub_niche_level INT DEFAULT 1,
    keywords TEXT[] NOT NULL,
    product_type VARCHAR(50),
    price_range_min DECIMAL(10,2),
    price_range_max DECIMAL(10,2),
    target_audience TEXT,
    production_method TEXT,
    shop_examples TEXT[],
    niche_score INT DEFAULT 0,
    demand_score INT DEFAULT 0,
    opportunity_score INT DEFAULT 0,
    trend_score INT DEFAULT 0,
    profitability_score INT DEFAULT 0,
    recommendation VARCHAR(20),
    ai_analysis TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_validated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Raw keyword data
CREATE TABLE IF NOT EXISTS research_keywords_raw (
    id SERIAL PRIMARY KEY,
    keyword TEXT NOT NULL,
    source VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    scraped_at TIMESTAMP DEFAULT NOW(),
    scraped_date DATE GENERATED ALWAYS AS (CAST(scraped_at AS DATE)) STORED,
    UNIQUE(keyword, source, scraped_date)
);

-- Merged keyword data
CREATE TABLE IF NOT EXISTS research_keywords (
    id SERIAL PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    niche_id INT REFERENCES research_niches(id),
    erank_searches INT,
    erank_competition VARCHAR(20),
    erank_click_rate DECIMAL(3,2),
    koalanda_search_score INT,
    koalanda_trend VARCHAR(20),
    alura_volume VARCHAR(20),
    alura_competition DECIMAL(3,2),
    avg_volume INT,
    competition_score DECIMAL(5,2),
    trend VARCHAR(20),
    recommendation VARCHAR(20),
    last_updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Scrape activity log
CREATE TABLE IF NOT EXISTS research_scrape_log (
    id SERIAL PRIMARY KEY,
    tool VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    items_scraped INT DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Manual search queries
CREATE TABLE IF NOT EXISTS research_manual_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    query_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    results JSONB,
    requested_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_niches_score ON research_niches(niche_score DESC);
CREATE INDEX IF NOT EXISTS idx_niches_recommendation ON research_niches(recommendation);
CREATE INDEX IF NOT EXISTS idx_niches_category ON research_niches(category);
CREATE INDEX IF NOT EXISTS idx_products_shop ON research_products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_sales ON research_products(monthly_sales DESC);
CREATE INDEX IF NOT EXISTS idx_keywords_niche ON research_keywords(niche_id);
CREATE INDEX IF NOT EXISTS idx_keywords_trend ON research_keywords(trend);
CREATE INDEX IF NOT EXISTS idx_scrape_log_tool ON research_scrape_log(tool, created_at);
`;

async function setup() {
  log.info('Starting database setup...');

  const connected = await testConnection();
  if (!connected) {
    log.error('Cannot connect to database. Check your .env settings.');
    process.exit(1);
  }

  try {
    await query(CREATE_TABLES);
    log.info('All tables created successfully');
  } catch (err: any) {
    log.error('Failed to create tables', { error: err.message });
    process.exit(1);
  }

  log.info('Database setup complete!');
  process.exit(0);
}

setup();
