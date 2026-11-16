-- =============================================================================
-- Each company's data stays separate (20261116100000_tenant_isolation.sql).
-- Two companies get the same people, trips, requests, tickets, expenses,
-- group bookings, uploads and files. In every role, neither company can see,
-- change or link to the other's records.
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema ti;
grant usage on schema ti to authenticated, anon;
create function ti.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function ti.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function ti.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- How many rows a statement changed.
create function ti.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt; get diagnostics n = row_count; return n;
end $$;
-- 'p' + 7 zeros, so company 1 and company 2 get different ids for the same thing.
create function ti.u(p text, tail text) returns uuid language sql immutable as $$
  select (p || '0000000-0000-0000-0000-' || lpad(tail, 12, '0'))::uuid
$$;

-- Login ids: dr/td/ba/ap/em -> fa/fc/fd/fb/fe.
create function ti.uid(p text, code text) returns uuid language sql immutable as $$
  select ti.u(p, case code when 'dr' then 'fa' when 'td' then 'fc' when 'ba' then 'fd' when 'ap' then 'fb' else 'fe' end)
$$;

-- Same records for each company. Run as the database owner (no signed-in user).
create function ti.seed(p text, company uuid) returns void language plpgsql as $$
begin
  insert into public.profiles (id, employee_id, full_name, email, role, company_id) values
    (ti.u(p, 'a1'), 'TIDR', 'Ti Director ' || p,    'ti-dr-' || p || '@x.example', 'admin',         company),
    (ti.u(p, 'c1'), 'TITD', 'Ti Travel Desk ' || p, 'ti-td-' || p || '@x.example', 'company_admin', company),
    (ti.u(p, 'd1'), 'TIBA', 'Ti Booking ' || p,     'ti-ba-' || p || '@x.example', 'travel_desk',   company),
    (ti.u(p, 'b1'), 'TIAP', 'Ti Approver ' || p,    'ti-ap-' || p || '@x.example', 'approver',      company);
  insert into public.profiles (id, employee_id, full_name, email, role, manager_id, company_id) values
    (ti.u(p, 'e1'), 'TIEM', 'Ti Employee ' || p,    'ti-em-' || p || '@x.example', 'employee', ti.u(p, 'b1'), company);
  insert into public.profiles (id, employee_id, full_name, company_id) values
    (ti.u(p, 'f1'), 'TIWK', 'Ti Worker ' || p, company);
  insert into auth.users (id, email, email_confirmed_at)
  select ti.uid(p, r), 'ti-' || r || '-' || p || '@x.example', now()
    from unnest(array['dr', 'td', 'ba', 'ap', 'em']) r;

  insert into public.projects (id, name, kind, company_id) values (ti.u(p, '101'), 'Ti Project ' || p, 'project', company);
  insert into public.contractors (id, name, company_id) values (ti.u(p, '102'), 'Ti Contractor ' || p, company);
  insert into public.person_aliases (profile_id, alias) values (ti.u(p, 'f1'), 'Worker Ti ' || p);

  insert into public.travel_requests (id, employee_id, approver_id, origin, destination, departure_date, purpose) values
    (ti.u(p, '201'), ti.u(p, 'e1'), ti.u(p, 'b1'), 'Hyderabad', 'Chennai', '2026-12-01', 'Site visit');
  insert into public.approvals (request_id, approver_id, status) values (ti.u(p, '201'), ti.u(p, 'b1'), 'approved');
  insert into public.travel_records (id, employee_id, request_id, origin, destination, departure_date, booking_reference, amount, project_id) values
    (ti.u(p, '301'), ti.u(p, 'e1'), ti.u(p, '201'), 'Hyderabad', 'Chennai', '2026-12-01', 'TIPNR' || p, 1500, ti.u(p, '101'));
  insert into public.cost_lines (travel_record_id, line_type, amount, currency, amount_state) values
    (ti.u(p, '301'), 'fare', 1500, 'INR', 'recorded');
  insert into public.documents (id, employee_id, travel_record_id, storage_path, original_filename, mime_type) values
    (ti.u(p, '401'), ti.u(p, 'e1'), ti.u(p, '301'), ti.u(p, 'e1') || '/' || ti.u(p, '402') || '.pdf', 'ticket.pdf', 'application/pdf');
  insert into public.expenses (employee_id, expense_date, category, description, amount) values
    (ti.u(p, 'e1'), '2026-12-01', 'cab', 'Airport cab', 450);

  insert into public.bulk_bookings (id, title, group_reference, origin, destination, departure_date, total_cost, company_id) values
    (ti.u(p, '501'), 'Crew ' || p, 'TIGRP' || p, 'Hyderabad', 'Kakinada', '2026-12-05', 800, company);
  insert into public.bulk_booking_members (bulk_booking_id, employee_id, amount) values (ti.u(p, '501'), ti.u(p, 'f1'), 800);

  insert into public.import_batches (id, original_filename, file_kind, company_id) values (ti.u(p, '601'), 'sheet.xlsx', 'xlsx', company);
  insert into public.import_rows (batch_id, row_number, status, profile_id) values (ti.u(p, '601'), 1, 'valid', ti.u(p, 'f1'));
  insert into public.name_match_reviews (batch_id, name_key, display_name, suggested_profile_id) values
    (ti.u(p, '601'), 'ti worker ' || p, 'Ti Worker ' || p, ti.u(p, 'f1'));

  insert into storage.objects (bucket_id, name) values
    ('travel-documents', ti.u(p, 'e1') || '/' || ti.u(p, '402') || '.pdf'),
    ('import-files', ti.u(p, '601') || '/' || ti.u(p, '602') || '.xlsx');
