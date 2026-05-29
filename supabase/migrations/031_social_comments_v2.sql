-- Migration 031: Social Comments v2 — expanded taxonomy + confidence + routing
--
-- Session 6 upgrades to the comments system:
--   1. Sentiment expanded from 5 → 10 categories (purchase_intent, angry, troll, hate, legal_risk, lead added)
--   2. Per-classification confidence score (0-1) — auto-reply requires ≥0.85
--   3. Public vs Private reply routing recommendation
--   4. Do-not-engage flag for provocations/trolls
--   5. Reply confidence (separate from triage confidence)
--   6. Override history for human-edit learning

-- Drop the old CHECK constraint and add the expanded one.
ALTER TABLE social_comments
  DROP CONSTRAINT IF EXISTS social_comments_sentiment_check;

ALTER TABLE social_comments
  ADD CONSTRAINT social_comments_sentiment_check
  CHECK (sentiment IN (
    'positive',
    'question',
    'purchase_intent',
    'lead',
    'complaint',
    'angry',
    'troll',
    'hate',
    'legal_risk',
    'spam',
    'other'
  ));

ALTER TABLE social_comments
  ADD COLUMN IF NOT EXISTS classifier_confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS reply_confidence      NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS routing_recommendation TEXT
    CHECK (routing_recommendation IN ('public_reply','private_dm','ignore','hide','escalate')),
  ADD COLUMN IF NOT EXISTS do_not_engage         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_engage_reason      TEXT,
  ADD COLUMN IF NOT EXISTS priority_score        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS reply_blocked_by_policy BOOLEAN NOT NULL DEFAULT false;

-- The 'no_engage' workflow status for trolls/provocations.
ALTER TABLE social_comments
  DROP CONSTRAINT IF EXISTS social_comments_status_check;

ALTER TABLE social_comments
  ADD CONSTRAINT social_comments_status_check
  CHECK (status IN ('new','auto_replied','pending_approval','sent','ignored','hidden','no_engage','escalated'));


-- Human Override history — every time a customer edits an AI draft reply,
-- we record the diff so we can learn the customer's voice corrections.
CREATE TABLE IF NOT EXISTS reply_override_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comment_id        UUID NOT NULL REFERENCES social_comments(id) ON DELETE CASCADE,
  ai_draft          TEXT NOT NULL,    -- what Vigmis suggested
  human_final       TEXT NOT NULL,    -- what the human actually sent
  edit_distance     INTEGER,           -- Levenshtein-ish; for "trivial vs substantive" filtering
  edited_by         TEXT NOT NULL,    -- clerk_user_id
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reply_override_log_tenant ON reply_override_log(tenant_id, created_at DESC);

ALTER TABLE reply_override_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON reply_override_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
