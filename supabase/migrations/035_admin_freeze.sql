-- Migration 035: Admin freeze + kill switch
--
-- Vigmis-side (not customer-controlled) ability to freeze a tenant. Used
-- by support/legal/security when a tenant is in violation, in an active
-- dispute, or a security incident is suspected.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS frozen              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_reason       TEXT,
  ADD COLUMN IF NOT EXISTS freeze_capabilities TEXT[],   -- subset of automations to disable: 'publish','optimize','generation','crons'
  ADD COLUMN IF NOT EXISTS frozen_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by           TEXT;     -- admin clerk_user_id
