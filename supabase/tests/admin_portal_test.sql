-- =============================================================================
-- Admin role, employee claims, stored upload files and the spend list.
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema ap;
grant usage on schema ap to authenticated, anon;
create function ap.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function ap.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function ap.allows(stmt text, label text) returns void language plpgsql as $$
begin
  -- Runs the statement, then undoes it so later checks see the same data.
  begin execute stmt; raise exception 'allows-rollback';
  exception when others then
    if sqlerrm = 'allows-rollback' then raise notice 'ok - % (allowed)', label; return; end if;
    raise exception 'FAIL: % (blocked: %)', label, sqlerrm;
  end;
end $$;
create function ap.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema ap to authenticated, anon;

insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('50000000-0000-0000-0000-0000000000a1', 'XCEO', 'Chief Exec',    'ceo@x.example',   'Management', 'admin'),
  ('50000000-0000-0000-0000-0000000000c1', 'XADM', 'Office Admin',  'adm@x.example',   'Admin',      'company_admin'),
  ('50000000-0000-0000-0000-0000000000c2', 'XAD2', 'Second Admin',  'adm2@x.example',  'Admin',      'company_admin'),
  ('50000000-0000-0000-0000-0000000000d1', 'XDSK', 'Desk Person',   'desk@x.example',  'Travel',     'travel_desk'),
  ('50000000-0000-0000-0000-0000000000e1', 'XE01', 'Ravi Kumar',    'ravi@x.example',  'Projects',   'employee'),
  ('50000000-0000-0000-0000-0000000000e2', 'XE02', 'Sita Devi',     'sita@x.example',  'Finance',    'employee'),
  ('50000000-0000-0000-0000-0000000000e3', 'XE03', 'No Login',      'nologin@x.example', 'Finance',  'employee');
insert into auth.users (id, email, email_confirmed_at) values
  ('60000000-0000-0000-0000-0000000000a1', 'ceo@x.example',  now()),
  ('60000000-0000-0000-0000-0000000000c1', 'adm@x.example',  now()),
  ('60000000-0000-0000-0000-0000000000c2', 'adm2@x.example', now()),
  ('60000000-0000-0000-0000-0000000000d1', 'desk@x.example', now()),
  ('60000000-0000-0000-0000-0000000000e1', 'ravi@x.example', now()),
  ('60000000-0000-0000-0000-0000000000e2', 'sita@x.example', now());
insert into public.projects (id, name, status) values ('70000000-0000-0000-0000-000000000001', 'HRRL Refinery', 'active');

-- Trips from the travel desk (one cancelled)
insert into public.travel_records (employee_id, origin, destination, departure_date, amount, booking_type, status, source, project_id) values
  ('50000000-0000-0000-0000-0000000000e1', 'HYD', 'BOM', '2026-09-02', 10000, 'flight', 'confirmed', 'import', '70000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-0000000000e1', 'BOM', 'HYD', '2026-09-05', 9000,  'flight', 'cancelled', 'import', '70000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-0000000000e2', 'DEL', 'MAA', '2026-09-10', 7000,  'train',  'confirmed', 'manual', null);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.ok(private.is_staff(), 'admin: counts as staff (travel desk permissions)');
select ap.ok(private.is_manager(), 'admin: is a manager (CEO or Admin)');
select ap.ok(private.has_role('admin'), 'Travel Desk (admin): has every Director (CEO) permission');
select ap.ok(private.has_role('travel_desk', 'admin', 'approver'), 'admin: passes travel desk / approver / CEO checks');
select ap.ok(private.has_role('approver', 'admin'), 'Travel Desk (admin): passes approver-or-Director checks');
select private.bi_require_viewer();
select ap.ok((select count(*) from public.projects) = 1, 'admin: can read projects like the travel desk');
select ap.login('60000000-0000-0000-0000-0000000000d1');
select ap.ok(not private.is_manager(), 'travel desk: is not a manager');
select ap.login('60000000-0000-0000-0000-0000000000e1');
select ap.ok(not private.is_staff() and not private.is_manager(), 'employee: not staff, not manager');

