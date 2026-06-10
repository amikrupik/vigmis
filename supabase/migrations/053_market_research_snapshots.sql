-- Market research snapshots: stores per-client Perplexity research with timestamp
-- Used for: audit trail, refresh detection, future strategy re-analysis
CREATE TABLE IF NOT EXISTS market_research_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  query_type  TEXT NOT NULL DEFAULT 'strategy_research',
  query       TEXT NOT NULL,
  raw_findings TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS market_research_snapshots_tenant_created
  ON market_research_snapshots(tenant_id, created_at DESC);

-- RLS: tenants can only read their own research
ALTER TABLE market_research_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_research" ON market_research_snapshots
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
