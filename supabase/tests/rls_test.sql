-- =============================================================================
-- Authorization test suite (Phase 1).
-- Runs inside a transaction that is rolled back, so it leaves no data behind.
-- Each failed check raises an exception and stops the run.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema t;
grant usage on schema t to authenticated, anon;

create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- Passes when the statement raises an error (any authorization/constraint error).
create function t.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (blocked: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;

-- Returns how many rows a query yields for the current role.
create function t.cnt(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) s', q) into n;
  return n;
end $$;

create function t.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------------------
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;

insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'ADM001', 'Asha Admin',   'admin@example.com',  'IT',          'admin'),
  ('00000000-0000-0000-0000-0000000000d1', 'TD001',  'Dev Desk',     'desk@example.com',   'Travel',      'travel_desk'),
  ('00000000-0000-0000-0000-0000000000b1', 'MGR001', 'Meera Manager','m1@example.com',     'Engineering', 'approver'),
  ('00000000-0000-0000-0000-0000000000b2', 'MGR002', 'Mohan Manager','m2@example.com',     'Finance',     'approver'),
  ('00000000-0000-0000-0000-0000000000e1', 'EMP001', 'Arun Kumar',   'e1@example.com',     'Engineering', 'employee'),
  ('00000000-0000-0000-0000-0000000000e2', 'EMP002', 'Bina Rao',     'e2@example.com',     'Finance',     'employee'),
  ('00000000-0000-0000-0000-0000000000f1', 'EMP099', 'Old Leaver',   'gone@example.com',   'Finance',     'employee'),
  ('00000000-0000-0000-0000-0000000000c1', 'EMP100', 'No Login Yet', null,                 'Finance',     'employee');
update public.profiles set manager_id = '00000000-0000-0000-0000-0000000000b1' where employee_id = 'EMP001';
update public.profiles set manager_id = '00000000-0000-0000-0000-0000000000b2' where employee_id = 'EMP002';
update public.profiles set active = false where employee_id = 'EMP099';

-- Logins. Linking happens via the auth trigger when the email is confirmed.
insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-0000000000a1', 'admin@example.com', now()),
  ('10000000-0000-0000-0000-0000000000d1', 'desk@example.com',  now()),
  ('10000000-0000-0000-0000-0000000000b1', 'm1@example.com',    now()),
  ('10000000-0000-0000-0000-0000000000b2', 'm2@example.com',    now()),
  ('10000000-0000-0000-0000-0000000000e1', 'e1@example.com',    now()),
  ('10000000-0000-0000-0000-0000000000e2', 'e2@example.com',    now()),
  ('10000000-0000-0000-0000-0000000000f1', 'gone@example.com',  now()),
  ('10000000-0000-0000-0000-0000000000aa', 'stranger@example.com', now());
