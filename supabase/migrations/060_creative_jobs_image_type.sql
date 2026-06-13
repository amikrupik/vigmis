-- Migration 060: Add 'image' to creative_jobs type CHECK constraint
-- The type constraint was created with only ('avatar', 'cinematic', 'animation').
-- Image generation (gpt-image-1 / DALL-E) was added later and needs 'image' in the constraint.

ALTER TABLE creative_jobs
  DROP CONSTRAINT IF EXISTS creative_jobs_type_check;

ALTER TABLE creative_jobs
  ADD CONSTRAINT creative_jobs_type_check
  CHECK (type IN ('avatar', 'cinematic', 'animation', 'image'));
