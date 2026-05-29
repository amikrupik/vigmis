-- Migration 030: business_country on client_settings
--
-- Adds ISO-2 country where the business itself operates (distinct from
-- target markets in geo_include). Needed by the geo-context service to
-- decide jurisdictional rules — e.g. cannabis legality, EU AI Act
-- applicability, regulatory licensing.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS business_country TEXT;
