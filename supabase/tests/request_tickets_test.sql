-- =============================================================================
-- Tickets attached to approved travel requests.
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema tk;
grant usage on schema tk to authenticated, anon;
create function tk.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function tk.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function tk.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema tk to authenticated, anon;

insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('81000000-0000-0000-0000-0000000000a1', 'TCEO', 'Chief Exec',   'tceo@x.example',  'Management', 'admin'),
  ('81000000-0000-0000-0000-0000000000c1', 'TADM', 'Office Admin', 'tadm@x.example',  'Admin',      'company_admin'),
  ('81000000-0000-0000-0000-0000000000e1', 'TE01', 'Ravi Kumar',   'travi@x.example', 'Projects',   'employee'),
  ('81000000-0000-0000-0000-0000000000e2', 'TE02', 'Sita Devi',    'tsita@x.example', 'Finance',    'employee');
insert into auth.users (id, email, email_confirmed_at) values
  ('91000000-0000-0000-0000-0000000000a1', 'tceo@x.example',  now()),
  ('91000000-0000-0000-0000-0000000000c1', 'tadm@x.example',  now()),
  ('91000000-0000-0000-0000-0000000000e1', 'travi@x.example', now()),
  ('91000000-0000-0000-0000-0000000000e2', 'tsita@x.example', now());

insert into public.travel_requests (id, employee_id, origin, destination, departure_date, purpose, travel_type) values
  ('a1000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-0000000000e1', 'Hyderabad', 'Paradip', current_date + 5, 'Ticket trip', 'flight'),
  ('a1000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-0000000000e1', 'Hyderabad', 'Vizag',   current_date + 9, 'Pending trip', 'train');

set local role authenticated;

select tk.login('91000000-0000-0000-0000-0000000000c1');
select public.decide_travel_request('a1000000-0000-0000-0000-000000000001', 'approved', 'Go ahead');

-- Admin attaches the ticket to the approved request
insert into public.documents (employee_id, travel_request_id, document_type, storage_path, original_filename, mime_type)
values ('81000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-000000000001', 'flight_ticket',
  '81000000-0000-0000-0000-0000000000e1/b1000000-0000-0000-0000-000000000001.pdf', 'ticket.pdf', 'application/pdf');
select tk.ok((select count(*) = 1 from public.documents where travel_request_id = 'a1000000-0000-0000-0000-000000000001'),
  'admin: ticket attached to the approved request');

select tk.throws($$insert into public.documents (employee_id, travel_request_id, document_type, storage_path, original_filename, mime_type)
  values ('81000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-000000000002', 'train_ticket',
  '81000000-0000-0000-0000-0000000000e1/b1000000-0000-0000-0000-000000000002.pdf', 'pending.pdf', 'application/pdf')$$,
  'admin: no ticket on a request that is still waiting');
select tk.throws($$insert into public.documents (employee_id, travel_request_id, document_type, storage_path, original_filename, mime_type)
  values ('81000000-0000-0000-0000-0000000000e2', 'a1000000-0000-0000-0000-000000000001', 'flight_ticket',
  '81000000-0000-0000-0000-0000000000e2/b1000000-0000-0000-0000-000000000003.pdf', 'wrong.pdf', 'application/pdf')$$,
  'admin: ticket must be filed under the employee who asked');

-- CEO can attach one too
select tk.login('91000000-0000-0000-0000-0000000000a1');
insert into public.documents (employee_id, travel_request_id, document_type, storage_path, original_filename, mime_type)
values ('81000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-000000000001', 'hotel_voucher',
  '81000000-0000-0000-0000-0000000000e1/b1000000-0000-0000-0000-000000000004.pdf', 'hotel.pdf', 'application/pdf');
-- and a plain document filed under the employee, not tied to a request
insert into public.documents (employee_id, document_type, storage_path, original_filename, mime_type)
values ('81000000-0000-0000-0000-0000000000e1', 'invoice',
  '81000000-0000-0000-0000-0000000000e1/b1000000-0000-0000-0000-000000000005.pdf', 'invoice.pdf', 'application/pdf');

-- The employee sees all three in their own portal
select tk.login('91000000-0000-0000-0000-0000000000e1');
select tk.ok((select count(*) = 3 from public.documents), 'employee: sees every document filed under them');
select tk.ok((select count(*) = 2 from public.documents where travel_request_id = 'a1000000-0000-0000-0000-000000000001'),
  'employee: sees the tickets on their request');
select tk.throws($$insert into public.documents (employee_id, travel_request_id, document_type, storage_path, original_filename, mime_type)
  values ('81000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-000000000001', 'flight_ticket',
  '81000000-0000-0000-0000-0000000000e1/b1000000-0000-0000-0000-000000000006.pdf', 'mine.pdf', 'application/pdf')$$,
  'employee: cannot attach tickets to requests');

-- Another employee sees none of them
select tk.login('91000000-0000-0000-0000-0000000000e2');
select tk.ok((select count(*) = 0 from public.documents), 'other employee: sees nothing');

rollback;