-- ---------------------------------------------------------------------------
-- Employee claims
-- ---------------------------------------------------------------------------
select ap.ok((select count(*) from public.project_choices()) = 1, 'employee: can pick from active projects');
select ap.ok((select count(*) from public.projects) = 0, 'employee: still cannot read the projects table');
insert into public.expenses (employee_id, expense_date, category, description, amount, project_id, origin, destination, source)
values ('50000000-0000-0000-0000-0000000000e2', '2026-09-03', 'cab', 'Airport cab', 1200, '70000000-0000-0000-0000-000000000001', ' HYD airport ', 'Site', 'upload');
select ap.ok((select employee_id from public.expenses where description = 'Airport cab') = '50000000-0000-0000-0000-0000000000e1',
  'employee: a claim filed for someone else is filed as their own');
select ap.ok((select origin = 'HYD airport' and source = 'upload' and status = 'submitted' from public.expenses where description = 'Airport cab'),
  'employee: project, from/to and upload source are saved');
select ap.throws($$insert into public.expenses (employee_id, expense_date, category, description, amount, project_id)
  values ('50000000-0000-0000-0000-0000000000e1', '2026-09-03', 'cab', 'Bad project', 10, gen_random_uuid())$$, 'employee: unknown project refused');
insert into public.expenses (employee_id, expense_date, category, description, amount) values
  ('50000000-0000-0000-0000-0000000000e1', '2026-09-04', 'meals', 'Dinner at site', 800),
  ('50000000-0000-0000-0000-0000000000e1', '2026-09-20', 'hotel', 'Withdrawn hotel', 5000);
update public.expenses set status = 'withdrawn' where description = 'Withdrawn hotel';
select ap.throws($$select public.decide_expense((select id from public.expenses where description = 'Airport cab'), 'approved')$$, 'employee: cannot approve claims');

select ap.login('60000000-0000-0000-0000-0000000000e2');
insert into public.expenses (employee_id, expense_date, category, description, amount) values
  ('50000000-0000-0000-0000-0000000000e2', '2026-09-11', 'meals', 'Sita lunch', 300);
select ap.ok((select count(*) from public.expenses) = 1, 'employee: sees only their own claims');
select ap.ok((select count(*) from public.spend_items) = 2, 'employee: spend list has only their own claim and trip');

-- CEO and Admin claims
select ap.login('60000000-0000-0000-0000-0000000000a1');
insert into public.expenses (employee_id, expense_date, category, description, amount) values
  ('50000000-0000-0000-0000-0000000000a1', '2026-09-12', 'hotel', 'CEO hotel', 9000);
select ap.login('60000000-0000-0000-0000-0000000000c2');
insert into public.expenses (employee_id, expense_date, category, description, amount) values
  ('50000000-0000-0000-0000-0000000000c2', '2026-09-13', 'cab', 'Admin2 cab', 400);

-- Admin decisions
select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.ok((select count(*) from public.expenses) = 6, 'admin: sees every claim');
select ap.ok((select status = 'approved' and reviewed_by_role = 'company_admin'
                from public.decide_expense((select id from public.expenses where description = 'Airport cab'), 'approved')),
  'admin: can approve an employee claim');
select ap.ok((select status from public.decide_expense((select id from public.expenses where description = 'Dinner at site'), 'rejected', 'No bill')) = 'rejected',
  'admin: can reject an employee claim');
select ap.allows($$select public.decide_expense((select id from public.expenses where description = 'CEO hotel'), 'approved')$$, 'Travel Desk: can decide the Director''s claim');
select ap.allows($$select public.decide_expense((select id from public.expenses where description = 'Admin2 cab'), 'approved')$$, 'Travel Desk: can decide another Travel Desk claim');
select ap.allows($$select public.decide_expense((select id from public.expenses where description = 'Dinner at site'), 'approved')$$, 'Travel Desk: can overrule an earlier decision like the Director');
select ap.allows($$update public.expenses set description = 'changed' where description = 'CEO hotel'$$, 'Travel Desk: can edit the Director''s claim');
insert into public.expenses (employee_id, expense_date, category, description, amount) values
  ('50000000-0000-0000-0000-0000000000e2', '2026-09-14', 'other', 'Filed by admin', 50);
