-- =============================================================================
-- Temporary workforce, part 5: analytics reconciliation
-- (20261115160000_workforce_analytics.sql). Every figure below is worked out
-- by hand from the trips inserted here.
-- Runs in a transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

create schema wa;
grant usage on schema wa to authenticated, anon;
create function wa.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
create function wa.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
create function wa.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema wa to authenticated, anon;

-- The analytics cover everyone on file, so start from an empty set of trips.
delete from public.cost_lines;
delete from public.documents;
delete from public.bulk_booking_members;
delete from public.travel_records;

insert into public.profiles (id, employee_id, full_name, email, role) values
  ('9a000000-0000-0000-0000-0000000000c1', 'WATD', 'Wa Travel Desk', 'watd@x.example', 'company_admin'),
  ('9a000000-0000-0000-0000-0000000000b1', 'WAAP', 'Wa Approver',    'waap@x.example', 'approver'),
  ('9a000000-0000-0000-0000-0000000000d1', 'WABA', 'Wa Booking',     'waba@x.example', 'travel_desk');
insert into auth.users (id, email, email_confirmed_at) values
  ('9b000000-0000-0000-0000-0000000000c1', 'watd@x.example', now()),
  ('9b000000-0000-0000-0000-0000000000b1', 'waap@x.example', now()),
  ('9b000000-0000-0000-0000-0000000000d1', 'waba@x.example', now());

insert into public.contractors (id, name) values
  ('9c000000-0000-0000-0000-00000000000a', 'Alpha Labour'),
  ('9c000000-0000-0000-0000-00000000000b', 'Beta Manpower');
insert into public.projects (id, name, kind) values ('9d000000-0000-0000-0000-000000000001', 'Wa Project X', 'project');

insert into public.profiles (id, employee_id, full_name) values
  ('9a000000-0000-0000-0000-000000000101', 'WAP1', 'Perm One'),
  ('9a000000-0000-0000-0000-000000000102', 'NEW-WAT00001', 'Temp One'),
  ('9a000000-0000-0000-0000-000000000103', 'NEW-WAC00001', 'Contract One'),
  ('9a000000-0000-0000-0000-000000000104', 'NEW-WAU00001', 'Unknown One');
update public.profiles set workforce_type = 'temporary_worker', contractor_id = '9c000000-0000-0000-0000-00000000000a'
 where id = '9a000000-0000-0000-0000-000000000102';
update public.profiles set workforce_type = 'contract_worker', contractor_id = '9c000000-0000-0000-0000-00000000000b'
 where id = '9a000000-0000-0000-0000-000000000103';

