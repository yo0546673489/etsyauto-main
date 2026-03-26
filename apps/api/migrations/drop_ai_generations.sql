-- Migration: Remove AI generation feature (Etsy API ToU compliance)
-- Run this against your database after deploying the code changes.
-- PostgreSQL

-- 1. Drop FK from listing_jobs to ai_generations (if column exists)
ALTER TABLE listing_jobs DROP COLUMN IF EXISTS ai_generation_id;

-- 2. Drop ai_generations table
DROP TABLE IF EXISTS ai_generations;
