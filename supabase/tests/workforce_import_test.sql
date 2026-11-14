-- =============================================================================
-- Temporary workforce, part 2: the upload People step
-- (20261115120000_workforce_import.sql).
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema wi;
grant usage on schema wi to authenticated, anon;
create function wi.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function wi.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function wi.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema wi to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Name comparison rules
-- ---------------------------------------------------------------------------
select wi.ok(private.name_match_reason('KUMAR RAVI', 'KUMAR RAVI') = 'Same name', 'same key is the same name');
select wi.ok(private.name_match_reason('KUMAR R', 'KUMAR RAVI') = 'Initials match', '"R Kumar" may be "Ravi Kumar"');
select wi.ok(private.name_match_reason('K RAVI', 'KUMAR RAVI') = 'Initials match', '"Ravi K" may be "Ravi Kumar"');
select wi.ok(private.name_match_reason('RAVI', 'KUMAR RAVI') = 'One name is part of the other', '"Ravi" may be "Ravi Kumar"');
select wi.ok(private.name_match_reason('KUMAR RAVI', 'KUMAR SURESH') is null, 'a shared surname alone is not a match');
select wi.ok(private.name_match_reason('A B', 'A C') is null, 'shared initials alone are not a match');
select wi.ok(private.name_match_reason('GUPTA MAHI', 'GUPTA MAHESH') is null, 'a different first name is not a match');

-- ---------------------------------------------------------------------------
-- People already known
-- ---------------------------------------------------------------------------
insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('7d000000-0000-0000-0000-0000000000a1', 'WIDR', 'Wi Director',    'widr@x.example', 'Management', 'admin'),
  ('7d000000-0000-0000-0000-0000000000c1', 'WITD', 'Wi Travel Desk', 'witd@x.example', 'Admin',      'company_admin'),
  ('7d000000-0000-0000-0000-0000000000d1', 'WIBA', 'Wi Booking',     'wiba@x.example', 'Travel',     'travel_desk'),
  ('7d000000-0000-0000-0000-000000000101', 'WIP1', 'Ravi Kumar',     null, 'Site', 'employee'),
  ('7d000000-0000-0000-0000-000000000102', 'NEW-SB000001', 'Suresh Babu', null, null, 'employee'),
  ('7d000000-0000-0000-0000-000000000103', 'WIP3', 'Anil Rao',       null, 'Site', 'employee'),
  ('7d000000-0000-0000-0000-000000000104', 'WIP4', 'Anil Rao',       null, 'Stores', 'employee'),
  ('7d000000-0000-0000-0000-000000000105', 'WIP5', 'Mahesh Gupta',   null, 'Site', 'employee'),
  ('7d000000-0000-0000-0000-000000000106', 'NEW-MG000001', 'Mahesh G', null, null, 'employee');
insert into auth.users (id, email, email_confirmed_at) values
  ('7e000000-0000-0000-0000-0000000000a1', 'widr@x.example', now()),
  ('7e000000-0000-0000-0000-0000000000c1', 'witd@x.example', now()),
  ('7e000000-0000-0000-0000-0000000000d1', 'wiba@x.example', now());
-- Suresh is a known temporary worker; "Mahesh G" was merged into Mahesh Gupta,
-- and "Mahi Gupta" is a spelling saved for Mahesh on an earlier upload.
update public.profiles set workforce_type = 'temporary_worker' where id = '7d000000-0000-0000-0000-000000000102';
update public.profiles set verification_status = 'merged', merged_into = '7d000000-0000-0000-0000-000000000105'
 where id = '7d000000-0000-0000-0000-000000000106';
insert into public.person_aliases (profile_id, alias, source)
values ('7d000000-0000-0000-0000-000000000105', 'Mahi Gupta', 'import_link');

create temp table wi_rows (j jsonb);
grant select on wi_rows to authenticated;
insert into wi_rows values ($j$[
  {"kind":"flight","sheet":"AIR","source_row":"2","employee_name":"MR. RAVI KUMAR","departure_date":"2026-08-03","origin":"HYD","destination":"BOM","booking_reference":"WIA001","amount":"5000","line_type":"fare"},
  {"kind":"flight","sheet":"AIR","source_row":"3","employee_name":"SURESH BABU","departure_date":"2026-08-04","origin":"HYD","destination":"VTZ","booking_reference":"WIA002","amount":"4000","line_type":"fare"},
  {"kind":"flight","sheet":"AIR","source_row":"4","employee_name":"R KUMAR","departure_date":"2026-08-05","origin":"HYD","destination":"MAA","booking_reference":"WIA003","amount":"3000","line_type":"fare"},
  {"kind":"flight","sheet":"AIR","source_row":"5","employee_name":"ANIL RAO","departure_date":"2026-08-06","origin":"HYD","destination":"DEL","booking_reference":"WIA004","amount":"6000","line_type":"fare"},
  {"kind":"flight","sheet":"AIR","source_row":"6","employee_name":"MAHESH G","departure_date":"2026-08-07","origin":"HYD","destination":"BLR","booking_reference":"WIA005","amount":"3500","line_type":"fare"},
  {"kind":"flight","sheet":"AIR","source_row":"7","employee_name":"MAHI GUPTA","departure_date":"2026-08-08","origin":"BLR","destination":"HYD","booking_reference":"WIA006","amount":"3600","line_type":"fare"},
  {"kind":"train","sheet":"TRAIN","source_row":"2","employee_name":"NEW LABOURER ONE","departure_date":"2026-08-09","origin":"HYD","destination":"VSKP","booking_reference":"WIT007","amount":"900","line_type":"fare","contractor":"Sri Sai Labour"},
  {"kind":"train","sheet":"TRAIN","source_row":"3","employee_name":"NEW LABOURER ONE","departure_date":"2026-08-12","origin":"VSKP","destination":"HYD","booking_reference":"WIT008","amount":"0","line_type":"fare","contractor":"Sri Sai Labour"}
]$j$);