end $$;

-- Company 1 is the existing company (seeded while it is the only one, like today).
create table ti.c (n int primary key, id uuid not null);
insert into ti.c values (1, (select id from public.companies order by created_at, id limit 1));
select ti.seed('1', (select id from ti.c where n = 1));
select ti.ok((select count(*) from public.profiles where id = ti.u('1', 'e1') and company_id = (select id from ti.c where n = 1)) = 1,
             'a person added with one company gets it by default');

-- Company 2 arrives.
insert into public.companies (id, name) values ('9c000000-0000-0000-0000-000000000002', 'Ti Other Co');
insert into ti.c values (2, '9c000000-0000-0000-0000-000000000002');
select ti.ok(private.default_company_id() is null, 'with two companies, nothing defaults to a company without a signed-in person');
select ti.seed('2', (select id from ti.c where n = 2));

select ti.ok((select count(*) from public.travel_records where company_id = (select id from ti.c where n = 2)) = 1
         and (select count(*) from public.bulk_booking_members where company_id = (select id from ti.c where n = 2)) = 1
         and (select count(*) from public.import_rows where company_id = (select id from ti.c where n = 2)) = 1,
             'company 2 trip, group booking member and upload row take company 2 from what they point at');
select ti.ok((select count(*) from public.profiles where employee_id = 'TIEM') = 2, 'the same employee code is fine in two companies');
select ti.throws($$insert into public.profiles (employee_id, full_name, company_id) values ('TIEM', 'Dup', '9c000000-0000-0000-0000-000000000002')$$,
                 'employee codes are still unique inside one company');
select ti.throws($$insert into public.travel_records (employee_id, request_id, origin, destination, departure_date)
                   values ('10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-000000000201', 'A', 'B', '2026-12-09')$$,
                 'a trip cannot point at a person in one company and a request in another');

grant usage on schema ti to authenticated;
grant select on ti.c to authenticated;
grant execute on all functions in schema ti to authenticated;

-- What one person can see of the other company: '' when nothing.
create function ti.leaks(other uuid, other_p text) returns text language plpgsql as $$
declare t text; n bigint; found text[] := '{}';
begin
  foreach t in array array[
    'profiles', 'travel_requests', 'travel_records', 'documents', 'expenses', 'approvals',
    'bulk_bookings', 'bulk_booking_members', 'import_batches', 'import_rows', 'name_match_reviews',
    'audit_logs', 'contractors', 'cost_lines', 'identity_merges', 'location_aliases',
    'person_aliases', 'project_aliases', 'projects'
  ] loop
    execute format('select count(*) from public.%I where company_id = $1', t) into n using other;
    if n > 0 then found := found || format('%s(%s)', t, n); end if;
  end loop;
  select count(*) into n from public.companies where id = other;
  if n > 0 then found := found || 'companies'::text; end if;
  select count(*) into n from storage.objects where name like other_p || '%';
  if n > 0 then found := found || format('files(%s)', n); end if;
  select count(*) into n from public.travel_records_search where employee_id::text like other_p || '%';
  if n > 0 then found := found || 'travel_records_search'::text; end if;
  return array_to_string(found, ', ');
