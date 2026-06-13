-- Migration 061: Prevent duplicate posts for same platform/week
-- Race condition in POST /social/generate: concurrent calls both pass
-- the SELECT-then-INSERT guard, creating duplicate billing records.
-- This partial unique index prevents the second INSERT from succeeding.

CREATE UNIQUE INDEX IF NOT EXISTS social_posts_tenant_platform_week_unique
  ON social_posts (
    tenant_id,
    platform,
    date_trunc('week', scheduled_for AT TIME ZONE 'UTC')
  )
  WHERE status NOT IN ('rejected', 'failed');
