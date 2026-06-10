-- Industry benchmarks: two-tier system
-- Tier 1: seeded market benchmarks (public research data)
-- Tier 2: cross-client anonymized aggregates (grows with platform scale)
-- Never expose tenant-specific data — only aggregated statistics

CREATE TABLE IF NOT EXISTS industry_benchmarks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry        TEXT NOT NULL,          -- ecommerce | lead_gen | saas | hero_product | general_store
  platform        TEXT NOT NULL,          -- meta | google | tiktok
  country_code    TEXT NOT NULL DEFAULT 'IL',
  goal            TEXT NOT NULL,          -- purchases | leads | traffic | awareness
  avg_ctr         NUMERIC(6,4),           -- typical CTR for this segment
  avg_cpc_usd     NUMERIC(8,4),           -- typical CPC in USD
  avg_cpa_usd     NUMERIC(8,2),           -- typical CPA in USD
  avg_roas        NUMERIC(6,2),           -- typical ROAS
  avg_cvr         NUMERIC(6,4),           -- typical conversion rate
  sample_tenants  INTEGER DEFAULT 0,      -- how many accounts contributed (for trust score)
  source          TEXT NOT NULL DEFAULT 'seeded', -- seeded | aggregated
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS industry_benchmarks_key
  ON industry_benchmarks(industry, platform, country_code, goal);

-- Seeded benchmarks from public research (WordStream, Meta Business, Google Ads benchmarks 2025)
-- These serve as priors until enough cross-client data accumulates
INSERT INTO industry_benchmarks (industry, platform, country_code, goal, avg_ctr, avg_cpc_usd, avg_cpa_usd, avg_roas, avg_cvr, source) VALUES
  -- Meta — Israel (IL)
  ('ecommerce',    'meta',   'IL', 'purchases', 0.012, 1.80, 45.00, 2.5, 0.020, 'seeded'),
  ('lead_gen',     'meta',   'IL', 'leads',     0.015, 1.20, 18.00, NULL, 0.030, 'seeded'),
  ('saas',         'meta',   'IL', 'leads',     0.010, 2.50, 35.00, NULL, 0.015, 'seeded'),
  ('hero_product', 'meta',   'IL', 'purchases', 0.018, 1.50, 30.00, 3.0, 0.025, 'seeded'),
  -- Google — Israel (IL)
  ('ecommerce',    'google', 'IL', 'purchases', 0.060, 2.50, 55.00, 3.5, 0.030, 'seeded'),
  ('lead_gen',     'google', 'IL', 'leads',     0.055, 3.00, 22.00, NULL, 0.040, 'seeded'),
  ('saas',         'google', 'IL', 'leads',     0.040, 4.50, 60.00, NULL, 0.025, 'seeded'),
  -- Meta — US
  ('ecommerce',    'meta',   'US', 'purchases', 0.009, 3.50, 85.00, 2.2, 0.018, 'seeded'),
  ('lead_gen',     'meta',   'US', 'leads',     0.012, 2.20, 35.00, NULL, 0.028, 'seeded'),
  ('ecommerce',    'google', 'US', 'purchases', 0.065, 4.00, 90.00, 4.0, 0.032, 'seeded')
ON CONFLICT (industry, platform, country_code, goal) DO NOTHING;

-- Anonymized performance aggregator (updated by weekly cron)
-- Each row = one account's monthly performance contribution, fully anonymized
CREATE TABLE IF NOT EXISTS benchmark_contributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry        TEXT NOT NULL,
  platform        TEXT NOT NULL,
  country_code    TEXT NOT NULL DEFAULT 'IL',
  goal            TEXT NOT NULL,
  period_month    TEXT NOT NULL,          -- YYYY-MM — one row per account per month
  ctr             NUMERIC(6,4),
  cpc_usd         NUMERIC(8,4),
  cpa_usd         NUMERIC(8,2),
  roas            NUMERIC(6,2),
  cvr             NUMERIC(6,4),
  spend_usd       NUMERIC(10,2),          -- needed for weighted averages
  conversions     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Note: NO tenant_id — intentionally anonymized at insert time
);

CREATE INDEX IF NOT EXISTS benchmark_contributions_lookup
  ON benchmark_contributions(industry, platform, country_code, goal, period_month);
