-- 045_rls_lockdown.sql
-- ============================================================================
-- CRITICAL DEFENSE-IN-DEPTH: enable Row Level Security on EVERY public table.
--
-- Why this matters:
--   The Supabase anon key is public (it ships in NEXT_PUBLIC_SUPABASE_ANON_KEY).
--   Any table in the `public` schema that does NOT have RLS enabled is readable
--   (and possibly writable) directly through the Supabase REST API (PostgREST)
--   using that public key — completely bypassing the Vigmis API and its
--   per-tenant filtering. Tables like platform_tokens, client_settings,
--   audit_log, tenants, team_members were missing RLS.
--
-- Why this is SAFE for the running app:
--   The Vigmis API connects with the SERVICE-ROLE key, which has the BYPASSRLS
--   attribute — it is unaffected by any policy here. The web app imports only
--   TYPES from @vigmis/db and never opens a Supabase client. So enabling RLS
--   changes nothing for legitimate traffic; it only slams the door on direct
--   anon-key access.
--
-- Effect for the anon/authenticated roles:
--   RLS is enabled and the only policy keys off current_setting('app.tenant_id'),
--   which those roles never set → they get ZERO rows. Fail-secure by default.
--
-- This migration is fully idempotent — safe to run multiple times.
-- ============================================================================

-- 1) Enable RLS on every table in the public schema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- 2) For every table that HAS a tenant_id column, (re)create a consistent
--    tenant-isolation policy. This is what would let a future per-request
--    authenticated client (that sets app.tenant_id) read its own rows.
--    The service-role key bypasses it regardless.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.tablename
    FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = t.tablename
          AND c.column_name = 'tenant_id'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_all ON public.%I;', r.tablename);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_all ON public.%I '
      || 'USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) '
      || 'WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid);',
      r.tablename
    );
  END LOOP;
END $$;

-- 3) The `tenants` table is keyed by clerk_user_id (no tenant_id column). RLS is
--    enabled above; with no permissive policy, anon/authenticated get zero rows
--    while the service-role key still has full access. That is the desired,
--    most-secure default — no policy is added here on purpose.

-- NOTE: This does not touch the `storage` schema (Supabase Storage buckets) or
-- `auth` schema. Configure storage bucket policies separately in the dashboard.
