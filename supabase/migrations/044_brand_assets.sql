-- Brand Asset Library
-- Stores user-uploaded images and videos for use in posts and campaigns.

CREATE TABLE IF NOT EXISTS brand_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  public_url      TEXT NOT NULL,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  kind            TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_assets_tenant ON brand_assets(tenant_id);
CREATE INDEX IF NOT EXISTS brand_assets_kind ON brand_assets(tenant_id, kind);

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON brand_assets
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Supabase Storage bucket for brand assets (public read, authenticated write)
-- Run in Supabase dashboard or via `supabase storage create brand_assets --public`
-- INSERT INTO storage.buckets (id, name, public) VALUES ('brand_assets', 'brand_assets', true)
-- ON CONFLICT (id) DO NOTHING;
