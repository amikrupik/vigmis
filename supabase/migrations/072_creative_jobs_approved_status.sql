-- Migration 072: add 'approved' to creative_jobs status CHECK constraint
-- The approve endpoint sets status='approved' but the constraint from migration 047
-- only allows ('queued','processing','completed','failed','pending_setup','rejected').
-- Migration 063 adds columns only — no additional status values needed from it.

ALTER TABLE creative_jobs
  DROP CONSTRAINT IF EXISTS creative_jobs_status_check;

ALTER TABLE creative_jobs
  ADD CONSTRAINT creative_jobs_status_check
  CHECK (status IN (
    'queued',
    'processing',
    'completed',
    'failed',
    'pending_setup',
    'rejected',
    'approved'
  ));
