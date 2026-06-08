-- Migration 050: Scale plan credit tracking on billing_customers

ALTER TABLE billing_customers
  ADD COLUMN IF NOT EXISTS scale_video_credits_used INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scale_image_credits_used INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scale_post_credits_used INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_period TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS downgrade_requested_at TIMESTAMPTZ;
