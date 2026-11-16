-- =============================================================================
-- Each company's data stays separate inside the functions too
-- (20261116120000_tenant_isolation_functions.sql).
-- The functions that skip the table rules now run as trapple_definer, which
-- the "same company only" rule applies to. Company 2's Director and Travel
-- Desk call every dashboard, list and action; nothing of company 1 comes back
-- or changes. Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema tf;
grant usage on schema tf to authenticated, anon;
create function tf.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function tf.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function tf.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- How many rows a statement changed.
create function tf.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt; get diagnostics n = row_count; return n;
end $$;
-- 'p' + 7 zeros, so company 1 and company 2 get different ids for the same thing.
create function tf.u(p text, tail text) returns uuid language sql immutable as $$
  select (p || '0000000-0000-0000-0000-' || lpad(tail, 12, '0'))::uuid
$$;

-- Login ids: dr/td/ba/ap/em -> fa/fc/fd/fb/fe.
create function tf.uid(p text, code text) returns uuid language sql immutable as $$
  select tf.u(p, case code when 'dr' then 'fa' when 'td' then 'fc' when 'ba' then 'fd' when 'ap' then 'fb' else 'fe' end)
$$;

-- Same records for each company. Run as the database owner (no signed-in user).
create function tf.seed(p text, company uuid) returns void language plpgsql as $$
begin
  insert into public.profiles (id, employee_id, full_name, email, role, company_id) values
    (tf.u(p, 'a1'), 'TIDR', 'Ti Director ' || p,    'ti-dr-' || p || '@x.example', 'admin',         company),
    (tf.u(p, 'c1'), 'TITD', 'Ti Travel Desk ' || p, 'ti-td-' || p || '@x.example', 'company_admin', company),
    (tf.u(p, 'd1'), 'TIBA', 'Ti Booking ' || p,     'ti-ba-' || p || '@x.example', 'travel_desk',   company),
    (tf.u(p, 'b1'), 'TIAP', 'Ti Approver ' || p,    'ti-ap-' || p || '@x.example', 'approver',      company);
  insert into public.profiles (id, employee_id, full_name, email, role, manager_id, company_id) values
    (tf.u(p, 'e1'), 'TIEM', 'Ti Employee ' || p,    'ti-em-' || p || '@x.example', 'employee', tf.u(p, 'b1'), company);
  insert into public.profiles (id, employee_id, full_name, company_id) values
    (tf.u(p, 'f1'), 'TIWK', 'Ti Worker ' || p, company);
  insert into auth.users (id, email, email_confirmed_at)
  select tf.uid(p, r), 'ti-' || r || '-' || p || '@x.example', now()
    from unnest(array['dr', 'td', 'ba', 'ap', 'em']) r;

  insert into public.projects (id, name, kind, company_id) values (tf.u(p, '101'), 'Ti Project ' || p, 'project', company);
  insert into public.contractors (id, name, company_id) values (tf.u(p, '102'), 'Ti Contractor ' || p, company);
  insert into public.person_aliases (profile_id, alias) values (tf.u(p, 'f1'), 'Worker Ti ' || p);

  insert into public.travel_requests (id, employee_id, approver_id, origin, destination, departure_date, purpose) values
    (tf.u(p, '201'), tf.u(p, 'e1'), tf.u(p, 'b1'), 'Hyderabad', 'Chennai', '2026-12-01', 'Site visit');
  insert into public.approvals (request_id, approver_id, status) values (tf.u(p, '201'), tf.u(p, 'b1'), 'approved');
  insert into public.travel_records (id, employee_id, request_id, origin, destination, departure_date, booking_reference, amount, project_id) values
    (tf.u(p, '301'), tf.u(p, 'e1'), tf.u(p, '201'), 'Hyderabad', 'Chennai', '2026-12-01', 'TIPNR' || p, 1500, tf.u(p, '101'));
  insert into public.cost_lines (travel_record_id, line_type, amount, currency, amount_state) values
    (tf.u(p, '301'), 'fare', 1500, 'INR', 'recorded');
  insert into public.documents (id, employee_id, travel_record_id, storage_path, original_filename, mime_type) values
    (tf.u(p, '401'), tf.u(p, 'e1'), tf.u(p, '301'), tf.u(p, 'e1') || '/' || tf.u(p, '402') || '.pdf', 'ticket.pdf', 'application/pdf');
  insert into public.expenses (employee_id, expense_date, category, description, amount) values
    (tf.u(p, 'e1'), '2026-12-01', 'cab', 'Airport cab', 450);

  insert into public.bulk_bookings (id, title, group_reference, origin, destination, departure_date, total_cost, company_id) values
    (tf.u(p, '501'), 'Crew ' || p, 'TIGRP' || p, 'Hyderabad', 'Kakinada', '2026-12-05', 800, company);
  insert into public.bulk_booking_members (bulk_booking_id, employee_id, amount) values (tf.u(p, '501'), tf.u(p, 'f1'), 800);

  insert into public.import_batches (id, original_filename, file_kind, company_id) values (tf.u(p, '601'), 'sheet.xlsx', 'xlsx', company);
  insert into public.import_rows (batch_id, row_number, status, profile_id) values (tf.u(p, '601'), 1, 'valid', tf.u(p, 'f1'));
  insert into public.name_match_reviews (batch_id, name_key, display_name, suggested_profile_id) values
    (tf.u(p, '601'), 'ti worker ' || p, 'Ti Worker ' || p, tf.u(p, 'f1'));

  insert into storage.objects (bucket_id, name) values
    ('travel-documents', tf.u(p, 'e1') || '/' || tf.u(p, '402') || '.pdf'),
    ('import-files', tf.u(p, '601') || '/' || tf.u(p, '602') || '.xlsx');