end $$;
grant execute on function ti.leaks(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading: every role, both directions
-- ---------------------------------------------------------------------------
set local role authenticated;

do $$
declare
  r record; me text; other text; other_id uuid; leaked text;
begin
  for r in select * from (values ('dr', 'Director'), ('td', 'Travel Desk'), ('ba', 'Booking assistant'),
                                 ('ap', 'Approver'), ('em', 'Employee')) v(code, label) loop
    foreach me in array array['1', '2'] loop
      other := case me when '1' then '2' else '1' end;
      other_id := (select id from ti.c where n = other::int);
      perform ti.login(ti.uid(me, r.code));
      leaked := ti.leaks(other_id, other);
      perform ti.ok(leaked = '', format('company %s %s sees nothing of company %s%s', me, r.label, other,
                                        case when leaked <> '' then ': ' || leaked else '' end));
    end loop;
  end loop;
end $$;

-- Each company still sees its own records exactly as before.
select ti.login(ti.uid('1', 'dr'));
select ti.ok((select count(*) from public.profiles) >= 6, 'company 1 Director still sees company 1 people');
select ti.ok((select count(*) from public.travel_records) >= 1, 'company 1 Director still sees company 1 trips');
select ti.ok((select count(*) from storage.objects) >= 2, 'company 1 Director still sees company 1 files');
select ti.ok((select count(*) from public.companies) = 1, 'each company sees only its own company row');
select ti.ok(private.can_view_employee(ti.u('1', 'e1')), 'company 1 Director can view a company 1 employee');
select ti.ok(not private.can_view_employee(ti.u('2', 'e1')), 'company 1 Director cannot view a company 2 employee');
select ti.login(ti.uid('1', 'em'));
select ti.ok((select count(*) from public.travel_records) = 1, 'company 1 employee sees their own trip');
select ti.ok((select count(*) from public.documents) = 1, 'company 1 employee sees their own ticket');
select ti.login(ti.uid('1', 'ap'));
select ti.ok((select count(*) from public.travel_requests) = 1, 'company 1 approver sees their team''s request');
select ti.login(ti.uid('2', 'td'));
select ti.ok(private.current_company_id() = '9c000000-0000-0000-0000-000000000002', 'the signed-in company is known');
select ti.ok(private.default_company_id() = '9c000000-0000-0000-0000-000000000002', 'new rows default to the signed-in company');

-- ---------------------------------------------------------------------------
-- Writing: company 2 staff cannot touch company 1
-- ---------------------------------------------------------------------------
select ti.login(ti.uid('2', 'dr'));
select ti.ok(ti.affected($$update public.travel_records set notes = '{x}' where company_id = (select id from ti.c where n = 1)$$) = 0,
             'company 2 Director cannot change company 1 trips');
select ti.ok(ti.affected($$update public.profiles set department = 'X' where company_id = (select id from ti.c where n = 1)$$) = 0,
             'company 2 Director cannot change company 1 people');
select ti.ok(ti.affected($$delete from public.documents where company_id = (select id from ti.c where n = 1)$$) = 0,
             'company 2 Director cannot delete company 1 tickets');
select ti.ok(ti.affected($$delete from public.travel_records where company_id = (select id from ti.c where n = 1)$$) = 0,
             'company 2 Director cannot delete company 1 trips');
select ti.throws($$insert into public.travel_records (employee_id, origin, destination, departure_date)
                   values ('10000000-0000-0000-0000-0000000000e1', 'A', 'B', '2026-12-09')$$,
                 'company 2 Director cannot add a trip for a company 1 person');
insert into public.profiles (employee_id, full_name, company_id) values ('TINEW', 'Planted', (select id from ti.c where n = 1));
select ti.ok((select company_id from public.profiles where employee_id = 'TINEW') = '9c000000-0000-0000-0000-000000000002',
             'a person company 2 tries to add to company 1 lands in company 2 instead');
select ti.throws($$update public.travel_records set company_id = (select id from ti.c where n = 1) where id = '20000000-0000-0000-0000-000000000301'$$,
                 'a trip cannot be moved to another company');
select ti.throws($$insert into public.travel_requests (employee_id, approver_id, origin, destination, departure_date, purpose)
                   values ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000b1', 'A', 'B', '2026-12-09', 'x')$$,
                 'a request cannot be sent to another company''s approver');
select ti.throws($$insert into storage.objects (bucket_id, name)
                   values ('travel-documents', '10000000-0000-0000-0000-0000000000e1/30000000-0000-0000-0000-000000000001.pdf')$$,
                 'company 2 Director cannot file a ticket under a company 1 person');

-- The same employee code as company 1 works when company 2 adds a person.
insert into public.profiles (employee_id, full_name) values ('TIDR2', 'Ti New Hire 2');
select ti.ok((select company_id from public.profiles where employee_id = 'TIDR2') = '9c000000-0000-0000-0000-000000000002',
             'a person added by company 2 belongs to company 2');

select ti.login(ti.uid('2', 'em'));
insert into public.travel_requests (employee_id, origin, destination, departure_date, purpose, company_id)
values ('20000000-0000-0000-0000-0000000000e1', 'Hyderabad', 'Pune', '2026-12-10', 'Training', (select id from ti.c where n = 1));
select ti.ok((select company_id from public.travel_requests where destination = 'Pune') = '9c000000-0000-0000-0000-000000000002',
             'a request always lands in the employee''s own company, whatever company is sent');

-- Audit entries carry the company and stay inside it.
select ti.login(ti.uid('2', 'dr'));
select ti.ok((select count(*) from public.audit_logs where entity_id = (select id::text from public.profiles where employee_id = 'TIDR2')) >= 1,
             'company 2 Director sees the audit entry for their own change');
select ti.login(ti.uid('1', 'dr'));
select ti.ok((select count(*) from public.audit_logs where entity_id = (select id::text from public.profiles where employee_id = 'TIDR2')) = 0,
             'company 1 Director does not see company 2''s audit entries');
reset role;
select ti.ok((select company_id from public.audit_logs where entity_type = 'profiles'
               and entity_id = (select id::text from public.profiles where employee_id = 'TIDR2') limit 1) = '9c000000-0000-0000-0000-000000000002',
             'audit entries record the company');

rollback;
