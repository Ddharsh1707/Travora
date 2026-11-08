-- =============================================================================
-- Deleting employees and resetting company data. Rolled back at the end.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema dr;
grant usage on schema dr to authenticated, anon;
create function dr.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function dr.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function dr.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema dr to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at) values
  ('91000000-0000-0000-0000-0000000000a1', 'dceo@x.example',  now()),
  ('91000000-0000-0000-0000-0000000000c1', 'dadm@x.example',  now()),
  ('91000000-0000-0000-0000-0000000000c2', 'dadm2@x.example', now()),
  ('91000000-0000-0000-0000-0000000000e1', 'de1@x.example',   now()),
  ('91000000-0000-0000-0000-0000000000e9', 'de9@x.example',   now());
insert into public.profiles (id, user_id, employee_id, full_name, email, role) values
  ('81000000-0000-0000-0000-0000000000a1', '91000000-0000-0000-0000-0000000000a1', 'DCEO', 'Del CEO',    'dceo@x.example',  'admin'),
  ('81000000-0000-0000-0000-0000000000c1', '91000000-0000-0000-0000-0000000000c1', 'DADM', 'Del Admin',  'dadm@x.example',  'company_admin'),
  ('81000000-0000-0000-0000-0000000000c2', '91000000-0000-0000-0000-0000000000c2', 'DAD2', 'Del Admin2', 'dadm2@x.example', 'company_admin'),
  ('81000000-0000-0000-0000-0000000000e1', '91000000-0000-0000-0000-0000000000e1', 'DE01', 'Del One',    'de1@x.example',   'employee'),
  ('81000000-0000-0000-0000-0000000000e9', '91000000-0000-0000-0000-0000000000e9', 'DE09', 'Del Nine',   'de9@x.example',   'employee');
insert into public.profiles (id, employee_id, full_name, role, manager_id) values
  ('81000000-0000-0000-0000-0000000000e2', 'DE02', 'Del Two',   'employee', '81000000-0000-0000-0000-0000000000e1'),
  ('81000000-0000-0000-0000-0000000000e3', 'DE03', 'Del Three', 'employee', null);

insert into public.travel_requests (id, employee_id, origin, destination, departure_date, purpose, travel_type, approver_id) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-0000000000e1', 'Hyderabad', 'Delhi', current_date + 3, 'Visit', 'flight', null),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-0000000000e3', 'Pune', 'Delhi', current_date + 3, 'Visit', 'flight', '81000000-0000-0000-0000-0000000000e1');
insert into public.approvals (request_id, approver_id, status) values
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-0000000000e1', 'approved');
insert into public.travel_records (employee_id, origin, destination, departure_date, amount, request_id) values
  ('81000000-0000-0000-0000-0000000000e1', 'Hyderabad', 'Delhi', current_date - 3, 5000, '82000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-0000000000e2', 'Hyderabad', 'Pune',  current_date - 3, 3000, null),
  ('81000000-0000-0000-0000-0000000000e3', 'Pune', 'Delhi',      current_date - 3, 4000, null);
insert into public.expenses (employee_id, expense_date, category, description, amount) values
  ('81000000-0000-0000-0000-0000000000e1', current_date - 2, 'meals', 'Lunch', 400),
  ('81000000-0000-0000-0000-0000000000e3', current_date - 2, 'meals', 'Dinner', 600);
insert into public.documents (employee_id, storage_path, original_filename, mime_type) values
  ('81000000-0000-0000-0000-0000000000e1', '81000000-0000-0000-0000-0000000000e1/83000000-0000-0000-0000-000000000001.pdf', 'ticket.pdf', 'application/pdf');
insert into public.import_batches (id, original_filename, file_kind, status, file_path) values
  ('84000000-0000-0000-0000-000000000001', 'sheet.xlsx', 'xlsx', 'committed', '84000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001.xlsx');
update public.travel_records set import_batch_id = '84000000-0000-0000-0000-000000000001' where employee_id = '81000000-0000-0000-0000-0000000000e3';
insert into public.projects (name) values ('Kakinada Port');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Who may delete
-- ---------------------------------------------------------------------------
select dr.login('91000000-0000-0000-0000-0000000000e9');
select dr.throws($$select public.admin_delete_people(array['81000000-0000-0000-0000-0000000000e2'::uuid])$$, 'employee: cannot delete people');
select dr.throws($$select public.admin_reset_data('data', 'RESET')$$, 'employee: cannot reset data');

