-- Migration 027: Conversion Readiness audit storage
--
-- Stores the most recent conversion-readiness audit per tenant. Used by the
-- "don't advertise" gate to refuse paid traffic to pages that won't convert.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS conversion_readiness        JSONB,
  ADD COLUMN IF NOT EXISTS conversion_readiness_score  INTEGER,
  ADD COLUMN IF NOT EXISTS conversion_readiness_at     TIMESTAMPTZ;

-- Index for quick "find tenants with poor readiness" queries (admin dashboard).
CREATE INDEX IF NOT EXISTS client_settings_readiness_score
  ON client_settings(conversion_readiness_score)
  WHERE conversion_readiness_score IS NOT NULL;