end $$;

-- Company 1 is the existing company (seeded while it is the only one, like today).
create table tf.c (n int primary key, id uuid not null);
insert into tf.c values (1, (select id from public.companies order by created_at, id limit 1));
select tf.seed('1', (select id from tf.c where n = 1));

-- Company 2 arrives.
insert into public.companies (id, name) values ('9c000000-0000-0000-0000-000000000002', 'Ti Other Co');
insert into tf.c values (2, '9c000000-0000-0000-0000-000000000002');
select tf.seed('2', (select id from tf.c where n = 2));


-- An expense id for company 1 (expenses get random ids).
create table tf.x (k text primary key, id uuid);
insert into tf.x select 'expense1', id from public.expenses where employee_id = tf.u('1', 'e1');

-- ---------------------------------------------------------------------------
-- Every function that skips the table rules is either restricted or on the
-- short reviewed list
-- ---------------------------------------------------------------------------
select tf.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and pg_get_userbyid(p.proowner) <> 'trapple_definer'
     and (n.nspname || '.' || p.proname) <> all (private.owner_kept_functions())),
  'every SECURITY DEFINER function runs as trapple_definer, or is on the reviewed list (alter function … owner to trapple_definer)');
select tf.ok((select count(*) from pg_proc p where pg_get_userbyid(p.proowner) = 'trapple_definer') >= 50,
             'the business functions run as trapple_definer');
select tf.ok(not (select rolbypassrls from pg_roles where rolname = 'trapple_definer'), 'trapple_definer does not skip the rules');
select tf.ok(not has_schema_privilege('trapple_definer', 'public', 'CREATE') and not has_schema_privilege('trapple_definer', 'private', 'CREATE'),
             'trapple_definer cannot create objects (it only runs the functions it was given)');

grant usage on schema tf to authenticated;
grant select on all tables in schema tf to authenticated;
grant execute on all functions in schema tf to authenticated;

-- Company 1 markers that must never appear in company 2's results.
create function tf.has_company1(v text) returns boolean language sql immutable as $$
  select v like '%10000000-0000-0000-0000-%' or v ~ '(Ti (Employee|Worker|Director|Approver|Booking|Travel Desk|Project|Contractor) 1)|TIPNR1|TIGRP1|Crew 1'
$$;
create function tf.call(stmt text) returns text language plpgsql as $$
declare v text;
begin
  execute stmt into v; return coalesce(v, '');
