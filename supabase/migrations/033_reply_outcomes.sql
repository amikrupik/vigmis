-- Migration 033: Reply Outcomes (infra for Session 7 learning)
--
-- We log the OUTCOME of every reply Vigmis sends — did the thread die
-- (resolved) or did it escalate (more negative comments came)? Did the
-- original commenter come back positively? This is the raw signal for
-- Session 7's reply-outcome learning.
--
-- This migration just lays down the table. The actual outcome computation
-- (thread sentiment trajectory) is a Session 7 worker.

CREATE TABLE IF NOT EXISTS reply_outcomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comment_id          UUID NOT NULL REFERENCES social_comments(id) ON DELETE CASCADE,
  reply_external_id   TEXT,
  reply_sent_at       TIMESTAMPTZ NOT NULL,
  reply_text          TEXT NOT NULL,

  -- Computed (24h, 7d after reply)
  thread_outcome      TEXT CHECK (thread_outcome IN ('resolved','escalated','engaged','dead','unknown')),
  follow_up_count     INTEGER,         -- how many comments came after our reply
  follow_up_sentiment_avg NUMERIC(4,3), -- -1..+1 (mean of follow-up sentiments)
  original_commenter_returned BOOLEAN,
  original_commenter_sentiment TEXT,  -- if they came back: was it positive?

  computed_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reply_outcomes_tenant ON reply_outcomes(tenant_id, reply_sent_at DESC);
CREATE INDEX IF NOT EXISTS reply_outcomes_unscored
  ON reply_outcomes(reply_sent_at) WHERE thread_outcome IS NULL;

ALTER TABLE reply_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON reply_outcomes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- Recurring insights derived from comment patterns. One row per insight,
-- regenerated daily by the insights cron.
CREATE TABLE IF NOT EXISTS comment_insights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insight_kind        TEXT NOT NULL CHECK (insight_kind IN (
                        'recurring_objection',
                        'recurring_question',
                        'recurring_complaint',
                        'praise_theme',
                        'feature_request',
                        'faq_candidate'
                      )),
  theme               TEXT NOT NULL,             -- short normalized label
  example_comments    UUID[] NOT NULL,            -- comment ids that match this theme
  occurrence_count    INTEGER NOT NULL,
  first_seen_at       TIMESTAMPTZ,
  last_seen_at        TIMESTAMPTZ,
  suggested_action    TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','dismissed','acted_on')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comment_insights_tenant_kind
  ON comment_insights(tenant_id, insight_kind);

ALTER TABLE comment_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON comment_insights
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
