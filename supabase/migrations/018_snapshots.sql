-- Historical snapshots: GEO per-audit history + monthly performance summaries

-- One row per GEO audit run (preserves full history, never overwritten)
CREATE TABLE IF NOT EXISTS geo_report_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  snapshot_month text NOT NULL,        -- 'YYYY-MM'
  website_url   text,
  score         integer,
  grade         text,
  score_delta   integer,               -- vs previous snapshot (null = first ever)
  issues_critical integer DEFAULT 0,
  issues_warning  integer DEFAULT 0,
  full_report   jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_snapshots_tenant_month
  ON geo_report_snapshots(tenant_id, snapshot_month DESC);

ALTER TABLE geo_report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_geo_snapshots" ON geo_report_snapshots
  USING (tenant_id = (SELECT id FROM tenants WHERE clerk_user_id = auth.uid()::text));

-- One row per calendar month per tenant — comprehensive performance summary
CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  snapshot_month          text NOT NULL,   -- 'YYYY-MM'
  geo_score               integer,
  geo_grade               text,
  geo_score_delta         integer,
  active_campaigns        integer DEFAULT 0,
  total_daily_budget_usd  numeric(10,2) DEFAULT 0,
  optimizations_count     integer DEFAULT 0,
  budget_changes_count    integer DEFAULT 0,
  social_posts_published  integer DEFAULT 0,
  market_notes            text,
  created_at              timestamptz DEFAULT now(),
  UNIQUE(tenant_id, snapshot_month)
);

ALTER TABLE monthly_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_monthly_snapshots" ON monthly_snapshots
  USING (tenant_id = (SELECT id FROM tenants WHERE clerk_user_id = auth.uid()::text));
