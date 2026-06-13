-- Add error_message column to creative_jobs so failure reasons are visible in the UI
ALTER TABLE creative_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
