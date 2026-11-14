-- =============================================================================
-- Temporary workforce, part 1: data model, access and login rules
-- (20261115100000_workforce_model.sql).
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema wf;
grant usage on schema wf to authenticated, anon;
create function wf.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function wf.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function wf.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema wf to authenticated, anon;

-- People with logins (linked by the email-confirmation trigger).
insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('7a000000-0000-0000-0000-0000000000a1', 'WDIR', 'Wf Director',   'wdir@x.example',  'Management', 'admin'),
  ('7a000000-0000-0000-0000-0000000000c1', 'WTDK', 'Wf Travel Desk','wtdk@x.example',  'Admin',      'company_admin'),
  ('7a000000-0000-0000-0000-0000000000d1', 'WBKA', 'Wf Booking',    'wbka@x.example',  'Travel',     'travel_desk'),
  ('7a000000-0000-0000-0000-0000000000b1', 'WAPP', 'Wf Approver',   'wapp@x.example',  'Projects',   'approver'),
  ('7a000000-0000-0000-0000-0000000000e1', 'WEMP', 'Wf Employee',   'wemp@x.example',  'Projects',   'employee');
insert into auth.users (id, email, email_confirmed_at) values
  ('7b000000-0000-0000-0000-0000000000a1', 'wdir@x.example', now()),
  ('7b000000-0000-0000-0000-0000000000c1', 'wtdk@x.example', now()),
  ('7b000000-0000-0000-0000-0000000000d1', 'wbka@x.example', now()),
  ('7b000000-0000-0000-0000-0000000000b1', 'wapp@x.example', now()),
  ('7b000000-0000-0000-0000-0000000000e1', 'wemp@x.example', now());

-- ---------------------------------------------------------------------------
-- Defaults and classification of new people
-- ---------------------------------------------------------------------------
select wf.ok((select workforce_type = 'permanent_employee' and verification_status = 'verified' and source = 'manual'
                from public.profiles where employee_id = 'WEMP'),
  'people added the usual way are verified permanent employees');

-- An upload function (runs as the database owner) adding an unmatched name.
insert into public.profiles (id, employee_id, full_name)
values ('7a000000-0000-0000-0000-0000000000f1', 'NEW-ABCD1234', 'Ravi Kumar');
select wf.ok((select workforce_type = 'unknown' and verification_status = 'imported_unverified' and source = 'import'
                from public.profiles where employee_id = 'NEW-ABCD1234'),
  'a person an upload creates is unknown and unverified, not an employee');

-- Added directly in the database with a real employee code (for example the
-- first Director, from bootstrap_first_admin.sql): a normal employee.
insert into public.profiles (id, employee_id, full_name)
values ('7a000000-0000-0000-0000-0000000000f2', 'SHEET-77', 'Sheet Person');
select wf.ok((select workforce_type = 'permanent_employee' and verification_status = 'verified'
                from public.profiles where employee_id = 'SHEET-77'),
  'someone added in the database with a real employee code is a verified permanent employee');

set local role authenticated;

-- Travel Desk adds a contract worker by hand.
select wf.login('7b000000-0000-0000-0000-0000000000c1');
insert into public.profiles (id, employee_id, full_name, workforce_type, verification_status, source)
values ('7a000000-0000-0000-0000-0000000000f3', 'CW-001', 'Contract Worker', 'contract_worker', 'merged', 'import');
select wf.ok((select workforce_type = 'contract_worker' and verification_status = 'verified' and source = 'manual'
                from public.profiles where employee_id = 'CW-001'),
  'Travel Desk: can add a contract worker by hand; status and source are set by the database');

-- The booking assistant may add employees, but not other kinds of worker.
select wf.login('7b000000-0000-0000-0000-0000000000d1');
select wf.throws($$insert into public.profiles (employee_id, full_name, workforce_type)
                   values ('TW-002', 'Temp Worker', 'temporary_worker')$$,
  'booking assistant: cannot add a temporary worker');

-- Plain updates from the browser cannot change the classification.
select wf.login('7b000000-0000-0000-0000-0000000000a1');
update public.profiles
   set workforce_type = 'permanent_employee', verification_status = 'verified', source = 'manual'
 where employee_id = 'NEW-ABCD1234';
reset role;
select wf.ok((select workforce_type = 'unknown' and verification_status = 'imported_unverified' and source = 'import'
                from public.profiles where employee_id = 'NEW-ABCD1234'),
  'Director: a plain update cannot change workforce type or verification (checked functions only)');

-- Merge state must be consistent.
select wf.throws($$update public.profiles set verification_status = 'merged' where employee_id = 'SHEET-77'$$,
  'a person cannot be marked merged without saying who they were merged into');
select wf.throws($$update public.profiles set merged_into = id where employee_id = 'SHEET-77'$$,
  'a person cannot be merged into themselves');

