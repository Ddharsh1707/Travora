-- =============================================================================
-- Restricted function role: remove the "create in schema" right after handover
--
-- 20261116120000_tenant_isolation_functions.sql hands the business functions to
-- the role trapple_definer. Postgres only lets a role own a function if it may
-- create objects in that function's schema, so on the live database the
-- handover first failed ("permission denied for schema public") and was rolled
-- back. The fix was to run, once, on the live database before re-applying it:
--
--   create role trapple_definer nologin nobypassrls;
--   grant create on schema public, private to trapple_definer;
--
-- Ownership, once given, does not need that right any more, so this takes it
-- back: trapple_definer keeps only what the functions need to run.
--
-- When a later migration adds a SECURITY DEFINER function, wrap its handover:
--   grant create on schema public, private to trapple_definer;
--   alter function … owner to trapple_definer;
--   revoke create on schema public, private from trapple_definer;
--
-- Who can do what: unchanged. Safe to run more than once.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'trapple_definer') then
    revoke create on schema public, private from trapple_definer;
  end if;
end;
$$;