-- Unconfirmed sign-up using a real employee's address must NOT be linked.
insert into public.profiles (id, employee_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000000e3', 'EMP003', 'Chitra', 'e3@example.com');
insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-0000000000e3', 'e3@example.com', null);

select t.ok((select count(*) from public.profiles where user_id is not null) = 7, 'confirmed logins linked to their profiles');
select t.ok((select user_id from public.profiles where employee_id = 'EMP003') is null, 'unconfirmed email is not linked');

insert into public.travel_requests (id, employee_id, origin, destination, departure_date, purpose, approver_id) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Chennai', 'Delhi',  '2026-11-14', 'Client visit', '00000000-0000-0000-0000-0000000000b1'),
  ('20000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Mumbai',  'Pune',   '2026-11-20', 'Audit',        '00000000-0000-0000-0000-0000000000b2');
insert into public.travel_records (id, employee_id, origin, destination, departure_date, airline_or_provider, booking_reference, amount) values
  ('30000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Chennai', 'Delhi', '2026-10-14', 'IndiGo',   'PNRE1', 8450),
  ('30000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', 'Mumbai',  'Pune',  '2026-10-14', 'Vistara',  'PNRE2', 5200);
insert into public.documents (employee_id, storage_path, original_filename, mime_type) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2/40000000-0000-0000-0000-0000000000e2.pdf', 'ticket.pdf', 'application/pdf');
insert into storage.objects (bucket_id, name) values
  ('travel-documents', '00000000-0000-0000-0000-0000000000e2/40000000-0000-0000-0000-0000000000e2.pdf');

-- ---------------------------------------------------------------------------
-- Logged-out (anon) gets nothing
-- ---------------------------------------------------------------------------
set local role anon;
select t.throws('select * from public.profiles', 'anon cannot read profiles');
select t.throws('select * from public.travel_records', 'anon cannot read travel records');
select t.throws($$select public.get_my_profile()$$, 'anon cannot call RPCs');
reset role;

-- ---------------------------------------------------------------------------
-- Employee A (EMP001)
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login('10000000-0000-0000-0000-0000000000e1');

select t.ok((select employee_id from public.get_my_profile()) = 'EMP001', 'employee: get_my_profile returns self');
select t.ok(t.cnt('select 1 from public.profiles') = 2, 'employee: sees own profile + own manager only');
select t.ok(t.cnt($$select 1 from public.profiles where employee_id = 'EMP002'$$) = 0, 'employee A cannot see employee B profile');
select t.ok(t.cnt('select 1 from public.travel_requests') = 1, 'employee: sees only own requests');
select t.ok(t.cnt($$select 1 from public.travel_records where employee_id = '00000000-0000-0000-0000-0000000000e2'$$) = 0,
            'employee A asking for B''s records by id gets nothing (URL/API tampering)');
select t.ok(t.cnt('select 1 from public.documents') = 0, 'employee A cannot see B''s documents');
select t.ok(t.cnt('select 1 from storage.objects') = 0, 'employee A cannot see B''s stored files');
select t.ok(t.cnt('select 1 from public.audit_logs') = 0, 'employee cannot read audit logs');

select t.throws($$insert into public.travel_requests (employee_id, origin, destination, departure_date, purpose)
                  values ('00000000-0000-0000-0000-0000000000e2', 'X', 'Y', '2026-12-01', 'spoof')$$,
                'employee cannot create a request for someone else');

insert into public.travel_requests (id, employee_id, origin, destination, departure_date, purpose, status, approver_id)
values ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'Chennai', 'Goa', '2026-12-05',
        'Site visit', 'approved', '00000000-0000-0000-0000-0000000000b2');
select t.ok((select status::text from public.travel_requests where id = '20000000-0000-0000-0000-0000000000a2') = 'pending',
            'employee-chosen status is forced back to pending');
select t.ok((select approver_id from public.travel_requests where id = '20000000-0000-0000-0000-0000000000a2') = '00000000-0000-0000-0000-0000000000b1',
            'employee cannot pick their approver; routed to own manager');

select t.throws($$update public.travel_requests set status = 'approved' where id = '20000000-0000-0000-0000-0000000000a2'$$,
                'employee cannot self-approve with UPDATE');
select t.throws($$select public.decide_travel_request('20000000-0000-0000-0000-0000000000a2', 'approved', 'me')$$,
                'employee cannot call decide_travel_request');
select t.throws($$select public.admin_set_role('00000000-0000-0000-0000-0000000000e1', 'admin')$$,
                'employee cannot call admin_set_role');
update public.profiles set role = 'admin' where employee_id = 'EMP001';
select t.ok(private.current_app_role() = 'employee', 'employee UPDATE of own role has no effect');
select t.throws($$insert into public.approvals (request_id, approver_id, status) values
                  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1', 'approved')$$,
                'employee cannot write approvals directly');
select t.throws($$insert into public.travel_records (employee_id, origin, destination, departure_date)
                  values ('00000000-0000-0000-0000-0000000000e1', 'A', 'B', '2026-10-01')$$,
                'employee cannot create travel records');
select t.throws($$delete from public.audit_logs$$, 'employee cannot delete audit logs');

-- Documents / storage
select t.throws($$insert into public.documents (employee_id, storage_path, original_filename, mime_type)
                  values ('00000000-0000-0000-0000-0000000000e1',
                          '00000000-0000-0000-0000-0000000000e2/40000000-0000-0000-0000-000000000099.pdf', 'x.pdf', 'application/pdf')$$,
                'document path must be in the owner''s own folder');
