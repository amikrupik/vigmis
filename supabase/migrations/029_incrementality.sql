-- Migration 029: Incrementality fields
--
-- Extend ga4_daily_metrics with new-vs-returning split. The existing total
-- conversions/revenue are great for top-line, but to estimate incremental
-- impact we need to know how much of the revenue came from NEW customers
-- (acquisition) vs RETURNING (would have come back anyway in many cases).
--
-- These columns are populated by the GA4 sync (when extended to pull the
-- newVsReturning dimension and the firstTimePurchaserRate metric).

ALTER TABLE ga4_daily_metrics
  ADD COLUMN IF NOT EXISTS new_users               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returning_users         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_time_purchasers   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_purchase_revenue  NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Per-tenant lifetime measurement of incrementality (cached)
CREATE TABLE IF NOT EXISTS tenant_incrementality_snapshot (
  tenant_id              UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Last computed values (30-day window)
  window_days            INTEGER NOT NULL DEFAULT 30,
  ad_spend_usd           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_revenue_usd      NUMERIC(14,2) NOT NULL DEFAULT 0,
  new_customer_revenue   NUMERIC(14,2) NOT NULL DEFAULT 0,
  returning_revenue      NUMERIC(14,2) NOT NULL DEFAULT 0,

  platform_reported_roas NUMERIC(10,3),  -- as the platforms claim
  ga4_reported_roas      NUMERIC(10,3),  -- ground-truth multi-touch
  incremental_roas_estimate NUMERIC(10,3), -- new-customer revenue / ad spend

  -- Confidence in the estimate (0-1)
  confidence             NUMERIC(4,3) NOT NULL DEFAULT 0,
  confidence_notes       TEXT,

  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenant_incrementality_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_incrementality_snapshot
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
