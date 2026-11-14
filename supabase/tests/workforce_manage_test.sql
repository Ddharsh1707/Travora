-- =============================================================================
-- Temporary workforce, part 3: directory, details, changes, merge and undo
-- (20261115140000_workforce_manage.sql).
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema wm;
grant usage on schema wm to authenticated, anon;
create function wm.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function wm.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function wm.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema wm to authenticated, anon;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('8a000000-0000-0000-0000-0000000000a1', 'WMDR', 'Wm Director',    'wmdr@x.example', 'Management', 'admin'),
  ('8a000000-0000-0000-0000-0000000000c1', 'WMTD', 'Wm Travel Desk', 'wmtd@x.example', 'Admin',      'company_admin'),
  ('8a000000-0000-0000-0000-0000000000c2', 'WMT2', 'Wm Travel Desk Two', 'wmt2@x.example', 'Admin',  'company_admin'),
  ('8a000000-0000-0000-0000-0000000000d1', 'WMBA', 'Wm Booking',     'wmba@x.example', 'Travel',     'travel_desk'),
  ('8a000000-0000-0000-0000-0000000000b1', 'WMAP', 'Wm Approver',    'wmap@x.example', 'Projects',   'approver'),
  ('8a000000-0000-0000-0000-0000000000e1', 'WMEM', 'Wm Employee',    'wmem@x.example', 'Projects',   'employee');
insert into auth.users (id, email, email_confirmed_at) values
  ('8b000000-0000-0000-0000-0000000000a1', 'wmdr@x.example', now()),
  ('8b000000-0000-0000-0000-0000000000c1', 'wmtd@x.example', now()),
  ('8b000000-0000-0000-0000-0000000000c2', 'wmt2@x.example', now()),
  ('8b000000-0000-0000-0000-0000000000d1', 'wmba@x.example', now()),
  ('8b000000-0000-0000-0000-0000000000b1', 'wmap@x.example', now()),
  ('8b000000-0000-0000-0000-0000000000e1', 'wmem@x.example', now());

-- Imported workers (upload-created, unverified).
insert into public.profiles (id, employee_id, full_name) values
  ('8a000000-0000-0000-0000-000000000101', 'NEW-WM000001', 'Ramu Labour'),
  ('8a000000-0000-0000-0000-000000000102', 'NEW-WM000002', 'R Labour'),
  ('8a000000-0000-0000-0000-000000000103', 'NEW-WM000003', 'Somu Helper');
insert into public.projects (id, name, kind) values ('8c000000-0000-0000-0000-000000000001', 'Wm Site Project', 'project');

-- Ramu's trips: every money case.
insert into public.travel_records (id, employee_id, origin, destination, departure_date, booking_reference, currency, status, source, amount) values
  ('8d000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-000000000101', 'HYD', 'VSKP', '2026-07-01', 'WMR001', 'INR', 'completed', 'import', null),
  ('8d000000-0000-0000-0000-000000000002', '8a000000-0000-0000-0000-000000000101', 'HYD', 'DEL',  '2026-07-05', 'WMR002', 'INR', 'cancelled', 'import', null),
  ('8d000000-0000-0000-0000-000000000003', '8a000000-0000-0000-0000-000000000101', 'DXB', 'HYD',  '2026-07-09', 'WMR003', 'USD', 'completed', 'import', null),
  ('8d000000-0000-0000-0000-000000000004', '8a000000-0000-0000-0000-000000000101', 'HYD', 'BLR',  '2026-07-12', null,     'INR', 'completed', 'manual', null),
  ('8d000000-0000-0000-0000-000000000005', '8a000000-0000-0000-0000-000000000101', 'VSKP','HYD',  '2026-07-15', 'WMR005', 'INR', 'completed', 'import', null);
insert into public.cost_lines (travel_record_id, line_type, amount, currency, amount_state) values
  ('8d000000-0000-0000-0000-000000000001', 'fare',   1000, 'INR', 'recorded'),
  ('8d000000-0000-0000-0000-000000000001', 'refund', -300, 'INR', 'recorded'),
  ('8d000000-0000-0000-0000-000000000001', 'addon',  null, 'INR', 'missing'),
  ('8d000000-0000-0000-0000-000000000002', 'fare',    500, 'INR', 'recorded'),
  ('8d000000-0000-0000-0000-000000000003', 'fare',    100, 'USD', 'recorded'),
  ('8d000000-0000-0000-0000-000000000005', 'fare',      0, 'INR', 'zero');