select t.throws($$insert into public.documents (employee_id, storage_path, original_filename, mime_type)
                  values ('00000000-0000-0000-0000-0000000000e1',
                          '00000000-0000-0000-0000-0000000000e1/40000000-0000-0000-0000-000000000099.exe', 'x.exe', 'application/x-msdownload')$$,
                'disallowed file type rejected');
insert into storage.objects (bucket_id, name)
values ('travel-documents', '00000000-0000-0000-0000-0000000000e1/40000000-0000-0000-0000-0000000000e1.pdf');
select t.ok(true, 'employee can upload into own folder');
select t.throws($$insert into storage.objects (bucket_id, name)
                  values ('travel-documents', '00000000-0000-0000-0000-0000000000e2/40000000-0000-0000-0000-000000000077.pdf')$$,
                'employee cannot upload into another employee''s folder');
select t.throws($$insert into storage.objects (bucket_id, name)
                  values ('travel-documents', '00000000-0000-0000-0000-0000000000e1/../../etc/passwd.pdf')$$,
                'unsafe storage path rejected');

-- AI history
insert into public.ai_conversations (id) values ('50000000-0000-0000-0000-0000000000e1');
select t.throws($$insert into public.ai_conversations (id, user_id) values
                  (gen_random_uuid(), '10000000-0000-0000-0000-0000000000e2')$$,
                'cannot create an AI conversation as someone else');
select t.throws($$insert into public.ai_messages (conversation_id, role, content)
                  values ('50000000-0000-0000-0000-0000000000e1', 'assistant', 'forged')$$,
                'browser cannot forge assistant messages');
reset role;

-- ---------------------------------------------------------------------------
-- Employee B cannot see A's AI conversation
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login('10000000-0000-0000-0000-0000000000e2');
select t.ok(t.cnt('select 1 from public.ai_conversations') = 0, 'employee B cannot see A''s AI conversations');
select t.ok(t.cnt('select 1 from public.travel_records') = 1, 'employee B sees only own travel record');
reset role;

-- ---------------------------------------------------------------------------
-- Approver M1 (manager of EMP001)
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login('10000000-0000-0000-0000-0000000000b1');
select t.ok(t.cnt($$select 1 from public.profiles where employee_id = 'EMP001'$$) = 1, 'approver sees direct report');
select t.ok(t.cnt($$select 1 from public.profiles where employee_id = 'EMP002'$$) = 0, 'approver cannot see employees outside scope');
select t.ok(t.cnt($$select 1 from public.travel_records where employee_id = '00000000-0000-0000-0000-0000000000e2'$$) = 0,
            'approver cannot see out-of-scope travel records');
select t.ok(t.cnt('select 1 from public.travel_requests') = 2, 'approver sees requests of direct report');
update public.travel_requests set status = 'approved' where id = '20000000-0000-0000-0000-0000000000e1';
select t.ok((select status::text from public.travel_requests where id = '20000000-0000-0000-0000-0000000000e1') = 'pending',
            'approver plain UPDATE has no effect');
select public.decide_travel_request('20000000-0000-0000-0000-0000000000e1', 'approved', 'OK for client visit');
select t.ok((select status::text from public.travel_requests where id = '20000000-0000-0000-0000-0000000000e1') = 'approved',
            'approver can approve in-scope request via RPC');
select t.throws($$select public.decide_travel_request('20000000-0000-0000-0000-0000000000e1', 'rejected', 'changed mind')$$,
                'already-decided request cannot be decided again');
select t.throws($$select public.decide_travel_request('20000000-0000-0000-0000-0000000000e2', 'approved', null)$$,
                'approver cannot decide out-of-scope request');
select t.ok(t.cnt('select 1 from public.approvals') = 1, 'approval history row visible to approver');
reset role;

-- ---------------------------------------------------------------------------
-- Travel Desk
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login('10000000-0000-0000-0000-0000000000d1');
select t.ok(t.cnt('select 1 from public.profiles') = 9, 'travel desk sees all employees');
select t.ok(t.cnt($$select 1 from public.travel_records where departure_date = '2026-10-14'$$) = 2, 'travel desk sees travel on a date');
insert into public.profiles (employee_id, full_name, department) values ('EMP200', 'Imported Person', 'Ops');
select t.ok(true, 'travel desk can add an employee (e.g. from import)');
select t.throws($$insert into public.profiles (employee_id, full_name, role) values ('EMP201', 'Sneaky', 'admin')$$,
                'travel desk cannot create an admin');
