-- Migration 038: Weather sensitivity + snapshots
--
-- Some businesses are weather-sensitive (ice cream, umbrellas, ride-share,
-- food delivery, AC repair). Vigmis pulls the local forecast and surfaces
-- a recommendation when the next 3 days are unusual for the business.

ALTER TABLE client_settings
  ADD COLUMN IF NOT EXISTS weather_sensitive    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_sensitivity  JSONB;
  -- weather_sensitivity example: { "hot_boost": true, "rain_dampens": true, "cold_dampens": false }

CREATE TABLE IF NOT EXISTS weather_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location        TEXT NOT NULL,             -- city / region label
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- next 3 days
  forecast        JSONB NOT NULL,            -- raw forecast for the operational-awareness service
  recommendation  TEXT,
  applied         BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS weather_snapshot_tenant_fetched
  ON weather_snapshot(tenant_id, fetched_at DESC);

ALTER TABLE weather_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON weather_snapshot
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
