-- Migration 021: GA4 (Google Analytics 4) integration
-- Stores per-tenant GA4 settings and daily campaign attribution metrics pulled from
-- the Google Analytics Data API. These are the "ground truth" numbers Vigmis uses
-- to override platform-reported (and inflated) conversions/revenue.

CREATE TABLE IF NOT EXISTS ga4_settings (
  tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  property_id         TEXT NOT NULL,                -- e.g. "properties/123456789"
  property_name       TEXT,
  default_currency    TEXT,
  -- OAuth scope analytics.readonly is bundled into platform_tokens.scope when
  -- the user grants it during the existing Google OAuth flow.
  last_synced_at      TIMESTAMPTZ,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (tenant, date, source, medium) — the GA4 acquisition dimensions.
-- session_campaign matches the platform campaign name when UTMs are wired correctly.
CREATE TABLE IF NOT EXISTS ga4_daily_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  source              TEXT NOT NULL,                 -- google / facebook / instagram / tiktok / direct ...
  medium              TEXT NOT NULL,                 -- cpc / organic / referral ...
  session_campaign    TEXT,                          -- UTM campaign name
  sessions            INTEGER NOT NULL DEFAULT 0,
  active_users        INTEGER NOT NULL DEFAULT 0,
  conversions         NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchase_revenue    NUMERIC(14,2) NOT NULL DEFAULT 0,
  engagement_rate     NUMERIC(6,4),
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date, source, medium, session_campaign)
);

CREATE INDEX IF NOT EXISTS ga4_daily_metrics_tenant_date
  ON ga4_daily_metrics(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS ga4_daily_metrics_campaign
  ON ga4_daily_metrics(tenant_id, session_campaign);

ALTER TABLE ga4_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON ga4_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "tenant_isolation" ON ga4_daily_metrics
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
