-- Migration 073: Add 'past_due' to billing_invoices.status CHECK constraint
-- The Stripe webhook handler writes status='past_due' when invoice.payment_failed fires,
-- but the original CHECK in 004_billing.sql only allowed ('draft','sent','paid','void').
-- This caused a constraint violation on every failed payment webhook.

ALTER TABLE billing_invoices
  DROP CONSTRAINT IF EXISTS billing_invoices_status_check;

ALTER TABLE billing_invoices
  ADD CONSTRAINT billing_invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'void', 'past_due'));
