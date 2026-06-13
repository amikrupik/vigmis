-- Migration 062: Add business_name to client_settings
-- The code in creatives.ts selects business_name for brand injection,
-- but the column did not exist — always returning null → always showing "Vigmis".
-- Real tenants need their actual business name in generated creatives.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS business_name TEXT;
