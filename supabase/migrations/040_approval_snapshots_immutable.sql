-- Migration 040: Make approval_snapshots truly immutable.
--
-- The previous RLS policy ("tenant_isolation") was created without FOR clause,
-- which means it applied to ALL operations (SELECT, INSERT, UPDATE, DELETE).
-- A tenant could therefore mutate or delete their own approval snapshots,
-- defeating the legal audit trail purpose of the table.
--
-- Fix: replace the ALL policy with explicit SELECT + INSERT only.
-- No UPDATE or DELETE policy = those operations are blocked by RLS by default.

-- Drop the existing permissive ALL policy
DROP POLICY IF EXISTS "tenant_isolation" ON approval_snapshots;

-- SELECT: tenant can read their own snapshots
CREATE POLICY "select_own" ON approval_snapshots
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- INSERT: tenant can create new snapshots for themselves only
CREATE POLICY "insert_own" ON approval_snapshots
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- No UPDATE policy  → UPDATE is blocked
-- No DELETE policy  → DELETE is blocked
-- Result: insert-only from tenant perspective; service role bypasses RLS as usual.
