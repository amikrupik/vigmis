-- Migration 034: Pre-Publish Cooling-Off
--
-- When the customer approves a high-stakes post (price/promise/guarantee),
-- we delay actual publish by COOLING_OFF_MINUTES. During that window the
-- customer can cancel — gives them a chance to catch mistakes.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS cooling_off_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cooling_off_labels  TEXT[],
  ADD COLUMN IF NOT EXISTS cooling_off_cancelled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS social_posts_cooling_off_due
  ON social_posts(cooling_off_until)
  WHERE cooling_off_until IS NOT NULL AND status = 'cooling_off';

-- Add the new status value
ALTER TABLE social_posts
  DROP CONSTRAINT IF EXISTS social_posts_status_check;

-- We don't enforce a CHECK here — the existing schema didn't either, and the
-- application layer validates status transitions.
