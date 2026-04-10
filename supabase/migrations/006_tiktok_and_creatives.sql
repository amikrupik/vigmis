-- Migration 006: TikTok platform support + creative_jobs table

-- ── Extend existing tables to support TikTok ─────────────────────────────────

-- campaigns: allow 'tiktok' as a platform value
ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_platform_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_platform_check
  CHECK (platform IN ('google', 'meta', 'tiktok'));

-- platform_tokens: allow 'tiktok' as a platform value
ALTER TABLE platform_tokens
  DROP CONSTRAINT IF EXISTS platform_tokens_platform_check;
ALTER TABLE platform_tokens
  ADD CONSTRAINT platform_tokens_platform_check
  CHECK (platform IN ('google', 'meta', 'tiktok'));

-- audit_log: allow 'tiktok' as a platform value
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_platform_check;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_platform_check
  CHECK (platform IN ('google', 'meta', 'tiktok') OR platform IS NULL);

-- ── creative_jobs: video generation jobs ─────────────────────────────────────
-- Tracks HeyGen / Kling / Pika generation jobs per tenant.
-- status flow: queued → processing → completed | failed
-- pending_setup: API key not configured yet, brief saved for later

CREATE TABLE IF NOT EXISTS creative_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id       UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN ('avatar', 'cinematic', 'animation')),
  platform          TEXT CHECK (platform IN ('google', 'meta', 'tiktok')),
  brief             JSONB NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'pending_setup')),
  provider_job_id   TEXT,            -- HeyGen video_id / Kling task_id / Pika job id
  output_url        TEXT,            -- final video URL (CDN or Supabase Storage)
  revision_of       UUID REFERENCES creative_jobs(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS creative_jobs_tenant_id_idx  ON creative_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS creative_jobs_campaign_id_idx ON creative_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS creative_jobs_status_idx      ON creative_jobs(status);

ALTER TABLE creative_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON creative_jobs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER creative_jobs_updated_at
  BEFORE UPDATE ON creative_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
