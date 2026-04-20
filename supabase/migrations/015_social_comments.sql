-- Migration 015: Social Comment Management
-- social_comments: every fetched comment on a published post, with AI triage and reply tracking

CREATE TABLE IF NOT EXISTS social_comments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id               UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  external_comment_id   TEXT NOT NULL,
  author_name           TEXT,
  author_id             TEXT,
  text                  TEXT NOT NULL,

  -- AI triage
  sentiment             TEXT NOT NULL DEFAULT 'other'
                        CHECK (sentiment IN ('positive', 'question', 'complaint', 'spam', 'other')),
  ai_draft_reply        TEXT,
  ai_recommendation     TEXT,   -- why this categorization, what to watch out for

  -- Workflow
  status                TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','auto_replied','pending_approval','sent','ignored','hidden')),
  replied_at            TIMESTAMPTZ,
  external_reply_id     TEXT,

  -- Billing
  billed                BOOLEAN NOT NULL DEFAULT false,
  cost_usd              NUMERIC(5,3) NOT NULL DEFAULT 0,

  commented_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(platform, external_comment_id)
);

CREATE INDEX IF NOT EXISTS social_comments_tenant_status ON social_comments(tenant_id, status);
CREATE INDEX IF NOT EXISTS social_comments_post          ON social_comments(post_id);

ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON social_comments USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