-- "R Labour": one trip, one expense claim and one document.
insert into public.travel_records (id, employee_id, origin, destination, departure_date, booking_reference, currency, status, source, amount) values
  ('8d000000-0000-0000-0000-000000000011', '8a000000-0000-0000-0000-000000000102', 'HYD', 'MAA', '2026-07-20', 'WMR011', 'INR', 'completed', 'manual', 250);
insert into public.expenses (id, employee_id, expense_date, category, description, amount, currency, status) values
  ('8e000000-0000-0000-0000-000000000011', '8a000000-0000-0000-0000-000000000102', '2026-07-20', 'cab', 'Auto to site', 120, 'INR', 'approved');
insert into public.documents (id, employee_id, document_type, storage_path, original_filename, mime_type, size_bytes) values
  ('8f000000-0000-0000-0000-000000000011', '8a000000-0000-0000-0000-000000000102', 'train_ticket',
   '8a000000-0000-0000-0000-000000000102/8f000000-0000-0000-0000-000000000011.pdf', 'ticket.pdf', 'application/pdf', 1000);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Who can read
-- ---------------------------------------------------------------------------
select wm.login('8b000000-0000-0000-0000-0000000000b1');
select wm.throws($$select * from public.workforce_list()$$, 'approver: cannot open the worker directory');
select wm.throws($$select public.workforce_detail('8a000000-0000-0000-0000-000000000101')$$, 'approver: cannot open a worker');
select wm.login('8b000000-0000-0000-0000-0000000000e1');
select wm.throws($$select * from public.workforce_list()$$, 'employee: cannot open the worker directory');

select wm.login('8b000000-0000-0000-0000-0000000000d1');
select wm.ok((select count(*) from public.workforce_list('{"type":"unknown","q":"labour"}')) = 2,
  'booking assistant: can open the directory and filter by kind and name');

-- ---------------------------------------------------------------------------
-- Money: gross, credits, net, missing, zero fare, other currency, cancelled
-- ---------------------------------------------------------------------------
select wm.ok((select trips = 4 and cancelled_trips = 1 and currency = 'INR' and gross = 1000 and credits = -300 and net = 700
                     and missing_cost_lines = 2 and other_currency_trips = 1
                     and first_trip = '2026-07-01' and last_trip = '2026-07-15'
                from public.workforce_list('{"q":"Ramu"}')),
  'directory: 4 trips + 1 cancelled; 1000 gross, 300 credit, 700 net in INR; 2 missing costs; 1 USD trip kept apart');
select wm.ok((select (d -> 'totals' ->> 'net')::numeric = 700
                     and (d -> 'totals' ->> 'zero_fare_lines')::int = 1
                     and (d -> 'totals' ->> 'missing_cost_lines')::int = 2
                     and d -> 'totals' -> 'other_currencies' @> '[{"currency":"USD","net":100}]'
                     and jsonb_array_length(d -> 'trips') = 5
                from public.workforce_detail('8a000000-0000-0000-0000-000000000101') d),
  'details: same totals; the zero fare is kept; the USD trip is listed apart, not added to INR');
select wm.ok((select (d -> 'person' ->> 'can_manage')::boolean = false
                from public.workforce_detail('8a000000-0000-0000-0000-000000000101') d),
  'booking assistant: details say they cannot change workers');

-- ---------------------------------------------------------------------------
-- Changes
-- ---------------------------------------------------------------------------
select wm.throws($$select public.workforce_verify('8a000000-0000-0000-0000-000000000101')$$, 'booking assistant: cannot verify a worker');
select wm.throws($$select public.workforce_set_type('8a000000-0000-0000-0000-000000000101', 'temporary_worker')$$,
  'booking assistant: cannot change the kind of worker');

select wm.login('8b000000-0000-0000-0000-0000000000c1');
select public.workforce_set_type('8a000000-0000-0000-0000-000000000101', 'temporary_worker');
select public.workforce_verify('8a000000-0000-0000-0000-000000000101');
select wm.throws($$select public.workforce_set_type('8a000000-0000-0000-0000-000000000101', 'boss')$$, 'an unknown kind of worker is refused');
select wm.throws($$select public.workforce_set_type('8a000000-0000-0000-0000-0000000000e1', 'temporary_worker')$$,
  'Travel Desk: someone with a login stays a permanent employee');
