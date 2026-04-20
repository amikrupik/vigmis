-- Migration 012: Extend ab_tests with campaign linking and winner tracking

ALTER TABLE ab_tests
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_clicks_per_variant INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS min_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS winner_announced BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ab_tests_campaign_idx ON ab_tests(campaign_id);
CREATE INDEX IF NOT EXISTS ab_tests_winner_idx   ON ab_tests(winner_announced) WHERE status = 'running';
