-- Migration 009: Add historical_data column to platform_tokens
-- Stores up to 30 days of campaign/keyword/metrics data fetched after OAuth connection
-- Used to enrich AI strategy generation with real client history

ALTER TABLE platform_tokens
  ADD COLUMN IF NOT EXISTS historical_data JSONB DEFAULT NULL;

COMMENT ON COLUMN platform_tokens.historical_data IS
  'Cached historical campaign performance data fetched from the ad platform. Refreshed on each OAuth reconnect.';