set local role authenticated;
select wi.login('7e000000-0000-0000-0000-0000000000c1');
create temp table wi_b1 as
  select public.import_stage_v2('workforce.xlsx', 'xlsx', '[{"name":"AIR","kind":"flight"}]', (select j from wi_rows), true, 'INR') as id;
grant select on wi_b1 to authenticated;

create temp view wi_rev as
  select r.* from public.name_match_reviews r where r.batch_id = (select id from wi_b1);
grant select on wi_rev to authenticated;

-- ---------------------------------------------------------------------------
-- Staging: what the People step offers
-- ---------------------------------------------------------------------------
select wi.ok((select details ->> 'contractor' from public.import_rows
               where batch_id = (select id from wi_b1) and source_row = 2 and sheet_name = 'TRAIN') = 'Sri Sai Labour',
  'staging keeps the contractor column with the line');

select wi.ok((select decision = 'link' and profile_id = '7d000000-0000-0000-0000-000000000101'
                     and match_reason = 'Same name as an existing employee'
                from wi_rev where name_key = 'KUMAR RAVI'),
  'existing permanent employee: matched by name and suggested');
select wi.ok((select decision = 'link' and profile_id = '7d000000-0000-0000-0000-000000000102'
                     and match_reason = 'Same name as a known temporary worker'
                from wi_rev where name_key = 'BABU SURESH'),
  'existing temporary worker: matched by name, and the reason says what they are');
select wi.ok((select decision = 'pending' and profile_id is null
                     and candidates @> '[{"profile_id":"7d000000-0000-0000-0000-000000000101","reason":"Initials match"}]'
                from wi_rev where name_key = 'KUMAR R'),
  '"R Kumar": shown Ravi Kumar as a possible match, not linked and not created automatically');
select wi.ok((select decision = 'pending' and jsonb_array_length(candidates) = 2
                from wi_rev where name_key = 'ANIL RAO'),
  'two people with the same name: left for a person to choose between both');
select wi.ok((select decision = 'link' and profile_id = '7d000000-0000-0000-0000-000000000105'
                from wi_rev where name_key = 'G MAHESH'),
  'a name that belonged to a merged person is suggested as who they were merged into');
select wi.ok((select decision = 'link' and profile_id = '7d000000-0000-0000-0000-000000000105'
                     and match_reason like 'Spelling saved%'
                from wi_rev where name_key = 'GUPTA MAHI'),
  'a spelling saved on an earlier upload is recognised');
select wi.ok((select decision = 'create' and contractor_name = 'Sri Sai Labour' and candidates = '[]'::jsonb
                from wi_rev where name_key = 'LABOURER NEW ONE'),
  'a new name with no possible match: added (as asked), with the contractor from the sheet');
select wi.ok(not exists (select 1 from wi_rev r, jsonb_array_elements(r.candidates) c
                          where c ->> 'profile_id' = '7d000000-0000-0000-0000-000000000106'),
  'merged people are never offered as candidates');

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------
select wi.login('7e000000-0000-0000-0000-0000000000d1');
select wi.throws($$select public.name_match_decide((select id from wi_b1),
                   '[{"name_key":"LABOURER NEW ONE","decision":"create","workforce_type":"temporary_worker"}]')$$,
  'booking assistant: cannot say what kind of worker someone is');
select wi.ok(public.name_match_decide((select id from wi_b1),
               '[{"name_key":"LABOURER NEW ONE","decision":"create","workforce_type":"unknown"}]') = 1,
  'booking assistant: can add someone as unknown');

select wi.login('7e000000-0000-0000-0000-0000000000c1');
select wi.throws($$select public.name_match_decide((select id from wi_b1),
                   '[{"name_key":"ANIL RAO","decision":"create","workforce_type":"boss"}]')$$,
  'an unknown kind of worker is refused');