select dr.login('91000000-0000-0000-0000-0000000000c1');
select dr.throws($$select public.admin_delete_people(array['81000000-0000-0000-0000-0000000000c1'::uuid])$$, 'Admin: cannot delete themselves');
select dr.throws($$select public.admin_delete_people(array['81000000-0000-0000-0000-0000000000c2'::uuid])$$, 'Admin: cannot delete another Admin');
select dr.throws($$select public.admin_delete_people(array['81000000-0000-0000-0000-0000000000a1'::uuid])$$, 'Admin: cannot delete the CEO');
select dr.throws($$select public.admin_delete_people('{}'::uuid[])$$, 'Admin: must choose someone');
select dr.throws($$select public.admin_reset_data('data', 'RESET')$$, 'Admin: cannot reset data');

-- Admin deletes two employees in one go; everything of theirs goes
select dr.ok((public.admin_delete_people(array['81000000-0000-0000-0000-0000000000e1'::uuid, '81000000-0000-0000-0000-0000000000e2'::uuid]) ->> 'deleted')::int = 2,
  'Admin: deletes two employees at once');
reset role;
select dr.ok(not exists (select 1 from public.profiles where id in ('81000000-0000-0000-0000-0000000000e1', '81000000-0000-0000-0000-0000000000e2')), 'deleted profiles are gone');
select dr.ok(not exists (select 1 from auth.users where id = '91000000-0000-0000-0000-0000000000e1'), 'their login is gone');
select dr.ok((select count(*) from public.travel_records) = 1, 'only the other employee''s trip remains');
select dr.ok((select count(*) from public.expenses) = 1, 'their claims are gone');
select dr.ok((select count(*) from public.documents) = 0, 'their documents are gone');
select dr.ok((select count(*) from public.travel_requests) = 1 and (select count(*) from public.approvals) = 0,
  'their requests and their decisions on others are gone');
select dr.ok((select approver_id is null from public.travel_requests where id = '82000000-0000-0000-0000-000000000002'), 'requests they approved lose the approver');
select dr.ok(exists (select 1 from public.audit_logs where action = 'delete_people'), 'delete is in the audit log');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Reset (CEO only)
-- ---------------------------------------------------------------------------
select dr.login('91000000-0000-0000-0000-0000000000a1');
select dr.throws($$select public.admin_delete_people(array['81000000-0000-0000-0000-0000000000a1'::uuid])$$, 'CEO: cannot delete themselves');
select dr.throws($$select public.admin_reset_data('data', 'reset')$$, 'CEO: must type RESET exactly');
select dr.throws($$select public.admin_reset_data('all', 'RESET')$$, 'CEO: unknown scope refused');

select dr.ok((select (r -> 'import_files') ? '84000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001.xlsx'
                 and (r ->> 'trips')::int = 1 and (r ->> 'people')::int = 0
                from (select public.admin_reset_data('data', 'RESET') r) x), 'CEO: data reset returns the stored files');
reset role;
select dr.ok((select count(*) from public.travel_records) + (select count(*) from public.expenses) + (select count(*) from public.travel_requests)
              + (select count(*) from public.import_batches) + (select count(*) from public.projects) = 0, 'data reset: trips, claims, requests, uploads, projects gone');
select dr.ok((select count(*) from public.profiles where id::text like '81000000%') = 5, 'data reset: employees kept');
set local role authenticated;
select dr.login('91000000-0000-0000-0000-0000000000a1');
select dr.ok((public.admin_reset_data('everything', 'RESET') ->> 'people')::int = 2, 'CEO: full reset removes the two remaining employees');
reset role;
select dr.ok((select array_agg(employee_id order by employee_id) from public.profiles where id::text like '81000000%') = array['DAD2', 'DADM', 'DCEO'],
  'full reset: CEO and Admins kept');
select dr.ok(not exists (select 1 from auth.users where id = '91000000-0000-0000-0000-0000000000e9'), 'full reset: employee logins removed');

rollback;
