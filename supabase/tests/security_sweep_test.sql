-- =============================================================================
-- Security sweep: an "attacker's checklist" that reads the database catalogue,
-- so every table, view, function and bucket added later is checked too.
--   1. Catalogue rules (RLS on, views run as the caller, safe search_path,
--      private buckets, nothing granted to logged-out visitors).
--   2. A logged-out visitor (anon) cannot read anything or call anything.
--   3. An ordinary employee cannot see one row of another employee's data in
--      ANY table or view, and cannot call any Travel Desk / Director function.
--   4. An employee cannot promote themselves or take over another login.
-- Runs inside a transaction that is rolled back, so it leaves no data behind.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema sweep;
grant usage on schema sweep to authenticated, anon;

create function sweep.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

create function sweep.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema sweep to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Catalogue rules
-- ---------------------------------------------------------------------------
select sweep.ok(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  'every public table has row level security switched on');

select sweep.ok(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  'every public view runs as the caller (security_invoker), so it cannot bypass RLS');

select sweep.ok(not exists (
  select 1 from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) s where s like 'search_path=%')),
  'every SECURITY DEFINER function pins its search_path');

select sweep.ok(not exists (select 1 from storage.buckets where public), 'no storage bucket is public');
select sweep.ok(not exists (select 1 from storage.buckets where file_size_limit is null or allowed_mime_types is null),
  'every bucket has a file size limit and a list of allowed file types');

select sweep.ok(not exists (
  select 1 from pg_policies
   where schemaname in ('public', 'storage') and (roles && array['anon', 'public']::name[])),
  'no row level security policy lets logged-out visitors in');

select sweep.ok(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
  'logged-out visitors have no rights on any public table or view');

select sweep.ok(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute')),
  'logged-out visitors cannot call any public database function');

select sweep.ok(not has_schema_privilege('anon', 'private', 'usage'), 'logged-out visitors cannot reach the private schema');

select sweep.ok(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and (has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'truncate'))),
  'no app user can TRUNCATE a table (TRUNCATE skips row level security)');

select sweep.ok(not exists (
  select 1 from pg_proc p
   where p.proname = 'ai_record_exchange' and has_function_privilege('authenticated', p.oid, 'execute')),
  'only the server can write AI conversation history');

-- ---------------------------------------------------------------------------
-- Fixtures: two employees with logins, B has data everywhere.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('5e000000-0000-0000-0000-0000000000b1', 'SWMGR', 'Sweep Manager', 'sw-m@example.com', 'Ops', 'approver'),
  ('5e000000-0000-0000-0000-0000000000a1', 'SWEA',  'Sweep Alice',   'sw-a@example.com', 'Ops', 'employee'),
  ('5e000000-0000-0000-0000-0000000000a2', 'SWEB',  'Sweep Bob',     'sw-b@example.com', 'Ops', 'employee'),
  ('5e000000-0000-0000-0000-0000000000d1', 'SWDIR', 'Sweep Director','sw-d@example.com', 'Board', 'admin'),
  ('5e000000-0000-0000-0000-0000000000c1', 'SWNEW', 'Sweep No Login','sw-n@example.com', 'Ops', 'employee');
update public.profiles set manager_id = '5e000000-0000-0000-0000-0000000000b1'
 where id in ('5e000000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-0000000000a2');
insert into auth.users (id, email, email_confirmed_at) values
  ('5e100000-0000-0000-0000-0000000000b1', 'sw-m@example.com', now()),
  ('5e100000-0000-0000-0000-0000000000a1', 'sw-a@example.com', now()),
  ('5e100000-0000-0000-0000-0000000000a2', 'sw-b@example.com', now()),
  ('5e100000-0000-0000-0000-0000000000d1', 'sw-d@example.com', now());

