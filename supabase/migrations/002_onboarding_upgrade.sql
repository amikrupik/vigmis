-- Migration 002: Onboarding upgrade
-- Adds website_url, management_percentage, and strategy_plan to client_settings

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS management_percentage INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS strategy_plan JSONB;
