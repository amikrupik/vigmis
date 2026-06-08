-- Migration 047: creative_jobs — revision tracking + approval + rejected status

-- Rename revision_of → parent_job_id (cleaner semantics, matches API field name)
ALTER TABLE creative_jobs
  RENAME COLUMN revision_of TO parent_job_id;

-- Add revision_number: 0 = original generation, 1 = first revision, 2+ = paid revisions
ALTER TABLE creative_jobs
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 0;

-- Add approved_at: set when user explicitly approves a creative
-- NULL = not yet reviewed
ALTER TABLE creative_jobs
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Extend status to include 'rejected' (user discards, or auto-discard after 7 days)
ALTER TABLE creative_jobs
  DROP CONSTRAINT IF EXISTS creative_jobs_status_check;

ALTER TABLE creative_jobs
  ADD CONSTRAINT creative_jobs_status_check
  CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'pending_setup', 'rejected'));

-- Index for auto-discard cron: find completed+unreviewed older than 7 days
CREATE INDEX IF NOT EXISTS creative_jobs_discard_idx
  ON creative_jobs(status, approved_at, updated_at)
  WHERE status = 'completed' AND approved_at IS NULL;

-- Index for revision counter: find siblings of a parent job
CREATE INDEX IF NOT EXISTS creative_jobs_parent_idx
  ON creative_jobs(parent_job_id)
  WHERE parent_job_id IS NOT NULL;
