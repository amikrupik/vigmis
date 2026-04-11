-- Migration 008: A/B Testing table

CREATE TABLE IF NOT EXISTS ab_tests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('google', 'meta', 'tiktok')),
  goal          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'concluded')),
  variants      JSONB NOT NULL DEFAULT '[]',
  conclusion    JSONB,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ab_tests_tenant_idx ON ab_tests(tenant_id);
CREATE INDEX IF NOT EXISTS ab_tests_status_idx  ON ab_tests(status);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON ab_tests
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