select ap.ok((select employee_id from public.expenses where description = 'Filed by admin') = '50000000-0000-0000-0000-0000000000e2', 'admin: can file a claim for an employee');
select ap.allows($$insert into public.expenses (employee_id, expense_date, category, description, amount)
  values ('50000000-0000-0000-0000-0000000000a1', '2026-09-14', 'other', 'For the CEO', 50)$$, 'Travel Desk: can file a claim for the Director');

-- CEO final say
select ap.login('60000000-0000-0000-0000-0000000000a1');
select ap.ok((select status = 'approved' and reviewed_by_role = 'admin'
                from public.decide_expense((select id from public.expenses where description = 'Dinner at site'), 'approved', 'Bill found')),
  'CEO: can overrule an Admin''s rejection');
select ap.ok((select status from public.decide_expense((select id from public.expenses where description = 'Admin2 cab'), 'approved')) = 'approved',
  'CEO: can decide an Admin''s claim');
select ap.throws($$select public.decide_expense((select id from public.expenses where description = 'CEO hotel'), 'approved')$$, 'CEO: cannot decide their own claim');
select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.allows($$select public.decide_expense((select id from public.expenses where description = 'Dinner at site'), 'rejected')$$, 'Travel Desk: can overrule the Director');
select ap.ok((select status from public.decide_expense((select id from public.expenses where description = 'Dinner at site'), 'reimbursed')) = 'reimbursed',
  'admin: can mark an approved claim reimbursed');
select ap.login('60000000-0000-0000-0000-0000000000a1');
select ap.throws($$select public.decide_expense((select id from public.expenses where description = 'Dinner at site'), 'rejected')$$, 'CEO: cannot overrule after reimbursement');

-- Travel desk still cannot decide claims
select ap.login('60000000-0000-0000-0000-0000000000d1');
select ap.throws($$select public.decide_expense((select id from public.expenses where description = 'Sita lunch'), 'approved')$$, 'travel desk: cannot decide claims');
select ap.throws($$select public.ceo_dashboard()$$, 'travel desk: cannot open the dashboard');

-- ---------------------------------------------------------------------------
-- Dashboard, people and logins
-- ---------------------------------------------------------------------------
select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.ok((select (d -> 'people' ->> 'total')::int >= 7 from public.ceo_dashboard('2026-01-01', '2026-12-31') d), 'admin: can open the dashboard');
select ap.ok((select can_manage from public.admin_list_people() where employee_id = 'XCEO'), 'Travel Desk: people list marks the Director as manageable');
select ap.ok((select can_manage from public.admin_list_people() where employee_id = 'XAD2'), 'Travel Desk: people list marks other Travel Desk people as manageable');
select ap.ok((select can_manage from public.admin_list_people() where employee_id = 'XE03'), 'admin: people list marks employees as manageable');
select public.admin_create_login('50000000-0000-0000-0000-0000000000e3', 'TempPassword123');
reset role;
select ap.ok((select user_id is not null from public.profiles where employee_id = 'XE03'), 'admin: created a login for an employee');
set local role authenticated;
select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.allows($$select public.admin_reset_password('50000000-0000-0000-0000-0000000000a1', 'TempPassword123')$$, 'Travel Desk: can reset the Director''s password');
select ap.allows($$select public.admin_reset_password('50000000-0000-0000-0000-0000000000c2', 'TempPassword123')$$, 'Travel Desk: can reset another Travel Desk password');
select public.admin_reset_password('50000000-0000-0000-0000-0000000000e1', 'TempPassword456');
select ap.allows($$select public.admin_set_role('50000000-0000-0000-0000-0000000000e1', 'travel_desk')$$, 'Travel Desk: can change roles');
select ap.allows($$update public.profiles set role = 'admin' where employee_id = 'XE01'$$, 'Travel Desk: can promote like the Director');
select ap.allows($$update public.profiles set department = 'X' where employee_id = 'XCEO'$$, 'Travel Desk: can edit the Director''s details');
update public.profiles set department = 'Site Ops' where employee_id = 'XE01';
select ap.ok((select department from public.profiles where employee_id = 'XE01') = 'Site Ops', 'admin: can edit an employee''s details');
select public.admin_set_active('50000000-0000-0000-0000-0000000000e2', false);
select public.admin_set_active('50000000-0000-0000-0000-0000000000e2', true);
select ap.throws($$select public.admin_set_active('50000000-0000-0000-0000-0000000000a1', false)$$, 'Travel Desk: still cannot deactivate the only Director');
insert into public.profiles (employee_id, full_name, email, department) values ('XE04', 'New Joiner', 'new@x.example', 'Projects');
select ap.ok((select role = 'employee' from public.profiles where employee_id = 'XE04'), 'admin: can add an employee');

