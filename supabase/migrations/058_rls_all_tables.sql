-- 058_rls_all_tables.sql
-- ============================================================================
-- Comprehensive RLS sweep: ensure every table in the public schema has RLS
-- enabled and a tenant-isolation policy.
--
-- Context:
--   Migration 045 enabled RLS on all tables (dynamic loop) and added a
--   `tenant_isolation_all` policy keyed on current_setting('app.tenant_id').
--   Migration 046 restored append-only semantics for audit tables.
--   Subsequent migrations (053, 054, 055) added new tables; 053 and 054 include
--   their own RLS, but 055 (industry_benchmarks, benchmark_contributions) has
--   no tenant_id so they need RLS-with-no-policy (deny-all for anon/authed).
--   Migration 041 created team_members and team_invites without explicit policies.
--
-- What this migration adds / guarantees:
--   1. ALTER TABLE … ENABLE ROW LEVEL SECURITY on every public table that might
--      have been created after 045 ran, or that 045 missed (idempotent).
--   2. Tenant-isolation policies (SELECT / INSERT / UPDATE / DELETE) on every
--      table that has a tenant_id column and does NOT already have a
--      comprehensive per-verb policy set.  The policy expression used throughout
--      the codebase is:
--        tenant_id = (SELECT id FROM tenants WHERE clerk_user_id = auth.uid()::text)
--      The service-role key has BYPASSRLS and is unaffected by any policy here.
--   3. Tables without tenant_id (industry_benchmarks, benchmark_contributions)
--      get RLS enabled with NO permissive policy — the service-role key can
--      still read/write them; anon/authenticated callers get zero rows.
--
-- Tables covered with new or replacement policies (those already correct are
-- left untouched via DROP IF EXISTS + CREATE):
--   • team_members       — tenant_id; needs SELECT/INSERT/UPDATE/DELETE policies
--   • team_invites       — tenant_id; needs SELECT/INSERT/UPDATE/DELETE policies
--   • industry_benchmarks      — no tenant_id; RLS-on, deny-all for non-service
--   • benchmark_contributions  — no tenant_id; RLS-on, deny-all for non-service
--
-- Idempotent — safe to run multiple times.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: Enable RLS on every public table (catch-all, idempotent).
--         Tables already having RLS are silently skipped by Postgres.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: team_members — full CRUD isolation per tenant
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_all  ON public.team_members;
DROP POLICY IF EXISTS tenant_isolation      ON public.team_members;
DROP POLICY IF EXISTS select_own            ON public.team_members;
DROP POLICY IF EXISTS insert_own            ON public.team_members;
DROP POLICY IF EXISTS update_own            ON public.team_members;
DROP POLICY IF EXISTS delete_own            ON public.team_members;