select wm.throws($$select public.workforce_set_type('8a000000-0000-0000-0000-0000000000a1', 'unknown')$$,
  'the Director has a login, so stays a permanent employee');

select public.workforce_set_contractor('8a000000-0000-0000-0000-000000000101', '  Sri  Sai Labour ');
select wm.throws($$select public.workforce_set_contractor('8a000000-0000-0000-0000-0000000000e1', 'ABC')$$,
  'a permanent employee cannot be given a contractor');
select wm.throws($$select public.workforce_set_project('8a000000-0000-0000-0000-000000000101', '8c000000-0000-0000-0000-000000000001', '')$$,
  'a project needs a reason (no guessing from names)');
select public.workforce_set_project('8a000000-0000-0000-0000-000000000101', '8c000000-0000-0000-0000-000000000001', 'Work order WO-17');

select public.workforce_alias_add('8a000000-0000-0000-0000-000000000101', 'Ramu L');
select wm.throws($$select public.workforce_alias_add('8a000000-0000-0000-0000-000000000101', 'LABOUR/RAMU MR')$$,
  'the person''s own name (in any spelling with the same words) is not an alias');
select wm.throws($$select public.workforce_alias_add('8a000000-0000-0000-0000-000000000103', 'MR. RAMU L')$$,
  'a spelling that belongs to someone else is refused');

select wm.ok((select workforce_type = 'temporary_worker' and verification_status = 'verified'
                     and contractor_name = 'Sri Sai Labour' and project_name = 'Wm Site Project'
                from public.workforce_list('{"q":"Ramu"}')),
  'Travel Desk: verified, classified, contractor and project are set');

-- ---------------------------------------------------------------------------
-- Merge "R Labour" into Ramu Labour, then undo it
-- ---------------------------------------------------------------------------
select wm.throws($$select public.workforce_merge('8a000000-0000-0000-0000-000000000102', '8a000000-0000-0000-0000-000000000101', '')$$,
  'a merge needs a reason');
select wm.throws($$select public.workforce_merge('8a000000-0000-0000-0000-0000000000e1', '8a000000-0000-0000-0000-000000000101', 'Same person')$$,
  'someone with a login cannot be merged away');

-- Same PNR on the same day for both: refused until a person checks it.
reset role;
insert into public.travel_records (id, employee_id, origin, destination, departure_date, booking_reference, currency, status, source)
values ('8d000000-0000-0000-0000-000000000012', '8a000000-0000-0000-0000-000000000102', 'VSKP', 'HYD', '2026-07-15', 'WMR005', 'INR', 'completed', 'manual');
set local role authenticated;
select wm.login('8b000000-0000-0000-0000-0000000000c1');
select wm.throws($$select public.workforce_merge('8a000000-0000-0000-0000-000000000102', '8a000000-0000-0000-0000-000000000101', 'Same person')$$,
  'two records of the same booking stop the merge');
reset role;
delete from public.travel_records where id = '8d000000-0000-0000-0000-000000000012';
set local role authenticated;
select wm.login('8b000000-0000-0000-0000-0000000000c1');

create temp table wm_merge as
  select public.workforce_merge('8a000000-0000-0000-0000-000000000102', '8a000000-0000-0000-0000-000000000101',
                                'Same Aadhaar number on both site passes') as id;
grant select on wm_merge to authenticated;

reset role;
select wm.ok((select employee_id from public.travel_records where id = '8d000000-0000-0000-0000-000000000011') = '8a000000-0000-0000-0000-000000000101'
         and (select employee_id from public.expenses where id = '8e000000-0000-0000-0000-000000000011') = '8a000000-0000-0000-0000-000000000101',
  'merge: the trip and the expense claim now belong to the person kept');
select wm.ok((select count(*) from public.cost_lines) >= 6 and exists (select 1 from public.travel_records where id = '8d000000-0000-0000-0000-000000000011'),
  'merge: no trip or cost was deleted');
select wm.ok((select employee_id from public.documents where id = '8f000000-0000-0000-0000-000000000011') = '8a000000-0000-0000-0000-000000000102',
  'merge: the document stays filed where its file is');
select wm.ok((select merged_into = '8a000000-0000-0000-0000-000000000101' and verification_status = 'merged' and not active
                from public.profiles where id = '8a000000-0000-0000-0000-000000000102'),
  'merge: the old record points at the person kept and is inactive');