select ap.login('60000000-0000-0000-0000-0000000000a1');
select public.admin_set_role('50000000-0000-0000-0000-0000000000e1', 'company_admin');
select ap.ok((select role::text from public.profiles where employee_id = 'XE01') = 'company_admin', 'CEO: can make someone an Admin');
select public.admin_set_role('50000000-0000-0000-0000-0000000000e1', 'employee');

-- ---------------------------------------------------------------------------
-- Stored upload files
-- ---------------------------------------------------------------------------
reset role;
insert into public.import_batches (id, original_filename, file_kind, status, created_by)
values ('80000000-0000-0000-0000-000000000001', 'SEP.xlsx', 'xlsx', 'committed', '60000000-0000-0000-0000-0000000000d1');
update public.travel_records set import_batch_id = '80000000-0000-0000-0000-000000000001' where source = 'import';
set local role authenticated;

select ap.login('60000000-0000-0000-0000-0000000000e1');
select ap.throws($$insert into storage.objects (bucket_id, name) values ('import-files', '80000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000001.xlsx')$$,
  'employee: cannot store an upload file');
select ap.throws($$select public.import_history()$$, 'employee: cannot see the upload history');

select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.throws($$insert into storage.objects (bucket_id, name) values ('import-files', '80000000-0000-0000-0000-000000000001/../x.xlsx')$$, 'admin: odd file paths refused');
select ap.throws($$insert into storage.objects (bucket_id, name) values ('import-files', '80000000-0000-0000-0000-0000000000ff/90000000-0000-0000-0000-000000000001.xlsx')$$, 'admin: cannot store a file for an upload that does not exist');
insert into storage.objects (bucket_id, name) values ('import-files', '80000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000001.xlsx');
select ap.throws($$select public.import_attach_file('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000009.xlsx', 100, null)$$,
  'admin: cannot attach a file that was not uploaded');
select public.import_attach_file('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000001.xlsx', 2048, repeat('a', 64));
select ap.ok((select file_path is not null and file_size = 2048 and uploaded_by = 'Desk Person' and trips = 2 and spend = 10000
                from public.import_history() where id = '80000000-0000-0000-0000-000000000001'),
  'admin: upload history shows the stored file, who uploaded it, trips and spend');
select ap.throws($$select public.import_attach_file('80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000001.xlsx', 2048, null)$$,
  'admin: an upload''s file cannot be replaced');
select ap.throws($$insert into storage.objects (bucket_id, name) values ('import-files', '80000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000002.xlsx')$$,
  'admin: no second file for the same upload');
select ap.ok((select count(*) from storage.objects where bucket_id = 'import-files') = 1, 'admin: can read the stored file');
select ap.allows($$with d as (delete from storage.objects where bucket_id = 'import-files' returning 1) select 1 / (select count(*)::int from d)$$, 'Travel Desk: can delete a stored file like the Director (used by reset)');

select ap.login('60000000-0000-0000-0000-0000000000e1');
select ap.ok((select count(*) from storage.objects where bucket_id = 'import-files') = 0, 'employee: cannot read stored upload files');

-- ---------------------------------------------------------------------------
-- Spend list and totals
-- ---------------------------------------------------------------------------
select ap.login('60000000-0000-0000-0000-0000000000c1');
-- counted: trips 10000 + 7000 (cancelled 9000 not counted); claims 1200 + 800 + 300 + 9000 + 400 + 50 (withdrawn 5000 not counted)
select ap.ok((select (s -> 'totals' ->> 'counted_amount')::numeric = 28750
                     and (s -> 'totals' ->> 'not_counted_amount')::numeric = 14000
                     and (s -> 'totals' ->> 'trips')::int = 3
                     and (s -> 'totals' ->> 'claims')::int = 7
                from public.spend_summary('{"from":"2026-09-01","to":"2026-09-30"}') s),
  'totals: claims and trips add up; withdrawn and cancelled are not counted');
