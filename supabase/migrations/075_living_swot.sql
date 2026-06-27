-- living_swot: one row per SWOT item per tenant (up to ~12 items: 2-4 per category)
CREATE TABLE IF NOT EXISTS living_swot (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category        TEXT        NOT NULL CHECK (category IN ('strength','weakness','opportunity','threat')),
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  evidence        TEXT[]      NOT NULL DEFAULT '{}',
  confidence      INTEGER     NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 0 AND 100),
  impact          TEXT        NOT NULL DEFAULT 'medium' CHECK (impact IN ('low','medium','high')),
  recommended_action TEXT     NOT NULL,
  owner           TEXT        NOT NULL CHECK (owner IN ('strategy','creative','optimization','website')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS living_swot_tenant_idx ON living_swot (tenant_id);

-- strategy_update_recommendations: pending changes awaiting user approval.
-- Nothing auto-applies — user must explicitly approve.
CREATE TABLE IF NOT EXISTS strategy_update_recommendations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_type    TEXT        NOT NULL CHECK (trigger_type IN ('website_change','performance_shift','market_change','scheduled_refresh','manual')),
  trigger_summary TEXT        NOT NULL,
  swot_changes    JSONB       NOT NULL DEFAULT '[]',
  strategy_changes JSONB      NOT NULL DEFAULT '{}',
  confidence      INTEGER     NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 0 AND 100),
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS strategy_update_rec_tenant_status_idx ON strategy_update_recommendations (tenant_id, status);

-- evidence_events: materiality queue — events that might warrant a SWOT update.
-- The monthly cron drains this and decides if a recommendation is needed.
CREATE TABLE IF NOT EXISTS evidence_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL CHECK (event_type IN ('website_change','performance_shift','market_change')),
  description     TEXT        NOT NULL,
  magnitude       TEXT        NOT NULL DEFAULT 'medium' CHECK (magnitude IN ('small','medium','large')),
  is_strategic    BOOLEAN,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_events_tenant_unprocessed_idx ON evidence_events (tenant_id, processed_at) WHERE processed_at IS NULL;
