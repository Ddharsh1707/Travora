-- =============================================================================
-- Supabase refuses DELETE / UPDATE statements without a WHERE clause on API
-- requests ("safeupdate"). Local test databases do not have that guard, so this
-- reads every function in the catalogue and fails on any plain
-- "delete from <table>;" or "update <table> set ...;" with no WHERE.
-- (ON CONFLICT ... DO UPDATE and trigger assignments are not affected.)
-- Read-only; runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

do $$
declare
  r record;
  stmt text;
  bad text[] := '{}';
  checked int := 0;
begin
  for r in
    select n.nspname || '.' || p.proname as fn, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
        or (n.nspname in ('public', 'private') and p.prolang = (select oid from pg_language where lanname = 'sql'))
  loop
    checked := checked + 1;
    for stmt in
      select m[1] from regexp_matches(
               -- without comments and quoted text, so messages like 'could not update x' do not count
               -- and without row locks ("select ... for update"), which are not statements
               regexp_replace(regexp_replace(regexp_replace(r.prosrc, '--[^\n]*', '', 'g'), '''[^'']*''', '''''', 'g'), '\mfor\s+update\M', '', 'gi'),
               '(\m(?:delete\s+from|update)\s+[a-z_][a-z0-9_.]*[^;]*;)', 'gi') m
    loop
      -- ON CONFLICT ... DO UPDATE SET is not a plain UPDATE.
      continue when stmt ~* '^\s*update\s+set\s';
      if stmt !~* '\mwhere\M' then
        bad := bad || format('%s: %s', r.fn, left(regexp_replace(btrim(stmt), '\s+', ' ', 'g'), 120));
      end if;
    end loop;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: statements Supabase refuses without a WHERE clause: %', array_to_string(bad, ' | ');
  end if;
  raise notice 'ok - none of % functions has a DELETE or UPDATE without a WHERE clause', checked;
end $$;

rollback;
