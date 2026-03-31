-- ================================================================
-- Discount Automation Tables
-- DB: etsy_messages (Node.js schema)
-- ================================================================

-- משימות הנחה (local execution queue)
CREATE TABLE IF NOT EXISTS discount_tasks (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    task_type VARCHAR(30) NOT NULL,            -- 'create_sale' | 'end_sale'
    sale_name VARCHAR(255),                    -- שם המבצע (אלפאנומרי, ייחודי)
    discount_percent INTEGER,                  -- אחוז הנחה (5-75)
    target_scope VARCHAR(30) DEFAULT 'whole_shop',
    listing_ids TEXT[],
    target_country VARCHAR(100) DEFAULT 'Everywhere',
    terms_text VARCHAR(500),
    start_date DATE,
    end_date DATE,                             -- מקסימום 30 יום מ-start_date
    status VARCHAR(20) DEFAULT 'pending',      -- 'pending' | 'processing' | 'completed' | 'failed'
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP
);

-- ================================================================
-- etsy_platform DB Tables (Python API schema — לידיעה בלבד)
-- ================================================================
-- discount_rules:
--   id, shop_id, name, discount_type, discount_value, scope,
--   listing_ids, target_country, terms_text, etsy_sale_name,
--   start_date, end_date, is_active, created_at, updated_at
--
-- discount_tasks:
--   id, rule_id, shop_id, action ('apply_discount'/'remove_discount'),
--   discount_value, scope, listing_ids, scheduled_for, status,
--   started_at, completed_at, error_message, retry_count
--
-- shops:
--   id, adspower_profile_id, etsy_shop_id, display_name, ...

CREATE INDEX IF NOT EXISTS idx_discount_tasks_status ON discount_tasks(status);
CREATE INDEX IF NOT EXISTS idx_discount_tasks_store_id ON discount_tasks(store_id);
