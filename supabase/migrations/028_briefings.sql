-- Migration 028: Proactive Briefings (preferences + log)
--
-- Stores per-tenant briefing preferences and a sent-log so we don't double-send.
-- A Vigmis briefing is short, 3-section format:
--   1. What's working
--   2. What needs your decision
--   3. What I'm doing for you (automation)
--
-- Delivered via WhatsApp + Email per the customer's preferences.

CREATE TABLE IF NOT EXISTS briefing_preferences (
  tenant_id        UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  enabled          BOOLEAN NOT NULL DEFAULT true,
  cadence          TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly','never')),
  channels         TEXT[] NOT NULL DEFAULT ARRAY['email']::TEXT[],  -- 'whatsapp', 'email'

  -- Local-tz day of week for weekly briefings (0=Sunday)
  weekly_day_of_week SMALLINT NOT NULL DEFAULT 1 CHECK (weekly_day_of_week BETWEEN 0 AND 6),
  -- Local-tz hour to deliver
  delivery_hour    SMALLINT NOT NULL DEFAULT 9 CHECK (delivery_hour BETWEEN 0 AND 23),
  timezone         TEXT NOT NULL DEFAULT 'Asia/Jerusalem',

  -- Language for briefing content (matches client's primary language)
  language         TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','he','ar','ru')),

  -- Don't blast the customer with empty briefings — minimum signal threshold
  min_significant_changes INTEGER NOT NULL DEFAULT 1,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE briefing_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON briefing_preferences
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


CREATE TABLE IF NOT EXISTS briefing_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cadence          TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
  channels_sent    TEXT[] NOT NULL,
  -- 3-section content; stored so the customer can re-read it from the dashboard
  summary_working      TEXT,
  summary_decision     TEXT,
  summary_automated    TEXT,
  -- Snapshot of metrics that drove this briefing
  metrics_snapshot     JSONB,
  -- Tracking
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at        TIMESTAMPTZ,
  acted_on_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS briefing_log_tenant_sent
  ON briefing_log(tenant_id, sent_at DESC);

ALTER TABLE briefing_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON briefing_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
