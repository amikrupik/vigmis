-- Migration 049: billing_invoices — preserve invoices when tenant is deleted
-- Legal requirement: invoices must be retained for audit/accounting even after account closure.
-- Change ON DELETE CASCADE → SET NULL so invoices survive tenant deletion.

ALTER TABLE billing_invoices
  DROP CONSTRAINT billing_invoices_tenant_id_fkey;

ALTER TABLE billing_invoices
  ADD CONSTRAINT billing_invoices_tenant_id_fkey
  FOREIGN KEY (tenant_id)
  REFERENCES tenants(id)
  ON DELETE SET NULL;

-- Add deleted_tenant_id for audit reference (stores the UUID even after tenant row is gone)
ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS deleted_tenant_id UUID;

-- Backfill: copy current tenant_id to deleted_tenant_id (so we never lose the reference)
UPDATE billing_invoices SET deleted_tenant_id = tenant_id WHERE tenant_id IS NOT NULL;
