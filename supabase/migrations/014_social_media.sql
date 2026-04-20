-- Migration 014: Social Media Management
-- social_settings: per-tenant config (platforms, approval mode, content pillars)
-- social_posts: every generated/published post
-- social_analytics: engagement metrics per post (fetched from platform APIs)

CREATE TABLE IF NOT EXISTS social_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled                 BOOLEAN NOT NULL DEFAULT false,
  platforms               JSONB NOT NULL DEFAULT '[]',
  facebook_page_id        TEXT,
  instagram_user_id       TEXT,
  approval_mode           TEXT NOT NULL DEFAULT 'review'
                          CHECK (approval_mode IN ('auto', 'review', 'strict')),
  approval_timeout_hours  INTEGER NOT NULL DEFAULT 24,
  content_pillars         TEXT[] NOT NULL DEFAULT
                          ARRAY['educational','promotional','social_proof','behind_the_scenes','trending'],
  brand_voice             TEXT,
  active_pillar_index     INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok')),
  pillar              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','pending_approval','approved','rejected','published','failed')),
  content             TEXT NOT NULL,
  hashtags            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  image_url           TEXT,
  video_url           TEXT,
  external_post_id    TEXT,
  scheduled_for       TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  rejected_reason     TEXT,
  client_edit         TEXT,
  billed              BOOLEAN NOT NULL DEFAULT false,
  cost_usd            NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  boost_suggested     BOOLEAN NOT NULL DEFAULT false,
  boost_protocol_id   UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_analytics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id          UUID NOT NULL UNIQUE REFERENCES social_posts(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  likes            INTEGER NOT NULL DEFAULT 0,
  comments         INTEGER NOT NULL DEFAULT 0,
  shares           INTEGER NOT NULL DEFAULT 0,
  reach            INTEGER NOT NULL DEFAULT 0,
  impressions      INTEGER NOT NULL DEFAULT 0,
  engagement_rate  NUMERIC(6,4),
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_posts_tenant_status ON social_posts(tenant_id, status);
CREATE INDEX IF NOT EXISTS social_posts_scheduled     ON social_posts(scheduled_for) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS social_analytics_post      ON social_analytics(post_id);

ALTER TABLE social_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON social_settings  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "tenant_isolation" ON social_posts     USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "tenant_isolation" ON social_analytics USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
