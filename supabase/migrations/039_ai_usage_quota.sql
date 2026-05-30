-- Migration 039: per-tenant monthly AI usage + quota enforcement.
-- Backs the pricing guardrail (apps/api/src/billing/pricing.ts):
--   - tracks AI token cost, chat messages, and comments handled per month
--   - the circuit breaker compares ai_cost_usd to the month's fee
-- Populated live by services/usage.ts on every billable AI call.

CREATE TABLE IF NOT EXISTS ai_usage_monthly (
  tenant_id        UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period           TEXT    NOT NULL,                 -- 'YYYY-MM'
  ai_cost_usd      NUMERIC(12,4) NOT NULL DEFAULT 0, -- our token cost this month
  chat_messages    INTEGER NOT NULL DEFAULT 0,       -- consumed advisor messages
  comments_handled INTEGER NOT NULL DEFAULT 0,       -- triaged comments
  breaker_state    TEXT    NOT NULL DEFAULT 'ok',    -- ok | degrade | freeze
  last_event_at    TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period)
);

ALTER TABLE ai_usage_monthly ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "tenant_isolation" ON ai_usage_monthly
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Atomic increment — one statement so concurrent calls don't lose updates.
CREATE OR REPLACE FUNCTION bump_ai_usage(
  p_tenant   UUID,
  p_period   TEXT,
  p_cost     NUMERIC,
  p_messages INTEGER,
  p_comments INTEGER
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO ai_usage_monthly (tenant_id, period, ai_cost_usd, chat_messages, comments_handled, last_event_at, updated_at)
  VALUES (p_tenant, p_period, COALESCE(p_cost, 0), COALESCE(p_messages, 0), COALESCE(p_comments, 0), NOW(), NOW())
  ON CONFLICT (tenant_id, period) DO UPDATE SET
    ai_cost_usd      = ai_usage_monthly.ai_cost_usd      + COALESCE(p_cost, 0),
    chat_messages    = ai_usage_monthly.chat_messages    + COALESCE(p_messages, 0),
    comments_handled = ai_usage_monthly.comments_handled + COALESCE(p_comments, 0),
    last_event_at    = NOW(),
    updated_at       = NOW();
$$;
