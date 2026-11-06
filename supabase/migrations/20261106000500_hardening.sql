-- =============================================================================
-- Phase 8: hardening
--
-- Phase 1 granted EXECUTE on every private.* function to signed-in users,
-- because RLS policies call the read-only helpers (is_staff, can_view_employee
-- and so on). The helpers that WRITE data are only meant to be called from
-- inside other checked database functions, so users lose direct access to them.
-- The private schema is not exposed through the API, so this is defence in
-- depth; the RLS suite checks it stays this way.
-- =============================================================================

revoke execute on function private.write_audit(text, text, text, jsonb) from authenticated, anon, public;
revoke execute on function private.bulk_sync_records(uuid) from authenticated, anon, public;

-- Functions created in private from now on are not callable by users unless a
-- migration grants it on purpose.
alter default privileges in schema private revoke execute on functions from authenticated;
