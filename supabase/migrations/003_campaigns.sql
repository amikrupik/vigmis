-- Migration 003: Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('google', 'meta')),
  external_id     TEXT,                         -- Google/Meta campaign ID
  name            TEXT NOT NULL,                -- VIGMIS_* naming
  campaign_type   TEXT NOT NULL,                -- search, display, conversion, etc.
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','error')),
  daily_budget_usd NUMERIC(10,2) NOT NULL,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_tenant_id_idx ON campaigns(tenant_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON campaigns
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
