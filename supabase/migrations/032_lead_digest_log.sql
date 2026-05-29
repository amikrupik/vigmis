-- Migration 032: Lead digest log + sentiment velocity baseline
--
-- Two related tables used by Session 6.2 and 6.3:
--   1. lead_digest_log — tracks WhatsApp/email digests sent so we don't double-push
--   2. sentiment_velocity_snapshot — daily baseline used by crisis detection

CREATE TABLE IF NOT EXISTS lead_digest_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hot_count             INTEGER NOT NULL,
  channels_sent         TEXT[] NOT NULL,
  comment_fingerprint   TEXT NOT NULL,  -- hash/concat of comment ids; avoids double-send of same set
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_digest_log_tenant_sent
  ON lead_digest_log(tenant_id, sent_at DESC);

ALTER TABLE lead_digest_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON lead_digest_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- Daily snapshot of comment sentiment volumes per tenant.
-- Used by sentiment-velocity service to detect crises (sudden spike in
-- negative sentiment) vs. normal baseline variation.
CREATE TABLE IF NOT EXISTS sentiment_velocity_snapshot (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  -- counts per sentiment in the day
  positive_count      INTEGER NOT NULL DEFAULT 0,
  question_count      INTEGER NOT NULL DEFAULT 0,
  complaint_count     INTEGER NOT NULL DEFAULT 0,
  angry_count         INTEGER NOT NULL DEFAULT 0,
  troll_count         INTEGER NOT NULL DEFAULT 0,
  hate_count          INTEGER NOT NULL DEFAULT 0,
  legal_risk_count    INTEGER NOT NULL DEFAULT 0,
  total_count         INTEGER NOT NULL DEFAULT 0,

  -- Derived flag for crisis events
  is_crisis           BOOLEAN NOT NULL DEFAULT false,
  crisis_reason       TEXT,
  crisis_alert_sent   BOOLEAN NOT NULL DEFAULT false,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS sentiment_velocity_tenant_date
  ON sentiment_velocity_snapshot(tenant_id, date DESC);

ALTER TABLE sentiment_velocity_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON sentiment_velocity_snapshot
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