select t.throws($$update public.profiles set role = 'admin' where employee_id = 'EMP002'$$,
                'travel desk cannot change roles');
select t.throws($$select public.decide_travel_request('20000000-0000-0000-0000-0000000000e2', 'approved', null)$$,
                'travel desk cannot approve requests');
insert into public.travel_records (employee_id, origin, destination, departure_date, booking_reference, amount)
values ('00000000-0000-0000-0000-0000000000e2', 'Pune', 'Mumbai', '2026-10-16', 'PNRE2B', 5100);
select t.ok(true, 'travel desk can create travel records');
select t.throws($$insert into public.travel_records (employee_id, origin, destination, departure_date, booking_reference)
                  values ('00000000-0000-0000-0000-0000000000e2', 'Pune', 'Mumbai', '2026-10-16', 'PNRE2B')$$,
                'duplicate booking (same employee, date, PNR) rejected');
select t.ok(t.cnt('select 1 from storage.objects') = 2, 'travel desk can see all stored files');
select t.ok(t.cnt('select 1 from public.audit_logs') = 0, 'travel desk cannot read audit logs');
delete from public.travel_records where booking_reference = 'PNRE2B';
select t.ok(t.cnt($$select 1 from public.travel_records where booking_reference = 'PNRE2B'$$) = 1, 'travel desk cannot delete travel records (admin only)');
reset role;

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login('10000000-0000-0000-0000-0000000000a1');
select t.ok(t.cnt('select 1 from public.audit_logs') > 0, 'admin can read audit logs');
select public.admin_set_role('00000000-0000-0000-0000-0000000000e2', 'approver');
select t.ok(t.cnt($$select 1 from public.audit_logs where entity_type = 'profiles' and metadata->>'role_to' = 'approver'$$) = 1,
            'role change is audited with from/to');
select t.ok(t.cnt($$select 1 from public.audit_logs where metadata->>'status_to' = 'approved'$$) = 1, 'approval is audited');
select t.ok(t.cnt($$select 1 from public.audit_logs where metadata::text ilike '%Client visit%' or metadata::text ilike '%8450%'$$) = 0,
            'audit log does not copy personal/financial values');
select t.throws($$select public.admin_set_role('00000000-0000-0000-0000-0000000000a1', 'employee')$$,
                'last active admin cannot be demoted');
select t.throws($$select public.admin_set_active('00000000-0000-0000-0000-0000000000a1', false)$$,
                'admin cannot deactivate themselves');
select t.throws($$update public.audit_logs set action = 'tampered'$$, 'admin cannot edit audit logs');
reset role;

-- ---------------------------------------------------------------------------
-- Deactivated employee and a login with no employee profile
-- ---------------------------------------------------------------------------
set local role authenticated;
select t.login('10000000-0000-0000-0000-0000000000f1');
select t.ok(t.cnt('select 1 from public.profiles') = 0, 'deactivated account sees nothing');
select t.throws($$insert into public.travel_requests (employee_id, origin, destination, departure_date, purpose)
                  values ('00000000-0000-0000-0000-0000000000f1', 'A', 'B', '2026-12-01', 'x')$$,
                'deactivated account cannot create requests');
select t.login('10000000-0000-0000-0000-0000000000aa');
select t.ok(t.cnt('select 1 from public.travel_records') = 0, 'login without a profile sees nothing');
select t.ok(t.cnt('select 1 from public.get_my_profile()') = 0, 'login without a profile has no role');
reset role;

-- Even the database owner cannot rewrite history.
select t.throws($$delete from public.audit_logs$$, 'audit logs are append-only for the owner too');

-- RLS must be on for every public table.
select t.ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
            'RLS enabled on every public table');
select t.ok((select not public from storage.buckets where id = 'travel-documents'), 'document bucket is private');

\echo 'ALL AUTHORIZATION TESTS PASSED'
rollback;