select public.name_match_decide((select id from wi_b1), jsonb_build_array(
  jsonb_build_object('name_key', 'KUMAR R', 'decision', 'link', 'profile_id', '7d000000-0000-0000-0000-000000000101'),
  jsonb_build_object('name_key', 'ANIL RAO', 'decision', 'create', 'workforce_type', 'contract_worker', 'contractor', '  ABC   Manpower '),
  jsonb_build_object('name_key', 'LABOURER NEW ONE', 'decision', 'create', 'workforce_type', 'temporary_worker'),
  jsonb_build_object('name_key', 'G MAHESH', 'decision', 'link', 'profile_id', '7d000000-0000-0000-0000-000000000106')));
select wi.ok((select profile_id = '7d000000-0000-0000-0000-000000000105' from wi_rev where name_key = 'G MAHESH'),
  'linking to a merged person links to who they were merged into');

select public.import_commit_v2((select id from wi_b1), true);

-- ---------------------------------------------------------------------------
-- After saving
-- ---------------------------------------------------------------------------
reset role;
select wi.ok((select workforce_type = 'temporary_worker' and verification_status = 'imported_unverified' and source = 'import'
                     and user_id is null
                     and contractor_id = (select id from public.contractors where name = 'Sri Sai Labour')
                from public.profiles where private.person_name_key(full_name) = 'LABOURER NEW ONE'),
  'new labourer: temporary worker, unverified, no login, contractor from the sheet');
select wi.ok((select count(*) from public.travel_records r join public.profiles p on p.id = r.employee_id
               where private.person_name_key(p.full_name) = 'LABOURER NEW ONE') = 2,
  'new labourer: both trips are recorded, including the zero-fare one');
select wi.ok((select workforce_type = 'contract_worker' and verification_status = 'possible_duplicate'
                     and contractor_id = (select id from public.contractors where name = 'ABC Manpower')
                from public.profiles p
               where private.person_name_key(p.full_name) = 'ANIL RAO' and p.id not in ('7d000000-0000-0000-0000-000000000103', '7d000000-0000-0000-0000-000000000104')),
  'a person added although possible matches were shown is marked as a possible duplicate');
select wi.ok((select workforce_type = 'permanent_employee' and verification_status = 'verified'
                from public.profiles where id = '7d000000-0000-0000-0000-000000000101'),
  'linking never changes an existing person''s type or status');
select wi.ok(exists (select 1 from public.person_aliases
                      where profile_id = '7d000000-0000-0000-0000-000000000101' and alias_key = 'KUMAR R' and source = 'import_link'),
  'the "R Kumar" spelling is remembered for Ravi Kumar');
select wi.ok(not exists (select 1 from public.person_aliases where alias_key = 'KUMAR RAVI'),
  'an exact name is not stored again as an alias');
select wi.ok((select count(*) from public.travel_records where employee_id = '7d000000-0000-0000-0000-000000000105') = 2,
  'trips for "Mahesh G" and "Mahi Gupta" are recorded under Mahesh Gupta');
select wi.ok((select count(*) from public.travel_records where employee_id = '7d000000-0000-0000-0000-000000000106') = 0,
  'nothing is recorded under the merged person');
select wi.ok((select count(*) from public.contractors where name_key = 'abc manpower') = 1,
  'the contractor name is tidied and added once');

-- ---------------------------------------------------------------------------
-- The same file again: everything recognised, nothing imported twice
-- ---------------------------------------------------------------------------
set local role authenticated;
select wi.login('7e000000-0000-0000-0000-0000000000c1');
create temp table wi_b2 as
  select public.import_stage_v2('workforce.xlsx', 'xlsx', '[{"name":"AIR","kind":"flight"}]', (select j from wi_rows), true, 'INR') as id;
grant select on wi_b2 to authenticated;
select wi.ok((select decision = 'link' and profile_id = '7d000000-0000-0000-0000-000000000101' and match_reason like 'Spelling saved%'
                from public.name_match_reviews where batch_id = (select id from wi_b2) and name_key = 'KUMAR R'),
  'second upload: "R Kumar" is now recognised from the saved spelling');
select wi.ok((select decision = 'link' and match_reason = 'Same name as a known temporary worker'
                from public.name_match_reviews where batch_id = (select id from wi_b2) and name_key = 'LABOURER NEW ONE'),
  'second upload: the new labourer is now recognised as a known temporary worker');
select public.name_match_decide((select id from wi_b2), (
  select jsonb_agg(jsonb_build_object('name_key', name_key, 'decision', 'link', 'profile_id', coalesce(profile_id, (candidates -> 0 ->> 'profile_id')::uuid)))
    from public.name_match_reviews where batch_id = (select id from wi_b2)));
select wi.ok((select imported_rows = 0 and created_employees = 0 from public.import_commit_v2((select id from wi_b2), true)),
  'second upload: no trip is imported twice and nobody new is created');

reset role;
select wi.ok(exists (select 1 from public.audit_logs where action = 'name_match_decided'),
  'People step decisions are written to the audit log');

rollback;
