-- Migration 022: Ensure ON DELETE CASCADE on every per-tenant table
-- so that DELETE FROM tenants WHERE id = '...' wipes the entire footprint of
-- a user. Without this, self-service account deletion fails with an FK error.
--
-- Idempotent: drops any existing tenant_id FK first, then re-adds it with CASCADE.
-- Safe to run on a DB where the constraint is already CASCADE — the DROP then re-CREATE
-- ends up where it started.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Find every FK in the public schema that points at tenants.id
  FOR r IN
    SELECT
      con.conname    AS constraint_name,
      cl.relname     AS table_name,
      con.confdeltype AS on_delete
    FROM   pg_constraint con
    JOIN   pg_class      cl   ON cl.oid = con.conrelid
    JOIN   pg_namespace  ns   ON ns.oid = cl.relnamespace
    JOIN   pg_class      ref  ON ref.oid = con.confrelid
    WHERE  ns.nspname  = 'public'
      AND  con.contype = 'f'
      AND  ref.relname = 'tenants'
      AND  con.confdeltype <> 'c'   -- 'c' = CASCADE
  LOOP
    RAISE NOTICE 'Upgrading FK %.% to ON DELETE CASCADE', r.table_name, r.constraint_name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',                r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
      r.table_name, r.constraint_name
    );
  END LOOP;
END $$;
