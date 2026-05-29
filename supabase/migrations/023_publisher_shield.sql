-- Migration 023: Publisher Liability Shield
--
-- Three tables that together form Vigmis's legal/safety foundation:
--   1. content_decisions     — every classifier call (allow/block/rewrite) is logged
--   2. approval_snapshots    — forensic record of what was approved, by whom, when
--   3. content_attestations  — explicit checkbox attestations from the customer
--
-- Why: Vigmis is legally a content publisher (creates+optimizes+publishes ads).
-- Without these audit artifacts, "I didn't approve that" defeats us. With them,
-- we have a hash + IP + timestamp chain that holds up in court / before Meta.

-- ─── 1. content_decisions ─────────────────────────────────────────────────────
-- Every time the policy classifier runs, we log its decision. Immutable.
-- Used for: legal defense, auditing, anomaly detection, training data.

CREATE TABLE IF NOT EXISTS content_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- What was classified
  content_kind      TEXT NOT NULL CHECK (content_kind IN (
                      'ad_copy','ad_creative','post','image_prompt',
                      'video_script','landing_claim','onboarding_answer','chat_message','other'
                    )),
  content_text      TEXT NOT NULL,
  content_hash      TEXT NOT NULL, -- SHA-256 hex of content_text

  -- The decision
  decision          TEXT NOT NULL CHECK (decision IN ('allow','allow_with_warning','block','require_human_review','rewrite_suggested')),
  tier              SMALLINT CHECK (tier IN (0,1,2,3)), -- 0 hard-block, 1 needs license, 2 caveat, 3 clean
  category          TEXT, -- e.g. 'medical_claim','defamation','financial_promise','hate_speech','copyright_risk','clean'
  reason            TEXT, -- short human-readable why
  suggested_rewrite TEXT, -- if rewrite_suggested, the proposed safer wording

  -- Provenance
  classifier_version TEXT NOT NULL DEFAULT 'v1',
  source            TEXT NOT NULL CHECK (source IN ('pre_flight','post_flight','onboarding','chat','manual_review')),
  decided_by        TEXT NOT NULL CHECK (decided_by IN ('classifier','human','hybrid')),
  reviewer_user_id  TEXT, -- clerk_user_id if a human made the call

  -- Diagnostics
  model_used        TEXT,
  tokens_used       INTEGER,
  latency_ms        INTEGER,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_decisions_tenant_created
  ON content_decisions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_decisions_hash
  ON content_decisions(content_hash);
CREATE INDEX IF NOT EXISTS content_decisions_blocked
  ON content_decisions(tenant_id, decision)
  WHERE decision IN ('block','require_human_review');

ALTER TABLE content_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON content_decisions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ─── 2. approval_snapshots ────────────────────────────────────────────────────
-- Forensic record of every customer approval action: the exact bytes approved,
-- who, when, from where. "I didn't approve that" → here is the SHA-256.

CREATE TABLE IF NOT EXISTS approval_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- What was approved
  subject_kind      TEXT NOT NULL CHECK (subject_kind IN (
                      'social_post','ad_creative','campaign','budget_change','strategy','onboarding','disconnect','other'
                    )),
  subject_id        UUID, -- FK depends on subject_kind; not enforced because polymorphic
  content_snapshot  JSONB NOT NULL, -- exact bytes that were approved
  content_hash      TEXT NOT NULL,  -- SHA-256 hex of canonical JSON

  -- Who approved
  approver_clerk_user_id TEXT NOT NULL,
  approver_email         TEXT,
  approval_method        TEXT NOT NULL CHECK (approval_method IN (
                           'web_click','chat_command','email_link','auto_mode','api'
                         )),

  -- From where
  client_ip         INET,
  user_agent        TEXT,
  device_fingerprint TEXT, -- optional hash of UA+screen+tz client-side

  -- Decision linkage
  related_decision_id UUID REFERENCES content_decisions(id) ON DELETE SET NULL,
  attestation_id      UUID, -- FK to content_attestations, added below after table exists

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_snapshots_tenant_created
  ON approval_snapshots(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS approval_snapshots_subject
  ON approval_snapshots(subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS approval_snapshots_hash
  ON approval_snapshots(content_hash);

ALTER TABLE approval_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON approval_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- ─── 3. content_attestations ──────────────────────────────────────────────────
-- Customer signed off that the information they provided is accurate, lawful,
-- and owned/authorized by them. Required at onboarding and at high-stakes publish.

CREATE TABLE IF NOT EXISTS content_attestations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- What kind of attestation
  attestation_kind  TEXT NOT NULL CHECK (attestation_kind IN (
                      'onboarding_master',        -- once at signup
                      'publish_high_stakes',      -- per-publish for ads with claims/prices/promises
                      'periodic_re_attestation',  -- quarterly
                      'industry_eligibility',     -- "I have the required license"
                      'ip_ownership',             -- "I own / am authorized for these images"
                      'tos_acceptance',           -- ToS version accepted
                      'ai_disclosure_consent'     -- agree to AI labels on platforms
                    )),
  attestation_version TEXT NOT NULL DEFAULT 'v1', -- bump when wording changes

  -- The wording the customer actually saw (so we can re-sign if it changed)
  statement_shown   TEXT NOT NULL,
  statement_hash    TEXT NOT NULL, -- SHA-256 of statement_shown for fast lookup

  -- Signature
  signer_clerk_user_id TEXT NOT NULL,
  signer_email      TEXT,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Where signed from
  client_ip         INET,
  user_agent        TEXT,

  -- Optional context (e.g., for industry_eligibility: licence number, jurisdiction)
  context           JSONB,

  -- For periodic re-attestation: when does this expire?
  valid_until       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS content_attestations_tenant_kind
  ON content_attestations(tenant_id, attestation_kind);
CREATE INDEX IF NOT EXISTS content_attestations_signed_at
  ON content_attestations(tenant_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS content_attestations_expiring
  ON content_attestations(valid_until)
  WHERE valid_until IS NOT NULL;

ALTER TABLE content_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON content_attestations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- Now wire approval_snapshots.attestation_id FK (table exists now)
ALTER TABLE approval_snapshots
  ADD CONSTRAINT approval_snapshots_attestation_fk
  FOREIGN KEY (attestation_id) REFERENCES content_attestations(id) ON DELETE SET NULL;