insert into public.travel_requests (id, employee_id, origin, destination, departure_date, purpose, approver_id) values
  ('5e200000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-0000000000a1', 'Chennai', 'Delhi', '2026-12-14', 'Alice trip', '5e000000-0000-0000-0000-0000000000b1'),
  ('5e200000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-0000000000a2', 'Mumbai',  'Pune',  '2026-12-20', 'Bob trip',   '5e000000-0000-0000-0000-0000000000b1');
insert into public.travel_records (id, employee_id, origin, destination, departure_date, airline_or_provider, booking_reference, amount) values
  ('5e300000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-0000000000a2', 'Mumbai', 'Pune', '2026-10-14', 'Vistara', 'SWPNRB', 5200);
insert into public.cost_lines (travel_record_id, line_type, amount) values ('5e300000-0000-0000-0000-0000000000a2', 'fare', 5200);
insert into public.documents (employee_id, storage_path, original_filename, mime_type) values
  ('5e000000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-0000000000a2/5e400000-0000-0000-0000-0000000000a2.pdf', 'bob.pdf', 'application/pdf');
insert into storage.objects (bucket_id, name) values
  ('travel-documents', '5e000000-0000-0000-0000-0000000000a2/5e400000-0000-0000-0000-0000000000a2.pdf');
insert into public.expenses (employee_id, category, amount, expense_date, description)
values ('5e000000-0000-0000-0000-0000000000a2', 'other', 900, '2026-10-15', 'Bob taxi');
insert into public.ai_conversations (id, user_id) values ('5e500000-0000-0000-0000-0000000000a2', '5e100000-0000-0000-0000-0000000000a2');

-- ---------------------------------------------------------------------------
-- 2. Logged-out visitor
-- ---------------------------------------------------------------------------
set local role anon;
do $$
declare r record; blocked boolean;
begin
  for r in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') loop
    blocked := false;
    begin
      execute format('select 1 from public.%I limit 1', r.relname);
    exception when insufficient_privilege then blocked := true;
    end;
    if not blocked then raise exception 'FAIL: logged-out visitor can read public.%', r.relname; end if;
  end loop;
  raise notice 'ok - logged-out visitor is refused on every table and view';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Employee Alice tries to see Bob's data, everywhere
-- ---------------------------------------------------------------------------
set local role authenticated;
select sweep.login('5e100000-0000-0000-0000-0000000000a1');

do $$
declare
  r record;
  n bigint;
  me constant uuid := '5e000000-0000-0000-0000-0000000000a1';
  my_login constant uuid := '5e100000-0000-0000-0000-0000000000a1';
  -- Shared reference data any signed-in user may read.
  shared constant text[] := array['companies', 'locations'];
  checked int := 0;