select wm.ok(exists (select 1 from public.person_aliases where profile_id = '8a000000-0000-0000-0000-000000000101'
                                                       and alias_key = private.person_name_key('R Labour') and source = 'merge'),
  'merge: the old name is saved as a spelling of the person kept');
select wm.ok(exists (select 1 from public.audit_logs where action = 'workforce_merged'), 'merge: written to the audit log');

set local role authenticated;
select wm.login('8b000000-0000-0000-0000-0000000000c1');
select wm.ok((select count(*) from public.workforce_list('{"q":"Labour"}')) = 1,
  'directory: the merged record is hidden');
select wm.ok(exists (select 1 from public.workforce_list('{"q":"R Labour","include_merged":true,"include_inactive":true}')
                      where id = '8a000000-0000-0000-0000-000000000102' and merged_into = '8a000000-0000-0000-0000-000000000101'),
  'directory: the merged record can still be shown on request, pointing at the person kept');
select wm.ok(exists (select 1 from public.workforce_list('{"q":"R Labour"}') where id = '8a000000-0000-0000-0000-000000000101'),
  'directory: searching the old name finds the person kept (saved spelling)');
select wm.ok((select jsonb_array_length(d -> 'documents') = 1 and jsonb_array_length(d -> 'merges') = 1
                     and (d -> 'totals' ->> 'net')::numeric = 950
                from public.workforce_detail('8a000000-0000-0000-0000-000000000101') d),
  'details: the person kept shows the merged document, the merge and the added trip (700 + 250)');
select wm.throws($$select public.workforce_set_type('8a000000-0000-0000-0000-000000000102', 'temporary_worker')$$,
  'a merged record cannot be changed');

select public.workforce_unmerge((select id from wm_merge));
select wm.throws($$select public.workforce_unmerge((select id from wm_merge))$$, 'a merge cannot be undone twice');

reset role;
select wm.ok((select employee_id from public.travel_records where id = '8d000000-0000-0000-0000-000000000011') = '8a000000-0000-0000-0000-000000000102'
         and (select employee_id from public.expenses where id = '8e000000-0000-0000-0000-000000000011') = '8a000000-0000-0000-0000-000000000102',
  'undo: the trip and claim are back with "R Labour"');
select wm.ok((select merged_into is null and verification_status = 'imported_unverified' and active
                from public.profiles where id = '8a000000-0000-0000-0000-000000000102'),
  'undo: "R Labour" is back as they were');
select wm.ok(not exists (select 1 from public.person_aliases where alias_key = private.person_name_key('R Labour')),
  'undo: the spelling the merge added is removed');
select wm.ok(exists (select 1 from public.person_aliases where profile_id = '8a000000-0000-0000-0000-000000000101'
                                                       and alias_key = private.person_name_key('Ramu L')),
  'undo: spellings saved by hand stay');
select wm.ok((select reversed_at is not null and reversed_by is not null from public.identity_merges where id = (select id from wm_merge)),
  'undo: the merge history says who undid it and when');

-- ---------------------------------------------------------------------------
-- Travel Desk and the Director
-- ---------------------------------------------------------------------------
set local role authenticated;
-- The Travel Desk has every Director permission (20261108000400_travel_desk_full_access.sql).
select wm.login('8b000000-0000-0000-0000-0000000000c1');
select wm.ok(public.workforce_alias_add('8a000000-0000-0000-0000-0000000000c2', 'Desk Two') is not null,
  'Travel Desk: can change another Travel Desk person''s record, like the Director');
select wm.login('8b000000-0000-0000-0000-0000000000a1');
select public.workforce_alias_remove((select id from public.person_aliases where alias = 'Desk Two'));
reset role;
select wm.ok(not exists (select 1 from public.person_aliases where alias = 'Desk Two')
         and exists (select 1 from public.audit_logs where action = 'workforce_alias_removed'),
  'Director: removed the spelling, and it is in the audit log');

set local role authenticated;
select wm.login('8b000000-0000-0000-0000-0000000000d1');
select wm.throws($$select public.workforce_merge('8a000000-0000-0000-0000-000000000102', '8a000000-0000-0000-0000-000000000101', 'Same person')$$,
  'booking assistant: cannot merge people');
select wm.throws($$select public.workforce_unmerge((select id from wm_merge))$$, 'booking assistant: cannot undo a merge');

rollback;