-- ---------------------------------------------------------------------------
-- Logins: only permanent employees
-- ---------------------------------------------------------------------------
select wf.throws($$update public.profiles set user_id = '7b000000-0000-0000-0000-0000000000e1'
                   where employee_id = 'NEW-ABCD1234'$$,
  'an unknown imported person can never be linked to a login, even by a checked function');

update public.profiles set email = 'ravi.temp@x.example' where employee_id = 'NEW-ABCD1234';
insert into auth.users (id, email, email_confirmed_at)
values ('7b000000-0000-0000-0000-0000000000f1', 'ravi.temp@x.example', now());
select wf.ok((select user_id is null from public.profiles where employee_id = 'NEW-ABCD1234'),
  'confirming an email that matches a temporary worker does not link a login');

set local role authenticated;
select wf.login('7b000000-0000-0000-0000-0000000000a1');
update public.profiles set email = 'cw@x.example' where employee_id = 'CW-001';
select wf.throws($$select public.admin_create_login('7a000000-0000-0000-0000-0000000000f3', 'TempPassword123')$$,
  'Director: cannot create a login for a contract worker');
reset role;
select wf.ok(not exists (select 1 from auth.users where email = 'cw@x.example'),
  'the refused login left no account behind');

-- ---------------------------------------------------------------------------
-- Contractors, aliases and merge history
-- ---------------------------------------------------------------------------
insert into public.contractors (id, name) values
  ('7c000000-0000-0000-0000-000000000001', 'Sri Sai Labour Services');
select wf.throws($$insert into public.contractors (name) values ('  sri sai labour   services ')$$,
  'the same contractor cannot be added twice with different spacing or case');

insert into public.person_aliases (profile_id, alias, source)
values ('7a000000-0000-0000-0000-0000000000f1', 'KUMAR/RAVI MR', 'import_link');
select wf.ok((select alias_key = private.person_name_key('Ravi Kumar') from public.person_aliases
               where profile_id = '7a000000-0000-0000-0000-0000000000f1'),
  'an alias is matched with the same name key as uploads');
select wf.throws($$insert into public.person_aliases (profile_id, alias)
                   values ('7a000000-0000-0000-0000-0000000000f2', 'Mr Ravi Kumar')$$,
  'one spelling can only belong to one person');
select wf.throws($$insert into public.person_aliases (profile_id, alias) values ('7a000000-0000-0000-0000-0000000000f2', '1234')$$,
  'an alias with no readable name is refused');

insert into public.identity_merges (from_profile, into_profile, moved, evidence)
values ('7a000000-0000-0000-0000-0000000000f2', '7a000000-0000-0000-0000-0000000000f1',
        '{"travel_records": []}', 'Same PNR history');
select wf.throws($$insert into public.identity_merges (from_profile, into_profile, evidence)
                   values ('7a000000-0000-0000-0000-0000000000f1', '7a000000-0000-0000-0000-0000000000f1', 'self')$$,
  'a person cannot be merged with themselves');

set local role authenticated;

select wf.login('7b000000-0000-0000-0000-0000000000d1');
select wf.ok((select count(*) from public.contractors) = 1
         and (select count(*) from public.person_aliases) = 1
         and (select count(*) from public.identity_merges) = 1,
  'booking assistant: can see contractors, aliases and merge history');
select wf.throws($$insert into public.contractors (name) values ('Another Supplier')$$,
  'booking assistant: cannot add a contractor directly');

select wf.login('7b000000-0000-0000-0000-0000000000c1');
select wf.ok((select count(*) from public.person_aliases) = 1, 'Travel Desk: can see aliases');
select wf.throws($$insert into public.person_aliases (profile_id, alias)
                   values ('7a000000-0000-0000-0000-0000000000f1', 'R Kumar')$$,
  'Travel Desk: aliases are only added through checked functions');
select wf.throws($$delete from public.identity_merges$$, 'Travel Desk: cannot delete merge history');

select wf.login('7b000000-0000-0000-0000-0000000000b1');
select wf.ok((select count(*) from public.contractors) = 0
         and (select count(*) from public.person_aliases) = 0
         and (select count(*) from public.identity_merges) = 0,
  'approver: sees no contractors, aliases or merges');

select wf.login('7b000000-0000-0000-0000-0000000000e1');
select wf.ok((select count(*) from public.contractors) = 0
         and (select count(*) from public.person_aliases) = 0
         and (select count(*) from public.identity_merges) = 0,
  'employee: sees no contractors, aliases or merges');

reset role;
select wf.ok(exists (select 1 from public.audit_logs where entity_type = 'person_aliases' and action = 'insert')
         and exists (select 1 from public.audit_logs where entity_type = 'identity_merges' and action = 'insert'),
  'aliases and merges are written to the audit log');

rollback;