begin
  for r in
    select c.relname,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'employee_id' and not a.attisdropped) as has_emp,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped) as has_user
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  loop
    if r.relname = 'profiles' then
      execute $q$select count(*) from public.profiles where id <> $1 and id <> '5e000000-0000-0000-0000-0000000000b1'$q$ into n using me;
    elsif r.relname = 'employee_travel_summary' then
      -- Built on profiles, so the employee also sees their manager's name, but none of the manager's trips.
      execute $q$select count(*) from public.employee_travel_summary
                  where employee_id <> $1
                    and (employee_id <> '5e000000-0000-0000-0000-0000000000b1' or total_trips <> 0 or total_spend <> 0)$q$ into n using me;
    elsif r.relname = any (shared) then
      continue;
    elsif r.has_emp then
      execute format('select count(*) from public.%I where employee_id is distinct from $1', r.relname) into n using me;
    elsif r.has_user then
      execute format('select count(*) from public.%I where user_id is distinct from $1', r.relname) into n using my_login;
    elsif r.relname in ('ai_messages') then
      execute 'select count(*) from public.ai_messages m join public.ai_conversations c on c.id = m.conversation_id where c.user_id <> $1' into n using my_login;
    else
      -- No owner column: these hold Travel Desk / Director data (imports, projects,
      -- audit log, bulk bookings, cost lines of other people's trips ...).
      begin
        execute format('select count(*) from public.%I', r.relname) into n;
      exception when insufficient_privilege then n := 0;
      end;
    end if;
    if n <> 0 then
      raise exception 'FAIL: employee can see % row(s) of other people''s data in public.%', n, r.relname;
    end if;
    checked := checked + 1;
  end loop;
  raise notice 'ok - employee sees no other employee''s rows in any of % tables and views', checked;
end $$;

select sweep.ok((select count(*) from storage.objects
                  where split_part(name, '/', 1) <> '5e000000-0000-0000-0000-0000000000a1') = 0,
  'employee cannot list another employee''s stored files');

-- Every Travel Desk / Director function refuses an employee.
do $$
declare
  r record;
  -- Functions any signed-in person may call; they scope results to the caller themselves.
  open_to_all constant text[] := array[
    'get_my_profile', 'consume_rate_limit', 'decide_travel_request', 'record_report_generated',
    'spend_summary', 'travel_report', 'project_choices', 'location_search', 'dashboard_counts'];
  args text;
  checked int := 0;
begin
  for r in
    select p.oid, p.proname, p.pronargs
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and not (p.proname = any (open_to_all))
  loop
    select string_agg(format('null::%s', format_type(t, null)), ', ' order by o) into args
      from unnest((select p2.proargtypes::oid[] from pg_proc p2 where p2.oid = r.oid)) with ordinality as a(t, o);
    begin
      execute format('select public.%I(%s)', r.proname, coalesce(args, ''));
      raise exception 'FAIL: employee was allowed to run public.%', r.proname;
    exception
      when insufficient_privilege then null;   -- 42501: refused, as it should be
      when raise_exception then
        if sqlerrm like 'FAIL:%' then raise; end if;
        raise exception 'FAIL: public.% refused the employee with a non-permission error first: %', r.proname, sqlerrm;
    end;
    checked := checked + 1;
  end loop;
  raise notice 'ok - all % staff/Director functions refuse an ordinary employee', checked;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Privilege escalation attempts
-- ---------------------------------------------------------------------------
do $$
declare stmt text; label text; ok boolean;
begin
  for stmt, label in values
    ($s$update public.profiles set role = 'admin' where id = '5e000000-0000-0000-0000-0000000000a1'$s$, 'make myself Director'),
    ($s$insert into public.profiles (employee_id, full_name, email, role) values ('SWHACK', 'Hacker', 'h@example.com', 'admin')$s$, 'create a Director profile'),
    ($s$update public.profiles set user_id = '5e100000-0000-0000-0000-0000000000a1' where id = '5e000000-0000-0000-0000-0000000000c1'$s$, 'take over a profile with no login'),
    ($s$select public.admin_reset_password('5e000000-0000-0000-0000-0000000000d1', 'Hacked2026Password')$s$, 'reset the Director''s password'),
    ($s$select public.admin_set_role('5e000000-0000-0000-0000-0000000000a1', 'admin')$s$, 'promote myself with admin_set_role'),
    ($s$insert into public.audit_logs (action, entity_type) values ('fake', 'x')$s$, 'write a fake audit log entry'),
    ($s$select public.ai_record_exchange(null, null, null, null, null)$s$, 'write AI history directly'),
    ($s$update public.travel_requests set status = 'approved' where id = '5e200000-0000-0000-0000-0000000000a1'$s$, 'approve my own trip')
  loop
    ok := false;
    begin
      execute stmt;
      -- An UPDATE that matched no row (hidden by RLS) is also a refusal.
      get diagnostics ok = row_count;
      ok := not ok;
    exception when others then ok := true;
    end;
    if not ok then raise exception 'FAIL: employee could %', label; end if;
    raise notice 'ok - employee cannot %', label;
  end loop;
end $$;

select sweep.ok((select role::text from public.get_my_profile()) = 'employee', 'employee is still an employee after all attempts');
reset role;

rollback;