-- id                                    who        when        route        project   money (INR unless said)
-- ...01  Perm One   2026-07-10  HYD-DEL      X         4000
-- ...11  Temp One   2026-07-12  HYD-DEL      X         1000 fare, -200 refund  (net 800)
-- ...12  Temp One   2026-08-03  HYD-DXB      -         5000 (international)
-- ...13  Temp One   2026-08-09  HYD-VTZ      -         0 (zero fare)
-- ...14  Temp One   2026-08-15  HYD-BOM      -         blank (missing)
-- ...15  Temp One   2026-08-20  HYD-MAA      -         700, cancelled
-- ...16  Temp One   2026-09-02  DXB-HYD      -         USD 100
-- ...21  Contract   2026-10-05  HYD-BLR      X         2000
-- ...31  Unknown    2026-10-07  HYD-MAA      -         300
insert into public.travel_records (id, employee_id, origin, destination, departure_date, booking_reference, currency, status, source, booking_type, amount) values
  ('9e000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000101', 'HYD', 'DEL', '2026-07-10', 'WAP001', 'INR', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000011', '9a000000-0000-0000-0000-000000000102', 'HYD', 'DEL', '2026-07-12', 'WAT011', 'INR', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000012', '9a000000-0000-0000-0000-000000000102', 'HYD', 'DXB', '2026-08-03', 'WAT012', 'INR', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000013', '9a000000-0000-0000-0000-000000000102', 'HYD', 'VTZ', '2026-08-09', 'WAT013', 'INR', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000014', '9a000000-0000-0000-0000-000000000102', 'HYD', 'BOM', '2026-08-15', 'WAT014', 'INR', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000015', '9a000000-0000-0000-0000-000000000102', 'HYD', 'MAA', '2026-08-20', 'WAT015', 'INR', 'cancelled', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000016', '9a000000-0000-0000-0000-000000000102', 'DXB', 'HYD', '2026-09-02', 'WAT016', 'USD', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000021', '9a000000-0000-0000-0000-000000000103', 'HYD', 'BLR', '2026-10-05', 'WAC021', 'INR', 'completed', 'import', 'flight', null),
  ('9e000000-0000-0000-0000-000000000031', '9a000000-0000-0000-0000-000000000104', 'HYD', 'MAA', '2026-10-07', 'WAU031', 'INR', 'completed', 'import', 'flight', null);
-- Projects are linked by the project functions; here as the database owner.
update public.travel_records set project_id = '9d000000-0000-0000-0000-000000000001'
 where id in ('9e000000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-000000000011', '9e000000-0000-0000-0000-000000000021');
insert into public.cost_lines (travel_record_id, line_type, amount, currency, amount_state) values
  ('9e000000-0000-0000-0000-000000000001', 'fare',   4000, 'INR', 'recorded'),
  ('9e000000-0000-0000-0000-000000000011', 'fare',   1000, 'INR', 'recorded'),
  ('9e000000-0000-0000-0000-000000000011', 'refund', -200, 'INR', 'recorded'),
  ('9e000000-0000-0000-0000-000000000012', 'fare',   5000, 'INR', 'recorded'),
  ('9e000000-0000-0000-0000-000000000013', 'fare',      0, 'INR', 'zero'),
  ('9e000000-0000-0000-0000-000000000014', 'fare',   null, 'INR', 'missing'),
  ('9e000000-0000-0000-0000-000000000015', 'fare',    700, 'INR', 'recorded'),
  ('9e000000-0000-0000-0000-000000000016', 'fare',    100, 'USD', 'recorded'),
  ('9e000000-0000-0000-0000-000000000021', 'fare',   2000, 'INR', 'recorded'),
  ('9e000000-0000-0000-0000-000000000031', 'fare',    300, 'INR', 'recorded');

set local role authenticated;

select wa.login('9b000000-0000-0000-0000-0000000000b1');
select wa.throws($$select public.workforce_analytics('{}')$$, 'approver: cannot open workforce analytics');

select wa.login('9b000000-0000-0000-0000-0000000000d1');
create temp table wa_all as select public.workforce_analytics('{}') as a;
grant select on wa_all to authenticated;
create temp view wa_v as select a from wa_all;
grant select on wa_v to authenticated;

-- ---------------------------------------------------------------------------
-- By kind of worker
-- ---------------------------------------------------------------------------
select wa.ok((select x ->> 'workforce_type' = 'temporary_worker'
                     and (x ->> 'travellers')::int = 1 and (x ->> 'trips')::int = 5 and (x ->> 'cancelled_trips')::int = 1
                     and (x ->> 'gross')::numeric = 6000 and (x ->> 'credits')::numeric = -200 and (x ->> 'net')::numeric = 5800
                     and (x ->> 'missing_cost_lines')::int = 1 and (x ->> 'zero_fare_lines')::int = 1
                from wa_v, jsonb_array_elements(a -> 'by_type') x where x ->> 'workforce_type' = 'temporary_worker'),
  'temporary: 5 trips + 1 cancelled; INR gross 6000, credits -200, net 5800 (USD and cancelled left out); 1 missing, 1 zero fare');
select wa.ok((select (x ->> 'avg_ticket_fare')::numeric = 2900 and (x ->> 'fares_averaged')::int = 2
                from wa_v, jsonb_array_elements(a -> 'by_type') x where x ->> 'workforce_type' = 'temporary_worker'),
  'temporary: average fare 2900 from the 800 and 5000 trips only (zero fare, missing cost, USD and cancelled left out)');
select wa.ok((select (x ->> 'net')::numeric = 2000 and (x ->> 'people')::int = 1
                from wa_v, jsonb_array_elements(a -> 'by_type') x where x ->> 'workforce_type' = 'contract_worker'),
  'contract: 2000');
select wa.ok((select (x ->> 'net')::numeric = 300
                from wa_v, jsonb_array_elements(a -> 'by_type') x where x ->> 'workforce_type' = 'unknown'),
  'unknown: 300');

-- ---------------------------------------------------------------------------
-- Permanent compared with everyone else (no double counting)
-- ---------------------------------------------------------------------------
select wa.ok((select (x ->> 'net')::numeric = 4000 and (x ->> 'share_pct')::numeric = 33.1
                from wa_v, jsonb_array_elements(a -> 'comparison') x where x ->> 'group' = 'permanent'),
  'permanent: 4000, 33.1% of 12100');
select wa.ok((select (x ->> 'net')::numeric = 8100 and (x ->> 'share_pct')::numeric = 66.9 and (x ->> 'trips')::int = 7
                     and (x ->> 'avg_ticket_fare')::numeric = 2025
                from wa_v, jsonb_array_elements(a -> 'comparison') x where x ->> 'group' = 'non_permanent'),
  'not permanent: 8100 (5800 + 2000 + 300), 66.9%, 7 trips, average fare 2025 over 4 fares');
select wa.ok((select sum((x ->> 'net')::numeric) = 12100 from wa_v, jsonb_array_elements(a -> 'comparison') x),
  'the two groups add up to the total exactly once');

-- ---------------------------------------------------------------------------
-- Contractors and projects
-- ---------------------------------------------------------------------------
select wa.ok((select jsonb_agg(jsonb_build_object('name', x ->> 'name', 'net', (x ->> 'net')::numeric) order by x ->> 'name')
                from wa_v, jsonb_array_elements(a -> 'contractors') x)
             = '[{"name":"Alpha Labour","net":5800},{"name":"Beta Manpower","net":2000},{"name":"Unknown","net":300}]'::jsonb,
  'contractors: Alpha 5800, Beta 2000, people with no contractor shown as Unknown 300');
select wa.ok((select (x ->> 'non_permanent_net')::numeric = 2800 and (x ->> 'non_permanent_workers')::int = 2
                     and (x ->> 'permanent_net')::numeric = 4000 and (x ->> 'non_permanent_share_pct')::numeric = 41.2
                from wa_v, jsonb_array_elements(a -> 'projects') x where x ->> 'name' = 'Wa Project X'),
  'project X: 2800 from 2 non-permanent workers next to 4000 from permanent staff (41.2%)');
select wa.ok((select (x ->> 'non_permanent_net')::numeric = 5300 and x ->> 'project_id' is null
                from wa_v, jsonb_array_elements(a -> 'projects') x where x ->> 'name' = 'Unassigned'),
  'trips with no project: Unassigned 5300, never guessed');

-- ---------------------------------------------------------------------------
-- Trends, regions, other currencies, data quality
-- ---------------------------------------------------------------------------
select wa.ok((select jsonb_agg(jsonb_build_object('m', x ->> 'month', 'np', (x ->> 'non_permanent_net')::numeric, 'p', (x ->> 'permanent_net')::numeric) order by x ->> 'month')
                from wa_v, jsonb_array_elements(a -> 'monthly') x)
             = '[{"m":"2026-07","np":800,"p":4000},{"m":"2026-08","np":5000,"p":0},{"m":"2026-09","np":0,"p":0},{"m":"2026-10","np":2300,"p":0}]'::jsonb,
  'monthly: Jul 800 / 4000, Aug 5000, Sep only a USD trip (0 in INR), Oct 2300');
select wa.ok((select jsonb_agg(jsonb_build_object('q', x ->> 'quarter', 'np', (x ->> 'non_permanent_net')::numeric) order by x ->> 'quarter')
                from wa_v, jsonb_array_elements(a -> 'quarterly') x)
             = '[{"q":"2026-Q3","np":5800},{"q":"2026-Q4","np":2300}]'::jsonb,
  'quarterly: Q3 5800, Q4 2300');
select wa.ok((select (x ->> 'net')::numeric = 5000 and (x ->> 'trips')::int = 2
                from wa_v, jsonb_array_elements(a -> 'regions') x where x ->> 'group' = 'non_permanent' and x ->> 'region' = 'international'),
  'international (not permanent): 2 trips (the USD one too), 5000 in INR');
select wa.ok((select (x ->> 'net')::numeric = 3100
                from wa_v, jsonb_array_elements(a -> 'regions') x where x ->> 'group' = 'non_permanent' and x ->> 'region' = 'domestic'),
  'domestic (not permanent): 3100 (800 + 0 + missing + 2000 + 300)');
select wa.ok((select a -> 'other_currencies' = '[{"currency":"USD","group":"non_permanent","trips":1,"net":100}]'::jsonb from wa_v),
  'other currencies: USD 100 listed apart, never added to INR');
select wa.ok((select (a -> 'quality' ->> 'cancelled_trips')::int = 1 and (a -> 'quality' ->> 'missing_cost_lines')::int = 1
                     and (a -> 'quality' ->> 'zero_fare_lines')::int = 1 from wa_v),
  'data quality: 1 cancelled, 1 missing cost, 1 zero fare reported');

-- ---------------------------------------------------------------------------
-- Filters
-- ---------------------------------------------------------------------------
select wa.ok((select sum((x ->> 'net')::numeric) = 2300
                from jsonb_array_elements(public.workforce_analytics('{"from":"2026-10-01","to":"2026-10-31"}') -> 'comparison') x),
  'date filter: October only, 2300');
select wa.ok((select (x ->> 'net')::numeric = 2000
                from jsonb_array_elements(public.workforce_analytics('{"contractor":"9c000000-0000-0000-0000-00000000000b"}') -> 'comparison') x
               where x ->> 'group' = 'non_permanent'),
  'contractor filter: Beta Manpower only, 2000');
select wa.ok((select sum((x ->> 'net')::numeric) = 6800
                from jsonb_array_elements(public.workforce_analytics('{"project":"9d000000-0000-0000-0000-000000000001"}') -> 'comparison') x),
  'project filter: Project X only, 4000 + 2800');

rollback;
