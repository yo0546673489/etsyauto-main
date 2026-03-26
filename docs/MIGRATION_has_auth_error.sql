-- Migration: Add has_auth_error to financial_sync_status
-- Run this if your DB was created before this column was added to the model.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE financial_sync_status
ADD COLUMN IF NOT EXISTS has_auth_error BOOLEAN DEFAULT FALSE;
