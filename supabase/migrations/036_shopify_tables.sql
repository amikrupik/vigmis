-- Migration 036: Shopify product + settings cache tables.
-- Truth Verifier (Session 4.1) reads these to fact-check ad copy claims
-- against the actual storefront. Populated by Shopify webhook + initial sync.

CREATE TABLE IF NOT EXISTS shopify_settings (
  tenant_id                    UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  shop_domain                  TEXT NOT NULL,
  access_token_encrypted       TEXT,
  has_free_shipping            BOOLEAN NOT NULL DEFAULT false,
  free_shipping_threshold_usd  NUMERIC(10,2),
  default_currency             TEXT NOT NULL DEFAULT 'USD',
  returns_policy_url           TEXT,
  privacy_policy_url           TEXT,
  last_sync_at                 TIMESTAMPTZ,
  enabled                      BOOLEAN NOT NULL DEFAULT true,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shopify_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON shopify_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


CREATE TABLE IF NOT EXISTS shopify_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_product_id TEXT NOT NULL,
  title               TEXT NOT NULL,
  handle              TEXT,
  vendor              TEXT,
  product_type        TEXT,
  price               NUMERIC(10,2),
  compare_at_price    NUMERIC(10,2),
  available           BOOLEAN NOT NULL DEFAULT true,
  inventory_quantity  INTEGER,
  image_url           TEXT,
  status              TEXT,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, external_product_id)
);

CREATE INDEX IF NOT EXISTS shopify_products_tenant ON shopify_products(tenant_id);
CREATE INDEX IF NOT EXISTS shopify_products_available
  ON shopify_products(tenant_id, available) WHERE available = true;

ALTER TABLE shopify_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON shopify_products
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
