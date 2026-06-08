-- Migration 052: Creative Studio Pro fields on creative_jobs

ALTER TABLE creative_jobs
  ADD COLUMN IF NOT EXISTS keep_elements TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS change_request TEXT,
  ADD COLUMN IF NOT EXISTS critic_score FLOAT,
  ADD COLUMN IF NOT EXISTS credit_consumed BOOLEAN DEFAULT FALSE;
