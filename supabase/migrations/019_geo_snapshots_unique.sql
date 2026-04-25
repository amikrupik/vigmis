-- Fix: add missing UNIQUE constraint on geo_report_snapshots
-- Without this, the upsert in geo.ts creates duplicates instead of updating

ALTER TABLE geo_report_snapshots
  ADD CONSTRAINT geo_report_snapshots_tenant_month_unique
  UNIQUE (tenant_id, snapshot_month);
