-- Migration 004: Billing
CREATE TABLE IF NOT EXISTS billing_customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT UNIQUE,
  plan                TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  subscription_id     TEXT,          -- Stripe subscription ID (Pro only)
  subscription_status TEXT,          -- active, canceled, past_due, etc.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  managed_spend_usd   NUMERIC(10,2) NOT NULL,
  fee_percentage      NUMERIC(4,2) NOT NULL,
  fee_usd             NUMERIC(10,2) NOT NULL,
  subscription_usd    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_usd           NUMERIC(10,2) NOT NULL,
  stripe_invoice_id   TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices  ENABLE ROW LEVEL SECURITY;
