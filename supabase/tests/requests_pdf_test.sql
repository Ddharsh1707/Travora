-- =============================================================================
-- Travel requests decided by the CEO or an Admin, and PDF upload kinds.
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema rq;
grant usage on schema rq to authenticated, anon;
create function rq.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function rq.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function rq.allows(stmt text, label text) returns void language plpgsql as $$
begin
  -- Runs the statement, then undoes it so later checks see the same data.
  begin execute stmt; raise exception 'allows-rollback';
  exception when others then
    if sqlerrm = 'allows-rollback' then raise notice 'ok - % (allowed)', label; return; end if;
    raise exception 'FAIL: % (blocked: %)', label, sqlerrm;
  end;
end $$;
create function rq.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema rq to authenticated, anon;

insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('80000000-0000-0000-0000-0000000000a1', 'RCEO', 'Chief Exec',   'rceo@x.example',  'Management', 'admin'),
  ('80000000-0000-0000-0000-0000000000c1', 'RADM', 'Office Admin', 'radm@x.example',  'Admin',      'company_admin'),
  ('80000000-0000-0000-0000-0000000000c2', 'RAD2', 'Other Admin',  'radm2@x.example', 'Admin',      'company_admin'),
  ('80000000-0000-0000-0000-0000000000e1', 'RE01', 'Ravi Kumar',   'rravi@x.example', 'Projects',   'employee'),
  ('80000000-0000-0000-0000-0000000000e2', 'RE02', 'Sita Devi',    'rsita@x.example', 'Finance',    'employee');
insert into auth.users (id, email, email_confirmed_at) values
  ('90000000-0000-0000-0000-0000000000a1', 'rceo@x.example',  now()),
  ('90000000-0000-0000-0000-0000000000c1', 'radm@x.example',  now()),
  ('90000000-0000-0000-0000-0000000000c2', 'radm2@x.example', now()),
  ('90000000-0000-0000-0000-0000000000e1', 'rravi@x.example', now()),
  ('90000000-0000-0000-0000-0000000000e2', 'rsita@x.example', now());

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Employee submits a detailed request
-- ---------------------------------------------------------------------------
select rq.login('90000000-0000-0000-0000-0000000000e1');
insert into public.travel_requests (employee_id, origin, destination, departure_date, return_date, purpose, travel_type,
  estimated_cost, project_name, preferred_time, hotel_required, hotel_city, hotel_check_in, hotel_check_out, contact_phone, notes,
  status, decided_by_name, decision_comment)
values ('80000000-0000-0000-0000-0000000000e1', 'Hyderabad', 'Mumbai', current_date + 10, current_date + 12, 'Site visit',
  'flight', 12000, 'HRRL Refinery', 'morning', true, 'Mumbai', current_date + 10, current_date + 12, '+91 98480 12345', 'Aisle seat',
  'approved', 'Me', 'self approved');
select rq.ok((select status = 'pending' and decided_by_name is null and decision_comment is null and hotel_required and project_name = 'HRRL Refinery'
                from public.travel_requests where purpose = 'Site visit'),
  'employee: request saved with details; status and decision cannot be set by the employee');
update public.travel_requests set decided_by_name = 'Me', decision_comment = 'ok' where purpose = 'Site visit';
select rq.ok((select decided_by_name is null and decision_comment is null from public.travel_requests where purpose = 'Site visit'),
  'employee: cannot write the decision columns');
select rq.throws($$select public.decide_travel_request((select id from public.travel_requests where purpose = 'Site visit'), 'approved')$$,
  'employee: cannot approve');

select rq.login('90000000-0000-0000-0000-0000000000e2');
insert into public.travel_requests (employee_id, origin, destination, departure_date, purpose, travel_type)
values ('80000000-0000-0000-0000-0000000000e2', 'Delhi', 'Chennai', current_date + 5, 'Audit', 'train');
select rq.ok((select count(*) from public.travel_requests) = 1, 'employee: sees only their own request');

-- ---------------------------------------------------------------------------
-- Both the CEO and the Admin see every request at once
-- ---------------------------------------------------------------------------
select rq.login('90000000-0000-0000-0000-0000000000a1');
select rq.ok((select count(*) from public.travel_requests where status = 'pending') = 2, 'CEO: sees both pending requests');
select rq.login('90000000-0000-0000-0000-0000000000c1');
select rq.ok((select count(*) from public.travel_requests where status = 'pending') = 2, 'Admin: sees the same pending requests');

-- Admin decides first
select rq.throws($$select public.decide_travel_request((select id from public.travel_requests where purpose = 'Audit'), 'rejected', '  ')$$,
  'Admin: a rejection needs a reason');
select public.decide_travel_request((select id from public.travel_requests where purpose = 'Site visit'), 'approved', 'Book the morning flight');
select rq.ok((select status = 'approved' and decided_by_name = 'Office Admin' and decided_by_role = 'Admin'
                 and decision_comment = 'Book the morning flight' and decided_at is not null
                from public.travel_requests where purpose = 'Site visit'), 'Admin: approval saved with who, when and why');

