-- 070: Add data_maturity_level to client_settings
-- Computed weekly by data-maturity service.
-- Controls which intelligence engines activate per tenant.
--
-- Level 1: <14 days OR <30 clicks  → quality gate only, never touch budgets
-- Level 2: 14-30 days, 30-100 clicks → CTR optimization only
-- Level 3: >30 days, >100 clicks, GA4 connected → full optimization + A/B
-- Level 4: >90 days, >500 clicks, 2+ platforms → + Portfolio Allocator + Incrementality
-- Level 5: >180 days, >2000 clicks, Shopify connected → + Product Intelligence + Cohort

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS data_maturity_level INTEGER NOT NULL DEFAULT 1
    CHECK (data_maturity_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS data_maturity_computed_at TIMESTAMPTZ;

COMMENT ON COLUMN client_settings.data_maturity_level IS
  '1=learning, 2=early, 3=operational, 4=portfolio, 5=advanced. Governs which engines activate.';