select ap.ok((select (g ->> 'counted_amount')::numeric = 11200
                from public.spend_summary('{"from":"2026-09-01","to":"2026-09-30","group_by":"project"}') s,
                     jsonb_array_elements(s -> 'groups') g where g ->> 'group' = 'HRRL Refinery'),
  'totals: by project includes the claim and the trip on HRRL');
select ap.ok((select (s -> 'totals' ->> 'counted_amount')::numeric = 12000
                from public.spend_summary('{"employee":"50000000-0000-0000-0000-0000000000e1"}') s),
  'totals: one person (trip 10000 + cab 1200 + dinner 800)');
select ap.ok((select jsonb_array_length(s -> 'groups') = 3
                from public.spend_summary('{"from":"2026-09-01","to":"2026-09-14","group_by":"week"}') s),
  'totals: grouped by week');
select ap.throws($$select public.spend_summary('{"group_by":"password"}')$$, 'totals: unknown grouping refused');

select ap.login('60000000-0000-0000-0000-0000000000e2');
select ap.ok((select (s -> 'totals' ->> 'counted_amount')::numeric = 7350 from public.spend_summary('{}') s),
  'employee: totals cover only their own spend');

-- ---------------------------------------------------------------------------
-- Past employees added by an upload
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set created_at = now() - interval '1 day' where employee_id = 'XE03';
insert into public.profiles (id, employee_id, full_name, department) values
  ('50000000-0000-0000-0000-0000000000f1', 'XPAST1', 'Left Last Year', 'Projects');
insert into public.import_batches (id, original_filename, file_kind, status, created_by)
values ('80000000-0000-0000-0000-000000000002', 'PAST.xlsx', 'xlsx', 'staged', '60000000-0000-0000-0000-0000000000c1');
insert into public.import_rows (batch_id, row_number, employee_code, profile_id, status, new_employee) values
  ('80000000-0000-0000-0000-000000000002', 1, 'XPAST1', '50000000-0000-0000-0000-0000000000f1', 'imported', true),
  ('80000000-0000-0000-0000-000000000002', 2, 'XE03',   '50000000-0000-0000-0000-0000000000e3', 'imported', true),
  ('80000000-0000-0000-0000-000000000002', 3, 'XE01',   '50000000-0000-0000-0000-0000000000e1', 'imported', true);
set local role authenticated;

select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.throws($$select public.import_mark_new_people_left('80000000-0000-0000-0000-000000000002')$$, 'past: upload must be finished first');
reset role;
update public.import_batches set status = 'committed' where id = '80000000-0000-0000-0000-000000000002';
set local role authenticated;

select ap.login('60000000-0000-0000-0000-0000000000d1');
select ap.throws($$select public.import_mark_new_people_left('80000000-0000-0000-0000-000000000002')$$, 'past: travel desk cannot mark people as left');
select ap.login('60000000-0000-0000-0000-0000000000e1');
select ap.throws($$select public.import_mark_new_people_left('80000000-0000-0000-0000-000000000002')$$, 'past: employee cannot mark people as left');

select ap.login('60000000-0000-0000-0000-0000000000c1');
select ap.ok(public.import_mark_new_people_left('80000000-0000-0000-0000-000000000002') = 1, 'past: Admin marks only the person the upload added');
reset role;
select ap.ok((select not active from public.profiles where employee_id = 'XPAST1'), 'past: new person is now a past employee');
select ap.ok((select active from public.profiles where employee_id = 'XE03'), 'past: an older person in the same sheet is untouched');
select ap.ok((select active from public.profiles where employee_id = 'XE01'), 'past: a person with a login is untouched');
set local role authenticated;
select ap.login('60000000-0000-0000-0000-0000000000a1');
select ap.ok(public.import_mark_new_people_left('80000000-0000-0000-0000-000000000002') = 0, 'past: running it again changes nothing');

reset role;
\echo 'ALL ADMIN PORTAL TESTS PASSED'
rollback;
