-- Migration 013: Migrate billing from Stripe to Paddle
-- Renames stripe-specific columns and adds paddle_customer_id

ALTER TABLE billing_customers
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT UNIQUE;

ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS paddle_transaction_id TEXT;

-- Keep stripe_customer_id for any existing data, just stop using it for new customers
