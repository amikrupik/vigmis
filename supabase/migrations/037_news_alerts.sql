-- Migration 037: News monitoring alerts
--
-- Per-tenant news mentions that may affect their business (competitor news,
-- industry shocks, regulatory changes). Filtered for relevance by LLM.

CREATE TABLE IF NOT EXISTS news_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  source          TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  published_at    TIMESTAMPTZ,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- LLM relevance + categorization
  relevance_score NUMERIC(4,3) NOT NULL DEFAULT 0,    -- 0..1
  category        TEXT,        -- competitor / industry / regulation / macroeconomy / other
  why_relevant    TEXT,
  suggested_action TEXT,

  -- Workflow
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','read','dismissed','escalated')),
  notified        BOOLEAN NOT NULL DEFAULT false,

  UNIQUE(tenant_id, source_url)
);

CREATE INDEX IF NOT EXISTS news_alerts_tenant_new
  ON news_alerts(tenant_id, fetched_at DESC)
  WHERE status = 'new';

ALTER TABLE news_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON news_alerts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
