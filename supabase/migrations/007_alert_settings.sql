-- Migration 007: Alert settings + dismissed alerts persistence

CREATE TABLE IF NOT EXISTS alert_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  email           TEXT,
  whatsapp        TEXT,   -- E.164 format: +972501234567
  thresholds      JSONB NOT NULL DEFAULT '{
    "ctr_drop_pct": 20,
    "spend_spike_pct": 50,
    "budget_exhaustion_day": 25
  }',
  email_enabled   BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON alert_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS dismissed_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id    TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, alert_id)
);

ALTER TABLE dismissed_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON dismissed_alerts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS dismissed_alerts_tenant_idx ON dismissed_alerts(tenant_id);
