-- Migration 016: Conversion Intelligence System — Round 1
-- Adds pixel tracking, Shopify integration, and true attribution infrastructure

-- New columns on client_settings
ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'ecommerce',
  ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS hero_product_name TEXT,
  ADD COLUMN IF NOT EXISTS hero_product_margin_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS shopify_domain TEXT,
  ADD COLUMN IF NOT EXISTS tracking_verified BOOLEAN NOT NULL DEFAULT false;

-- Shopify OAuth connections (one per tenant)
CREATE TABLE IF NOT EXISTS shopify_connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop         TEXT NOT NULL,          -- e.g. "mystore.myshopify.com"
  access_token TEXT NOT NULL,          -- encrypted, full Shopify Admin API token
  scopes       TEXT,
  webhook_id   TEXT,                   -- Shopify webhook subscription ID
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Raw pixel events — every event fired from the Vigmis JS pixel
CREATE TABLE IF NOT EXISTS conversion_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,   -- 'pageview','lead','purchase','add_to_cart','initiate_checkout'
  url          TEXT,
  referrer     TEXT,

  -- Click IDs captured from URL params and stored in cookies
  gclid        TEXT,
  fbclid       TEXT,
  ttclid       TEXT,

  -- UTM attribution
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_content  TEXT,
  utm_term     TEXT,

  -- Conversion value (purchases/leads with value)
  value        NUMERIC(12,2),
  currency     TEXT DEFAULT 'USD',
  order_id     TEXT,     -- deduplication key for purchases

  -- Attribution resolution (populated asynchronously)
  campaign_id  UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  platform     TEXT,

  -- Request metadata (hashed for privacy)
  ip_hash      TEXT,
  user_agent   TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversion_events_tenant     ON conversion_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversion_events_campaign   ON conversion_events(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversion_events_order      ON conversion_events(tenant_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversion_events_event_type ON conversion_events(tenant_id, event_type, created_at DESC);

-- Enable RLS
ALTER TABLE conversion_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_connections  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON conversion_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation" ON shopify_connections
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
