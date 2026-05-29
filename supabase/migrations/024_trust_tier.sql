-- Migration 024: Trust Tier (3-axis scoring per tenant)
--
-- Tracks per-tenant risk signals so the engine can decide how many human
-- approvals to require. ChatGPT's "Reputation Score" idea but split into three
-- orthogonal axes so we don't conflate "customer complained" with "user broke
-- policy" with "user tried to bypass our gates".
--
-- The tier is computed on demand by services/trust-tier.ts — this table is the
-- materialized cache for fast lookups + historical record.

CREATE TABLE IF NOT EXISTS tenant_trust_tier (
  tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- 3 orthogonal scores. Each is a count of recent (90 days) signals.
  policy_violations_90d   INTEGER NOT NULL DEFAULT 0,
  customer_complaints_90d INTEGER NOT NULL DEFAULT 0,
  bypass_attempts_90d     INTEGER NOT NULL DEFAULT 0,

  -- Computed tier: trusted | standard | watch | restricted
  tier                 TEXT NOT NULL DEFAULT 'standard'
                       CHECK (tier IN ('trusted','standard','watch','restricted')),

  -- Reason for current tier (audit + UI display)
  tier_reason          TEXT,

  -- Manual override by admin (overrides computed tier until cleared)
  manual_override_tier TEXT CHECK (manual_override_tier IN ('trusted','standard','watch','restricted')),
  manual_override_reason TEXT,
  manual_override_by   TEXT,                  -- admin clerk_user_id
  manual_override_at   TIMESTAMPTZ,

  last_recomputed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_trust_tier_tier ON tenant_trust_tier(tier);

ALTER TABLE tenant_trust_tier ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON tenant_trust_tier
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Separate log of bypass attempts — events that the trust-tier service flags
-- as suspicious behavior (e.g., re-submitting rejected content with trivial
-- edits, repeatedly attempting actions without required attestations).
CREATE TABLE IF NOT EXISTS bypass_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clerk_user_id    TEXT,
  attempt_kind     TEXT NOT NULL CHECK (attempt_kind IN (
                     'resubmit_blocked_with_trivial_edit',
                     'missing_attestation',
                     'rapid_retry_after_block',
                     'classifier_evasion_pattern',
                     'admin_flagged'
                   )),
  details          JSONB,
  related_decision_id UUID REFERENCES content_decisions(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bypass_attempts_tenant_created
  ON bypass_attempts(tenant_id, created_at DESC);

ALTER TABLE bypass_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON bypass_attempts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
