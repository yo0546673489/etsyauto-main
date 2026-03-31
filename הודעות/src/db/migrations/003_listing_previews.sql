CREATE TABLE IF NOT EXISTS listing_previews (
    id SERIAL PRIMARY KEY,
    listing_id VARCHAR(50) UNIQUE NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    image_url TEXT,
    price TEXT,
    currency_code VARCHAR(10),
    scraped_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_previews_listing_id ON listing_previews(listing_id);