exception when others then return 'error: ' || sqlerrm;
end $$;
grant execute on function tf.has_company1(text), tf.call(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: every dashboard and list, as company 2's Director and Travel Desk
-- ---------------------------------------------------------------------------
set local role authenticated;

do $$
declare
  who text; stmt text; v text; seen_own boolean; ran int := 0;
  calls text[] := array[
    'select json_agg(t)::text from public.admin_list_people() t',
    'select public.bi_employees()::text', 'select public.bi_filter_options()::text',
    'select public.bi_finance()::text', 'select public.bi_insights()::text',
    'select public.bi_overview()::text', 'select public.bi_projects()::text',
    'select public.bi_report()::text', 'select public.bi_travel()::text',
    'select public.ceo_dashboard(''2026-01-01'', ''2026-12-31'')::text', 'select public.dashboard_counts()::text',
    'select json_agg(t)::text from public.import_history() t',
    'select public.people_spend_overview(''2026-01-01'', ''2026-12-31'')::text',
    'select json_agg(t)::text from public.project_choices() t',
    'select public.spend_summary()::text', 'select public.workforce_analytics()::text',
    'select json_agg(t)::text from public.workforce_list() t',
    'select public.travel_report(''2026-01-01'', ''2026-12-31'', null, null)::text',
    'select public.workforce_detail(''10000000-0000-0000-0000-0000000000f1'')::text',
    'select public.bi_project_detail(''10000000-0000-0000-0000-000000000101'')::text',
    'select public.import_report(''10000000-0000-0000-0000-000000000601'')::text',
    'select public.location_search(''Hyd'')::text'
  ];
begin
  foreach who in array array['dr', 'td'] loop
    perform tf.login(tf.uid('2', who));
    foreach stmt in array calls loop
      v := tf.call(stmt);
      if v like 'error:%' then
        raise notice 'note - company 2 % % -> %', who, split_part(split_part(stmt, 'public.', 2), '(', 1), v;
      else
        ran := ran + 1;
      end if;
      perform tf.ok(not tf.has_company1(v), format('company 2 %s: %s shows nothing of company 1', who, split_part(split_part(stmt, 'public.', 2), '(', 1)));
    end loop;
  end loop;
  perform tf.ok(ran >= 36, format('%s of 44 calls ran; the others asked for a company 1 record and got "not found"', ran));
  -- and the functions still work for their own company
  perform tf.login(tf.uid('2', 'dr'));
  seen_own := tf.call('select json_agg(t)::text from public.admin_list_people() t') like '%Ti Employee 2%'
          and tf.call('select json_agg(t)::text from public.workforce_list() t') like '%Ti Worker 2%';
  perform tf.ok(seen_own, 'company 2 Director still sees company 2 in the people and workforce lists');
end $$;

-- ---------------------------------------------------------------------------
-- Changing: every action aimed at company 1 is refused or changes nothing
-- ---------------------------------------------------------------------------
select tf.login(tf.uid('2', 'dr'));
select tf.throws($$select public.admin_set_role('10000000-0000-0000-0000-0000000000e1', 'approver')$$, 'company 2 cannot change a company 1 role');
select tf.throws($$select public.admin_set_active('10000000-0000-0000-0000-0000000000e1', false)$$, 'company 2 cannot deactivate a company 1 person');
select tf.throws($$select public.admin_reset_password('10000000-0000-0000-0000-0000000000e1', 'Abcdefghijk12')$$, 'company 2 cannot reset a company 1 password');
select tf.throws($$select public.admin_create_login('10000000-0000-0000-0000-0000000000f1', 'Abcdefghijk12')$$, 'company 2 cannot create a login for a company 1 person');
select tf.call($$select public.admin_delete_people(array['10000000-0000-0000-0000-0000000000e1'::uuid])::text$$);
select tf.throws($$select public.decide_travel_request('10000000-0000-0000-0000-000000000201', 'rejected', 'no')$$, 'company 2 cannot decide a company 1 request');
select tf.throws(format($$select public.decide_expense(%L, 'rejected', 'no')$$, (select id from tf.x where k = 'expense1')), 'company 2 cannot decide a company 1 expense');
select tf.throws($$select public.bulk_cancel('10000000-0000-0000-0000-000000000501', 'x')$$, 'company 2 cannot cancel a company 1 group booking');
select tf.throws($$select public.bulk_review('10000000-0000-0000-0000-000000000501', 'approved', 'x')$$, 'company 2 cannot review a company 1 group booking');
select tf.throws($$select public.document_confirm('10000000-0000-0000-0000-000000000401', '{}'::jsonb)$$, 'company 2 cannot confirm a company 1 ticket');
select tf.throws($$select public.import_cancel('10000000-0000-0000-0000-000000000601')$$, 'company 2 cannot cancel a company 1 upload');
select tf.throws($$select public.import_attach_file('10000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000601/10000000-0000-0000-0000-000000000602.xlsx', 10, null)$$,
                 'company 2 cannot attach a file to a company 1 upload');
select tf.throws($$select public.trip_assign_project('10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000101')$$, 'company 2 cannot change a company 1 trip''s project');
select tf.throws($$select public.workforce_set_type('10000000-0000-0000-0000-0000000000f1', 'contract')$$, 'company 2 cannot classify a company 1 worker');
select tf.throws($$select public.workforce_verify('10000000-0000-0000-0000-0000000000f1')$$, 'company 2 cannot verify a company 1 worker');
select tf.throws($$select public.workforce_merge('10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', 'x')$$, 'company 2 cannot merge a company 1 worker');
select tf.throws($$select public.workforce_alias_add('10000000-0000-0000-0000-0000000000f1', 'Planted Alias')$$, 'company 2 cannot add a name to a company 1 worker');

-- Company 2's own work still runs, and the same names as company 1 are fine.
select tf.ok(public.project_create('Ti Project 1', null, null) is not null, 'company 2 can create a project with the same name as one in company 1');
select tf.ok((select company_id from public.profiles where id = public.workforce_add_person('Ti Worker 1')) = '9c000000-0000-0000-0000-000000000002',
             'adding "Ti Worker 1" in company 2 makes a company 2 person, not a link to company 1');

-- "Reset all data" by company 2's Director clears company 2 only.
select tf.ok((public.admin_reset_data('everything', 'RESET') ->> 'trips')::int >= 1, 'company 2 Director can reset company 2');

-- ---------------------------------------------------------------------------
-- Company 1 is untouched
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
select tf.ok((select role::text || active::text from public.profiles where id = tf.u('1', 'e1')) = 'employeetrue', 'company 1 employee still there, same role, still active');
select tf.ok((select status from public.bulk_bookings where id = tf.u('1', '501')) = 'confirmed', 'company 1 group booking still confirmed');
select tf.ok((select status::text from public.travel_requests where id = tf.u('1', '201')) <> 'rejected', 'company 1 request not decided by company 2');
select tf.ok((select status from public.expenses where id = (select id from tf.x where k = 'expense1')) = 'submitted', 'company 1 expense not decided by company 2');
select tf.ok((select workforce_type from public.profiles where id = tf.u('1', 'f1')) is distinct from 'contract', 'company 1 worker not reclassified');
select tf.ok(not exists (select 1 from public.person_aliases where alias = 'Planted Alias'), 'no name planted on a company 1 worker');
select tf.ok((select count(*) from public.travel_records where company_id = (select id from tf.c where n = 1)) >= 1
         and (select count(*) from public.documents where company_id = (select id from tf.c where n = 1)) = 1
         and (select count(*) from public.import_batches where company_id = (select id from tf.c where n = 1)) = 1
         and (select count(*) from public.projects where company_id = (select id from tf.c where n = 1)) >= 1,
             'company 1 trips, tickets, uploads and projects survive company 2''s reset');
select tf.ok((select count(*) from public.travel_records where company_id = (select id from tf.c where n = 2)) = 0, 'company 2''s own trips were reset');

-- Work with no signed-in person (the service role, sign-up triggers) still sees every company.
set local role trapple_definer;
select tf.ok((select count(distinct company_id) from public.profiles) = 2, 'with no signed-in person, the restricted role still reaches every company');
reset role;

rollback;
