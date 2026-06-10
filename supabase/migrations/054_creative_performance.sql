-- Creative performance tracking: links creative_jobs to actual social post analytics
-- Enables the feedback loop: which creative types/themes actually drove engagement

-- Add performance columns to creative_jobs
ALTER TABLE creative_jobs
  ADD COLUMN IF NOT EXISTS linked_post_id    UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS engagement_rate   NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS reach             INTEGER,
  ADD COLUMN IF NOT EXISTS impressions       INTEGER,
  ADD COLUMN IF NOT EXISTS performance_synced_at TIMESTAMPTZ;

-- Aggregated winning themes per tenant
CREATE TABLE IF NOT EXISTS creative_performance_themes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  theme           TEXT NOT NULL,
  creative_type   TEXT,                -- avatar | cinematic | animation | image
  platform        TEXT,
  avg_engagement  NUMERIC(8,4),
  avg_reach       INTEGER,
  sample_count    INTEGER DEFAULT 0,
  top_hook        TEXT,                -- best-performing hook text for this theme
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_perf_themes_unique
  ON creative_performance_themes(tenant_id, theme, platform);

ALTER TABLE creative_performance_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_themes" ON creative_performance_themes
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
