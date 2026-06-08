-- Migration 048: Switch billing from Paddle to Stripe
-- stripe_customer_id and subscription_id already exist from pre-013 schema.
-- Just clean up paddle_customer_id (keep the column, stop using it — data retention).

-- Mark paddle column as deprecated via comment (no data loss)
COMMENT ON COLUMN billing_customers.paddle_customer_id IS 'Deprecated 2026-06-08 — migrated to Stripe. Kept for audit trail.';

-- Ensure stripe_customer_id has an index for webhook lookups by customer
CREATE INDEX IF NOT EXISTS billing_customers_stripe_customer_idx
  ON billing_customers(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Ensure subscription_id has an index for webhook lookups
CREATE INDEX IF NOT EXISTS billing_customers_subscription_idx
  ON billing_customers(subscription_id)
  WHERE subscription_id IS NOT NULL;
