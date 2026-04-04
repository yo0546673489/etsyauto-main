-- ================================================================
-- Migration 004: Image support in messages + subject listing in conversations
-- ================================================================

-- Add image columns to messages (if not already there)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_urls TEXT[];
ALTER TABLE messages ADD COLUMN IF NOT EXISTS card_data JSONB;

-- Add subject listing (product being discussed) to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject_listing_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject_listing_image TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject_listing_title TEXT;

-- Add AI mode if missing (used by auto-reply feature)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_mode BOOLEAN DEFAULT FALSE;
