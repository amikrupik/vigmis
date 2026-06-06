-- 046_restore_append_only_audit.sql
-- ============================================================================
-- Fix a regression introduced by migration 045.
--
-- 045 enabled RLS everywhere (good) but also added a permissive `tenant_isolation_all`
-- policy (FOR ALL) to every table with a tenant_id column. For append-only / legal
-- audit tables that re-opened UPDATE/DELETE at the policy level, undoing migration 040's
-- intent (approval_snapshots must be insert-only).
--
-- This migration restores insert-only semantics for the immutable audit tables:
-- drop the FOR ALL policy and replace it with SELECT + INSERT only (no UPDATE/DELETE
-- policy → those operations are denied by RLS). The service-role key still bypasses
-- RLS, so the API is unaffected; this is defense-in-depth for any future non-service
-- access path.
--
-- Idempotent.
-- ============================================================================

DO $$
DECLARE
  r text;
  append_only text[] := ARRAY[
    'approval_snapshots',
    'content_attestations',
    'audit_log',
    'content_decisions',
    'bypass_attempts'
  ];
BEGIN
  FOREACH r IN ARRAY append_only LOOP
    IF to_regclass('public.' || r) IS NOT NULL THEN
      -- remove the over-permissive FOR ALL policies: the one added in 045
      -- (tenant_isolation_all) and any legacy FOR ALL policy from the table's
      -- creation migration (tenant_isolation).
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_all ON public.%I;', r);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I;', r);
      -- (re)create SELECT-only + INSERT-only policies
      EXECUTE format('DROP POLICY IF EXISTS select_own ON public.%I;', r);
      EXECUTE format('DROP POLICY IF EXISTS insert_own ON public.%I;', r);
      EXECUTE format(
        'CREATE POLICY select_own ON public.%I FOR SELECT '
        || 'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid);', r);
      EXECUTE format(
        'CREATE POLICY insert_own ON public.%I FOR INSERT '
        || 'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid);', r);
      -- No UPDATE/DELETE policy → tenant cannot mutate or delete (append-only).
    END IF;
  END LOOP;
END $$;
