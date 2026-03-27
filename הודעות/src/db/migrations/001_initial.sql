CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    store_number INTEGER UNIQUE NOT NULL,
    store_name VARCHAR(255),
    store_email VARCHAR(255) UNIQUE NOT NULL,
    adspower_profile_id VARCHAR(255) NOT NULL,
    initial_sync_completed BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    etsy_conversation_url TEXT,
    customer_name VARCHAR(255),
    customer_etsy_id VARCHAR(255),
    last_message_text TEXT,
    last_message_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'new',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    sender_type VARCHAR(20) NOT NULL,
    sender_name VARCHAR(255),
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP,
    message_hash VARCHAR(64) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reply_queue (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    message_text TEXT NOT NULL,
    source VARCHAR(20) DEFAULT 'manual',
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_store_id ON conversations(store_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_stores_store_email ON stores(store_email);
CREATE INDEX IF NOT EXISTS idx_reply_queue_status ON reply_queue(status);
CREATE INDEX IF NOT EXISTS idx_messages_text_search ON messages USING gin(to_tsvector('english', message_text));
CREATE INDEX IF NOT EXISTS idx_conversations_customer_search ON conversations USING gin(to_tsvector('english', customer_name));