CREATE POLICY select_own ON public.team_members
  FOR SELECT
  USING (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY insert_own ON public.team_members
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY update_own ON public.team_members
  FOR UPDATE
  USING (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  )
  WITH CHECK (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY delete_own ON public.team_members
  FOR DELETE
  USING (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );


-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: team_invites — full CRUD isolation per tenant
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_all  ON public.team_invites;
DROP POLICY IF EXISTS tenant_isolation      ON public.team_invites;
DROP POLICY IF EXISTS select_own            ON public.team_invites;
DROP POLICY IF EXISTS insert_own            ON public.team_invites;
DROP POLICY IF EXISTS update_own            ON public.team_invites;
DROP POLICY IF EXISTS delete_own            ON public.team_invites;

CREATE POLICY select_own ON public.team_invites
  FOR SELECT
  USING (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY insert_own ON public.team_invites
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY update_own ON public.team_invites
  FOR UPDATE
  USING (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  )
  WITH CHECK (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );

CREATE POLICY delete_own ON public.team_invites
  FOR DELETE
  USING (
    tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)
  );


-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: industry_benchmarks — shared/seeded data, no tenant_id.
--         RLS on with NO permissive policy → service-role reads fine,
--         anon/authenticated get zero rows (deny-all by default).
-- ────────────────────────────────────────────────────────────────────────────
-- No policies to create; RLS was enabled in Step 1.
-- Explicitly ensure no stale permissive policies exist:
DROP POLICY IF EXISTS tenant_isolation_all ON public.industry_benchmarks;
DROP POLICY IF EXISTS tenant_isolation     ON public.industry_benchmarks;
DROP POLICY IF EXISTS select_own           ON public.industry_benchmarks;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: benchmark_contributions — anonymized aggregate data, no tenant_id.
--         Same deny-all posture as industry_benchmarks.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_all ON public.benchmark_contributions;
DROP POLICY IF EXISTS tenant_isolation     ON public.benchmark_contributions;
DROP POLICY IF EXISTS select_own           ON public.benchmark_contributions;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: Catch-all dynamic sweep — any table with a tenant_id column that
--         still has NO policies at all (possible future tables landed before
--         this migration ran, or tables we missed above).
--         Only creates a policy when pg_policies shows zero rows for the table.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.tablename
    FROM   pg_tables t
    WHERE  t.schemaname = 'public'
      -- table has a tenant_id column
      AND EXISTS (
        SELECT 1
        FROM   information_schema.columns c
        WHERE  c.table_schema = 'public'
          AND  c.table_name   = t.tablename
          AND  c.column_name  = 'tenant_id'
      )
      -- but no policies yet
      AND NOT EXISTS (
        SELECT 1
        FROM   pg_policies p
        WHERE  p.schemaname = 'public'
          AND  p.tablename  = t.tablename
      )
      -- skip tables with append-only semantics managed in migration 046
      AND t.tablename NOT IN (
        'approval_snapshots',
        'content_attestations',
        'audit_log',
        'content_decisions',
        'bypass_attempts'
      )
  LOOP
    -- SELECT
    EXECUTE format(
      'CREATE POLICY select_own ON public.%I FOR SELECT '
      || 'USING (tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text));',
      r.tablename
    );
    -- INSERT
    EXECUTE format(
      'CREATE POLICY insert_own ON public.%I FOR INSERT '
      || 'WITH CHECK (tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text));',
      r.tablename
    );
    -- UPDATE
    EXECUTE format(
      'CREATE POLICY update_own ON public.%I FOR UPDATE '
      || 'USING (tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text)) '
      || 'WITH CHECK (tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text));',
      r.tablename
    );
    -- DELETE
    EXECUTE format(
      'CREATE POLICY delete_own ON public.%I FOR DELETE '
      || 'USING (tenant_id = (SELECT id FROM public.tenants WHERE clerk_user_id = auth.uid()::text));',
      r.tablename
    );
  END LOOP;
END $$;


-- ============================================================================
-- VERIFICATION QUERY (run manually in Supabase SQL editor after applying)
-- ============================================================================
/*

-- 1. Tables with RLS disabled (should return 0 rows after this migration):
SELECT tablename
FROM   pg_tables
WHERE  schemaname = 'public'
  AND  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname  = 'public'
      AND  c.relname  = tablename
      AND  c.relrowsecurity = true
  )
ORDER BY tablename;

-- 2. Tables with tenant_id but zero RLS policies (should return 0 rows,
--    except intentional no-policy tables like industry_benchmarks,
--    benchmark_contributions which have no tenant_id and are excluded):
SELECT t.tablename
FROM   pg_tables t
WHERE  t.schemaname = 'public'
  AND  EXISTS (
    SELECT 1
    FROM   information_schema.columns c
    WHERE  c.table_schema = 'public'
      AND  c.table_name   = t.tablename
      AND  c.column_name  = 'tenant_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM   pg_policies p
    WHERE  p.schemaname = 'public'
      AND  p.tablename  = t.tablename
  )
ORDER BY t.tablename;

-- 3. Full policy inventory — review for correctness:
SELECT tablename, policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER BY tablename, cmd;

-- 4. Confirm team_members and team_invites have 4 policies each:
SELECT tablename, COUNT(*) AS policy_count
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  IN ('team_members', 'team_invites')
GROUP BY tablename;
-- Expected: team_members → 4, team_invites → 4

-- 5. Confirm deny-all tables have RLS on but zero policies:
SELECT c.relname AS tablename, c.relrowsecurity AS rls_enabled,
       COUNT(p.policyname) AS policy_count
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
LEFT   JOIN pg_policies p
         ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE  n.nspname = 'public'
  AND  c.relname IN ('industry_benchmarks', 'benchmark_contributions')
GROUP BY c.relname, c.relrowsecurity;
-- Expected: rls_enabled = true, policy_count = 0 for both

*/