-- CEO is second: refused, with who decided
select rq.login('90000000-0000-0000-0000-0000000000a1');
do $$
begin
  perform public.decide_travel_request((select id from public.travel_requests where purpose = 'Site visit'), 'rejected', 'No');
  raise exception 'FAIL: second decision was accepted';
exception when others then
  if sqlerrm not like 'This request was already approved by Office Admin%' then raise exception 'FAIL: wrong message %', sqlerrm; end if;
  raise notice 'ok - CEO: a request already decided by the Admin is refused (%)', sqlerrm;
end $$;
select public.decide_travel_request((select id from public.travel_requests where purpose = 'Audit'), 'rejected', 'Use video call');

-- The employee sees the decision
select rq.login('90000000-0000-0000-0000-0000000000e2');
select rq.ok((select status = 'rejected' and decided_by_name = 'Chief Exec' and decided_by_role = 'CEO' and decision_comment = 'Use video call'
                from public.travel_requests where purpose = 'Audit'), 'employee: sees the CEO''s rejection and reason');
select rq.ok((select count(*) from public.approvals) = 1, 'employee: sees the approval history of their own request');

-- An Admin cannot decide for another Admin or the CEO
select rq.login('90000000-0000-0000-0000-0000000000c2');
insert into public.travel_requests (employee_id, origin, destination, departure_date, purpose, travel_type)
values ('80000000-0000-0000-0000-0000000000c2', 'Pune', 'Goa', current_date + 3, 'Vendor meet', 'flight');
select rq.login('90000000-0000-0000-0000-0000000000c1');
select rq.allows($$select public.decide_travel_request((select id from public.travel_requests where purpose = 'Vendor meet'), 'approved')$$,
  'Travel Desk: can decide another Travel Desk request');
select rq.login('90000000-0000-0000-0000-0000000000a1');
select public.decide_travel_request((select id from public.travel_requests where purpose = 'Vendor meet'), 'approved');
select rq.ok((select status = 'approved' from public.travel_requests where purpose = 'Vendor meet'), 'CEO: can decide an Admin''s request');

-- ---------------------------------------------------------------------------
-- Booking an approved request marks it booked
-- ---------------------------------------------------------------------------
select rq.login('90000000-0000-0000-0000-0000000000c1');
insert into public.travel_records (employee_id, request_id, origin, destination, departure_date, amount, booking_type, booking_reference)
values ('80000000-0000-0000-0000-0000000000e1', (select id from public.travel_requests where purpose = 'Site visit'),
        'Hyderabad', 'Mumbai', current_date + 10, 11800, 'flight', 'PNR123');
select rq.ok((select status = 'booked' from public.travel_requests where purpose = 'Site visit'), 'Admin: booking an approved request marks it booked');

-- ---------------------------------------------------------------------------
-- PDF uploads
-- ---------------------------------------------------------------------------
select rq.ok((select public.import_stage_v2('bookings.pdf', 'pdf', '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('employee_name', 'Ravi Kumar', 'departure_date', '2026-09-01', 'destination', 'Mumbai',
                                       'amount', '4,500', 'booking_type', 'flight', 'sheet_name', 'PDF page 1', 'source_row', 3,
                                       'raw', jsonb_build_object('Passenger', 'Ravi Kumar', 'Fare', '4,500'))),
  false, 'INR')) is not null, 'Admin: a PDF upload can be checked');
select rq.ok((select file_kind = 'pdf' from public.import_batches where original_filename = 'bookings.pdf'), 'PDF upload is saved as kind pdf');
select rq.throws($$select public.import_stage_v2('x.doc', 'doc', '[]'::jsonb, '[]'::jsonb, false, 'INR')$$, 'other file kinds are still refused');

-- ---------------------------------------------------------------------------
-- People overview
-- ---------------------------------------------------------------------------
select rq.login('90000000-0000-0000-0000-0000000000a1');
select rq.ok((select (x -> 'totals' ->> 'spend')::numeric >= 11800 from public.people_spend_overview() x), 'CEO: overview totals include the booked trip');
select rq.ok((select exists (select 1 from jsonb_array_elements(x -> 'people') e where e ->> 'employee_code' = 'RE01' and (e ->> 'travel')::numeric = 11800)
                from public.people_spend_overview() x), 'CEO: overview has each employee''s travel spend');
select rq.login('90000000-0000-0000-0000-0000000000c1');
select rq.ok((select jsonb_typeof(x -> 'people') = 'array' from public.people_spend_overview() x), 'Admin: can read the overview');
select rq.login('90000000-0000-0000-0000-0000000000e1');
select rq.throws($$select public.people_spend_overview()$$, 'employee: cannot read the company overview');

rollback;
