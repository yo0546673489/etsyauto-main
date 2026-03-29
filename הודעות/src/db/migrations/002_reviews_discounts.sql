-- ================================================================
-- Migration 002: Reviews + Discounts tables
-- ================================================================

-- ============ AI SETTINGS ============

CREATE TABLE IF NOT EXISTS ai_settings (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    feature VARCHAR(50) NOT NULL,              -- 'messages' | 'reviews'
    enabled BOOLEAN DEFAULT FALSE,
    system_prompt TEXT NOT NULL,                -- הוראות ל-AI איך לענות
    model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
    max_tokens INTEGER DEFAULT 500,
    temperature REAL DEFAULT 0.7,
    language VARCHAR(10) DEFAULT 'en',         -- שפת התגובה
    auto_send BOOLEAN DEFAULT FALSE,           -- TRUE = שולח אוטומטי, FALSE = ממתין לאישור
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store_id, feature)
);

-- ============ REVIEWS ============

CREATE TABLE IF NOT EXISTS review_replies (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    etsy_review_id VARCHAR(255),               -- מזהה הביקורת ב-Etsy (אם ניתן לחלץ)
    etsy_listing_id VARCHAR(255),              -- מזהה המוצר
    reviewer_name VARCHAR(255),
    review_rating INTEGER,                     -- 1-5 כוכבים
    review_text TEXT,                          -- תוכן הביקורת
    review_date TIMESTAMP,
    reply_text TEXT NOT NULL,                  -- התגובה שנכתבה
    reply_source VARCHAR(20) DEFAULT 'manual', -- 'manual' | 'ai'
    status VARCHAR(20) DEFAULT 'pending',      -- 'pending' | 'processing' | 'sent' | 'failed'
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP
);

-- ============ DISCOUNTS ============

CREATE TABLE IF NOT EXISTS discount_tasks (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    task_type VARCHAR(30) NOT NULL,            -- 'create_sale' | 'end_sale' | 'update_sale'
    sale_name VARCHAR(255),                    -- שם המבצע (אלפאנומרי, ייחודי)
    discount_percent INTEGER,                  -- אחוז הנחה (5-75)
    target_scope VARCHAR(30) DEFAULT 'whole_shop', -- 'whole_shop' | 'specific_listings'
    listing_ids TEXT[],                        -- מערך של listing IDs (אם specific)
    target_country VARCHAR(100) DEFAULT 'Everywhere',
    terms_text VARCHAR(500),                   -- תנאים (עד 500 תווים)
    start_date DATE,
    end_date DATE,                             -- מקסימום 30 יום מ-start_date
    status VARCHAR(20) DEFAULT 'pending',      -- 'pending' | 'processing' | 'completed' | 'failed'
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP
);

-- ============ DISCOUNT SCHEDULES (ROTATION) ============

CREATE TABLE IF NOT EXISTS discount_schedules (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    schedule_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    rotation_config JSONB NOT NULL,            -- מפתח: day_of_week (0-6), ערך: { percent, sale_name }
    target_scope VARCHAR(30) DEFAULT 'whole_shop',
    listing_ids TEXT[],
    target_country VARCHAR(100) DEFAULT 'Everywhere',
    terms_text VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS idx_review_replies_store_id ON review_replies(store_id);
CREATE INDEX IF NOT EXISTS idx_review_replies_status ON review_replies(status);
CREATE INDEX IF NOT EXISTS idx_discount_tasks_store_id ON discount_tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_discount_tasks_status ON discount_tasks(status);
CREATE INDEX IF NOT EXISTS idx_discount_schedules_store_id ON discount_schedules(store_id);
CREATE INDEX IF NOT EXISTS idx_discount_schedules_active ON discount_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_settings_store_feature ON ai_settings(store_id, feature);
