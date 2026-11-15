-- =============================================================================
-- Group bookings could not be saved on the live site
--
-- Supabase refuses a DELETE or UPDATE without a WHERE clause on API requests
-- (the "safeupdate" guard: "DELETE requires a WHERE clause"). bulk_save()
-- empties its scratch list of travellers with "delete from pg_temp.bulk_new;",
-- so every group booking failed on the live site, from the Bulk bookings page
-- and from group tickets on Upload anything. Local test databases do not have
-- the guard, so the tests did not see it.
--
-- This changes that one statement to "... where true" (same meaning), in place,
-- the way 20261107000600_requests_admin_pdf.sql widened import_stage_v2.
-- Nothing else in bulk_save, and no data, changes. Who may call it is unchanged.
--
-- Safe to run more than once.
-- =============================================================================

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.bulk_save(uuid, jsonb, jsonb)'::regprocedure);
  if position('delete from pg_temp.bulk_new;' in v_def) > 0 then
    v_def := replace(v_def, 'delete from pg_temp.bulk_new;', 'delete from pg_temp.bulk_new where true;');
    if position('delete from pg_temp.bulk_new where true;' in v_def) = 0 then
      raise exception 'Could not update bulk_save';
    end if;
    execute v_def;
  end if;
end;
$$;
