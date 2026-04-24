-- GEO (Generative Engine Optimization) reports
-- Stores AI audit results so they don't re-run on every page load

CREATE TABLE IF NOT EXISTS geo_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  website_url text NOT NULL,
  score integer,
  grade text,
  issues jsonb DEFAULT '[]',
  strengths jsonb DEFAULT '[]',
  schema_code text,
  faq jsonb DEFAULT '[]',
  business_description text,
  checklist jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE geo_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_geo" ON geo_reports
  USING (tenant_id = (SELECT id FROM tenants WHERE clerk_user_id = auth.uid()));
