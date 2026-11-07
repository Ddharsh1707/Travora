-- =============================================================================
-- Travel intelligence part 1: multi-sheet upload, people review, project
-- aliases, cost lines. Runs in a transaction that is rolled back.
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
grant execute on all functions in schema ti to authenticated, anon;

insert into public.profiles (id, employee_id, full_name, email, department, role) values
  ('20000000-0000-0000-0000-0000000000a1', 'TADM', 'Chief Officer',  'ceo@t.example',  'Management', 'admin'),
  ('20000000-0000-0000-0000-0000000000d1', 'TDSK', 'Desk Person',    'desk@t.example', 'Travel',     'travel_desk'),
  ('20000000-0000-0000-0000-0000000000b1', 'TMGR', 'Team Manager',   'mgr@t.example',  'Projects',   'approver'),
  ('20000000-0000-0000-0000-0000000000e1', 'TE01', 'Ravi Demo',      'ravi@t.example', 'Projects',   'employee'),
  ('20000000-0000-0000-0000-0000000000e2', 'TE02', 'Arjun Tester',   'arj@t.example',  'Projects',   'employee');
update public.profiles set manager_id = '20000000-0000-0000-0000-0000000000b1' where employee_id = 'TE01';
insert into auth.users (id, email, email_confirmed_at) values
  ('30000000-0000-0000-0000-0000000000a1', 'ceo@t.example',  now()),
  ('30000000-0000-0000-0000-0000000000d1', 'desk@t.example', now()),
  ('30000000-0000-0000-0000-0000000000b1', 'mgr@t.example',  now()),
  ('30000000-0000-0000-0000-0000000000e1', 'ravi@t.example', now()),
  ('30000000-0000-0000-0000-0000000000e2', 'arj@t.example',  now());

select ti.ok(private.person_name_key('TESTER/ARJUN MR') = private.person_name_key('MR. ARJUN TESTER'), 'names: airline style matches');
select ti.ok(private.person_name_key('P SATHEESH') <> private.person_name_key('SATHEESH PONNUSAMY'), 'names: different words do not match');
select ti.ok(private.alias_key(' Liberia  THOKADEH ') = 'liberia thokadeh', 'project spellings are compared without case or spacing');
select ti.ok((select count(*) from public.companies) = 1, 'one company row exists');

create temp table rows_json (j jsonb);
grant select on rows_json to authenticated;
insert into rows_json values ($j$[
  {"kind":"flight","sheet":"AIR","source_row":"4","employee_name":"MR. ARJUN TESTER","display_name":"Arjun Tester","departure_date":"2026-09-09","booking_date":"2026-09-01","origin":"BOM","destination":"VTZ","route":"BOM - VTZ","provider":"6E","booking_reference":"ab1cde","amount":"10243","line_type":"fare","project":"Site Alpha","purpose":"demobilization","raw":{"Passenger Name":"MR. ARJUN TESTER"}},
  {"kind":"flight","sheet":"AIR","source_row":"5","employee_name":"TESTER/ARJUN MR","display_name":"Arjun Tester","departure_date":"2026-09-07","origin":"ROB","destination":"BOM","booking_reference":"FG2HIJ","amount":"114738","line_type":"fare","project":"SITE ALPHA "},
  {"kind":"flight","sheet":"AIR","source_row":"6","employee_name":"MR. RAVI DEMO","departure_date":"2026-09-28","origin":"HYD","destination":"MAA","booking_reference":"ND4P6Q","amount":"8993","line_type":"fare","project":"Site Gamma"},
  {"kind":"flight","sheet":"AIR","source_row":"7","employee_name":"MR. RAVI DEMO","departure_date":"2026-09-28","origin":"HYD","destination":"MAA","booking_reference":"ND4P6Q","amount":"500","line_type":"addon","project":"Site Gamma","notes":["Extra charge on the same booking as row 6 (PNR ND4P6Q)"]},
  {"kind":"flight","sheet":"AIR","source_row":"8","employee_name":"MR. RAVI DEMO","departure_date":"2026-09-28","origin":"HYD","destination":"MAA","booking_reference":"ND4P6Q","amount":"500","line_type":"addon","project":"Site Gamma"},
  {"kind":"flight","sheet":"AIR","source_row":"9","employee_name":"MR. NEW PERSON","departure_date":"2026-10-04","origin":"HYD","destination":"DEL","booking_reference":"VW5XYZ","amount":"34575","record_status":"cancelled","project":"Head Office","notes":["Marked CANCELLED in Ticket Number; refund not recorded in the sheet"]},
  {"kind":"hotel","sheet":"HOTEL","source_row":"23","employee_name":"MR. RAVI DEMO","departure_date":"2026-09-25","return_date":"2026-09-28","destination":"HYDERABAD","provider":"Test Inn","amount":"14175","line_type":"hotel","group_key":"HOTEL!K23:K25","project":"Site Delta"},
  {"kind":"hotel","sheet":"HOTEL","source_row":"24","employee_name":"MS. MOU THREE","departure_date":"2026-09-25","return_date":"2026-09-28","destination":"HYDERABAD","provider":"Test Inn","amount":"","amount_state":"included_in_group","line_type":"hotel","group_key":"HOTEL!K23:K25"},
  {"kind":"cab","sheet":"CAB","source_row":"5","employee_name":"MR. RAVI DEMO","departure_date":"2026-09-02","destination":"DELHI","provider":"ECO","amount":""},
  {"kind":"flight","sheet":"AIR","source_row":"10","employee_name":"MR. RAVI DEMO","departure_date":"","origin":"HYD","destination":"BOM","amount":"100"}
]$j$);

-- Who may upload
set local role authenticated;
select ti.login('30000000-0000-0000-0000-0000000000e1');
select ti.throws($$select public.import_stage_v2('s.xlsx', 'xlsx', '[]', (select j from rows_json))$$, 'employee cannot upload');
select ti.throws($$select public.project_create('X')$$, 'employee cannot create projects');
select ti.ok((select count(*) from public.projects) = 0, 'employee cannot see projects');
select ti.login('30000000-0000-0000-0000-0000000000b1');
select ti.throws($$select public.import_stage_v2('s.xlsx', 'xlsx', '[]', (select j from rows_json))$$, 'approver cannot upload');

select ti.login('30000000-0000-0000-0000-0000000000d1');
select ti.throws($$select public.import_stage_v2('s.xlsx', 'xlsx', '[]', (select j from rows_json), false, 'rupees')$$, 'currency must be a 3-letter code');
create temp table b1 as select public.import_stage_v2('MISPL_SEP.xlsx', 'xlsx', '[{"name":"AIR","kind":"flight"}]', (select j from rows_json), true, 'INR') as id;
grant select on b1 to authenticated;

select ti.ok((select format_version = 2 and assumed_currency = 'INR' and total_rows = 10 and error_rows = 1 from public.import_batches where id = (select id from b1)),
  'upload: 10 lines, 1 error (missing date), INR recorded as the assumed currency');
select ti.ok((select status from public.import_rows where batch_id = (select id from b1) and source_row = 10) = 'error', 'upload: a line without a travel date is an error');
select ti.ok((select count(*) from public.import_rows where batch_id = (select id from b1) and status = 'duplicate') = 0,
  'upload: repeated PNR lines are charges, not duplicates');
select ti.ok((select amount_state from public.import_rows where batch_id = (select id from b1) and source_row = 24) = 'included_in_group', 'upload: shared cost row is not "missing"');
select ti.ok((select amount_state from public.import_rows where batch_id = (select id from b1) and sheet_name = 'CAB') = 'missing', 'upload: blank cab cost is "missing"');
select ti.ok((select array_to_string(messages, ' ') like '%refund not recorded%' from public.import_rows where batch_id = (select id from b1) and source_row = 9),
  'upload: parser notes are kept with the line');

-- People step: one line per person; airline-style spelling is the same person
select ti.ok((select count(*) from public.name_match_reviews where batch_id = (select id from b1)) = 4, 'people: 4 distinct travellers to review');
select ti.ok((select row_count from public.name_match_reviews where batch_id = (select id from b1) and name_key = private.person_name_key('Arjun Tester')) = 2,
  'people: both spellings of one person grouped');
select ti.ok((select decision = 'link' and suggested_profile_id = '20000000-0000-0000-0000-0000000000e2' from public.name_match_reviews
               where batch_id = (select id from b1) and name_key = private.person_name_key('Arjun Tester')), 'people: existing employee suggested');
select ti.ok((select decision from public.name_match_reviews where batch_id = (select id from b1) and name_key = private.person_name_key('New Person')) = 'create',
  'people: unknown person proposed as new when that option is on');
select ti.ok((select display_name from public.name_match_reviews where batch_id = (select id from b1) and name_key = private.person_name_key('Arjun Tester')) = 'Arjun Tester',
  'people: readable name kept');
select public.name_match_decide((select id from b1), jsonb_build_array(
  jsonb_build_object('name_key', private.person_name_key('MOU THREE'), 'decision', 'skip')));
select ti.throws($$select public.name_match_decide((select id from b1), '[{"name_key":"X","decision":"link"}]')$$, 'people: linking needs an employee');

-- Projects step
select ti.ok((select jsonb_array_length(public.import_projects((select id from b1)))) = 4, 'projects: 4 distinct spellings found (Site Alpha twice counts once)');
create temp table pj as select public.project_create('Site Alpha Master', 'project') as alpha, public.project_create('Head Office', 'cost_centre') as ho;
grant select on pj to authenticated;
select ti.ok((select public.project_create('site alpha master')) = (select alpha from pj), 'projects: same name returns the same project');
select public.project_alias_set('Site Alpha', (select alpha from pj));
select public.project_alias_set('Head Office', (select ho from pj));
select ti.throws($$select public.project_update((select alpha from pj), null, null, null, 'Client', null, null, 'active', null, null, null)$$,
  'projects: travel desk cannot change project status');

select public.import_commit_v2((select id from b1));
select ti.ok((select imported_rows = 8 and created_employees = 1 from public.import_batches where id = (select id from b1)),
  'commit: 8 lines imported (1 error, 1 skipped person), 1 new employee');

create temp table chk as
  select r.id, r.employee_id, r.booking_reference, r.amount, r.status, r.project_id, r.project_source, r.origin, r.booking_type
    from public.travel_records r where r.import_batch_id = (select id from b1);
select ti.ok((select count(*) from chk) = 6, 'commit: 7 lines became 6 trips (two add-ons joined their booking)');
select ti.ok((select amount from chk where booking_reference = 'ND4P6Q') = 9993, 'commit: booking total = fare + both add-ons (8993 + 500 + 500)');
select ti.ok((select count(*) from public.cost_lines c join chk on chk.id = c.travel_record_id where chk.booking_reference = 'ND4P6Q') = 3,
  'commit: each charge is its own cost line');
select ti.ok((select status from chk where booking_reference = 'VW5XYZ') = 'cancelled', 'commit: cancelled status kept');
select ti.ok((select amount from chk where booking_reference = 'VW5XYZ') = 34575, 'commit: cancelled booking keeps its recorded cost');
select ti.ok((select count(*) from chk where project_id = (select alpha from pj) and project_source = 'alias') = 2, 'commit: both "Site Alpha" spellings mapped to the project');
select ti.ok((select count(*) from chk where project_id is null) = 3, 'commit: unmapped project names stay unassigned');
select ti.ok((select origin is null and booking_type = 'hotel' from chk where booking_type = 'hotel'), 'commit: hotel stay saved without a route');
select ti.ok((select amount is null from chk where booking_type = 'cab'), 'commit: missing cab cost stays missing, not zero');
select ti.ok((select count(*) from chk where employee_id = '20000000-0000-0000-0000-0000000000e2') = 2, 'commit: airline-style row landed on the existing employee');
select ti.ok((select count(*) from public.profiles where private.person_name_key(full_name) = private.person_name_key('New Person') and employee_id like 'NEW-%') = 1, 'commit: new person added once');

-- Mapping later spellings updates trips already imported
select public.project_alias_set('Site Gamma', public.project_create('Site Gamma'));
select ti.ok((select count(*) from public.travel_records where import_batch_id = (select id from b1) and project_id is not null) = 4,
  'aliases: mapping a spelling later updates past trips');

-- The same file again adds nothing
create temp table b2 as select public.import_stage_v2('MISPL_SEP.xlsx', 'xlsx', '[]', (select j from rows_json), true, 'INR') as id;
grant select on b2 to authenticated;
select ti.ok((select count(*) from public.import_rows where batch_id = (select id from b2) and status = 'duplicate') = 8,
  're-upload: every imported line is recognised as already imported');
select public.import_commit_v2((select id from b2));
select ti.ok((select count(*) from public.travel_records where booking_reference = 'ND4P6Q') = 1 and
             (select amount from public.travel_records where booking_reference = 'ND4P6Q') = 9993, 're-upload: totals unchanged');

-- Browser writes cannot move a trip to another project
update public.travel_records set project_id = null where booking_reference = 'AB1CDE';
select ti.ok((select project_id from public.travel_records where booking_reference = 'AB1CDE') = (select alpha from pj),
  'guard: project assignment cannot be changed by a direct table update');
select ti.throws($$insert into public.cost_lines (travel_record_id, amount) select id, 1 from public.travel_records limit 1$$, 'guard: cost lines cannot be written directly');

-- Reading
select ti.login('30000000-0000-0000-0000-0000000000e1');
select ti.ok((select count(*) from public.cost_lines) = 5, 'employee sees only the cost lines of their own trips');
select ti.ok((select count(*) from public.name_match_reviews) = 0, 'employee cannot see people reviews');
select ti.throws($$select public.import_projects((select id from b1))$$, 'employee cannot list upload projects');
select ti.login('30000000-0000-0000-0000-0000000000b1');
select ti.ok((select count(*) from public.projects) = 3, 'approver can read projects');
select ti.ok((select count(*) from public.cost_lines) = 5, 'approver sees cost lines of their team only');
select ti.throws($$select public.project_alias_set('Anything', null)$$, 'approver cannot change project mappings');

select ti.login('30000000-0000-0000-0000-0000000000a1');
select ti.ok((select (public.project_update((select alpha from pj), null, null, 'P-01', 'Client Ltd', 'Site', 'Liberia', 'active', '2026-01-01', null, null)).status) = 'active',
  'CEO can set project status and client');
select ti.throws($$select public.project_update((select alpha from pj), null, null, null, null, null, null, 'finished', null, null, null)$$, 'unknown project status rejected');
reset role;
-- A booking in another currency, to prove it is never added to INR totals
insert into public.travel_records (employee_id, origin, destination, departure_date, amount, currency, booking_type, booking_reference)
values ('20000000-0000-0000-0000-0000000000e1', 'MAA', 'SIN', '2026-09-15', 400, 'USD', 'flight', 'USD001');
set local role authenticated;

-- ===== Business Intelligence: overview and projects =====
select ti.login('30000000-0000-0000-0000-0000000000e1');
select ti.throws($$select public.bi_overview()$$, 'BI: employees cannot open the overview');
select ti.throws($$select public.bi_projects()$$, 'BI: employees cannot open Project Intelligence');

select ti.login('30000000-0000-0000-0000-0000000000a1');
create temp table ov as select public.bi_overview() as j;
grant select on ov to authenticated;
select ti.ok((select (j->'kpis'->>'bookings')::int from ov) = (select count(*) from public.travel_records), 'BI: CEO sees every booking, including the USD one');
select ti.ok((select (j->'kpis'->>'spend')::numeric from ov) = 149149,
  'BI: spend = INR bookings that are not cancelled (10243 + 114738 + 9993 + 14175)');
select ti.ok((select (j->'kpis'->>'cancelled_cost')::numeric from ov) = 34575, 'BI: cancelled cost is reported on its own');
select ti.ok((select (j->'kpis'->>'missing_cost')::int from ov) = 1, 'BI: the cab without a cost is counted as missing, not as 0');
select ti.ok((select j->'other_currencies'->0->>'currency' = 'USD' and (j->'other_currencies'->0->>'spend')::numeric = 400 from ov),
  'BI: USD is listed separately and never added to INR');
select ti.ok((select (j->'kpis'->>'unassigned_bookings')::int from ov) = 4, 'BI: bookings without a project are counted as unassigned');
select ti.ok((select (public.bi_overview('{"department":"Projects"}')->'kpis'->>'bookings')::int) = 6, 'BI: department filter');
select ti.ok((select (public.bi_overview('{"from":"2026-10-01"}')->'kpis'->>'bookings')::int) = 1, 'BI: date filter');
select ti.ok((select (public.bi_overview('{"from":"not a date"}')->'kpis'->>'bookings')::int) = (select count(*) from public.travel_records), 'BI: a malformed filter is ignored');

create temp table pl as select public.bi_projects() as j;
grant select on pl to authenticated;
select ti.ok((select (x->>'spend')::numeric = 124981 and (x->>'bookings')::int = 2 and (x->>'travellers')::int = 1
                from pl, jsonb_array_elements(j->'projects') x where x->>'name' = 'Site Alpha Master'),
  'projects: Site Alpha = 2 bookings, 1 traveller, 124981');
select ti.ok((select (x->>'spend')::numeric = 0 and (x->>'bookings')::int = 1 from pl, jsonb_array_elements(j->'projects') x where x->>'name' = 'Head Office'),
  'projects: a cancelled booking adds nothing to project spend');
select ti.ok((select (j->'unassigned'->>'bookings')::int = 3 and (j->'unassigned'->>'without_cost')::int = 2 from pl),
  'projects: unassigned INR bookings and those without a cost of their own (missing or shared) are shown');
select ti.ok((select j->'unassigned'->'names' @> '[{"project_raw":"Site Delta"}]' from pl), 'projects: unassigned sheet spellings are listed');

create temp table pd as select public.bi_project_detail((select alpha from pj)) as j;
grant select on pd to authenticated;
select ti.ok((select jsonb_array_length(j->'ledger') = 2 and (j->'ledger_total')::int = 2 from pd), 'project detail: ledger lists every booking behind the total');
select ti.ok((select j->'aliases' @> '["Site Alpha"]' from pd), 'project detail: sheet spellings shown');
select ti.ok((select (public.bi_project_detail(null)->'kpis'->>'bookings')::int) = 4, 'project detail: unassigned bucket (includes the USD booking)');

-- Manual assignment
select ti.login('30000000-0000-0000-0000-0000000000d1');
select ti.throws($$select public.trip_assign_project((select id from chk where booking_type = 'cab'), (select alpha from pj))$$,
  'assign: travel desk cannot assign trips to projects');
select ti.login('30000000-0000-0000-0000-0000000000a1');
select public.trip_assign_project((select id from chk where booking_type = 'cab'), (select alpha from pj));
select ti.ok((select project_id = (select alpha from pj) and project_source = 'manual' from public.travel_records where id = (select id from chk where booking_type = 'cab')),
  'assign: CEO assignment is saved as manual');
select ti.throws($$select public.trip_assign_project((select id from chk where booking_type = 'cab'), gen_random_uuid())$$, 'assign: unknown project rejected');

-- Approver: only their team (Ravi), through the same RLS
select ti.login('30000000-0000-0000-0000-0000000000b1');
create temp table ova as select public.bi_overview() as j;
grant select on ova to authenticated;
select ti.ok((select (j->'kpis'->>'bookings')::int from ova) = 4, 'BI: approver sees only their team (Ravi: 3 INR + 1 USD)');
select ti.ok((select (j->'kpis'->>'spend')::numeric from ova) = 24168, 'BI: approver spend covers their team only');
select ti.ok((select jsonb_array_length(public.bi_filter_options()->'employees')) = 1, 'BI: approver filter list holds only their team');
select ti.ok((select (x->>'bookings')::int from jsonb_array_elements(public.bi_projects()->'projects') x where x->>'name' = 'Site Alpha Master') = 1,
  'projects: approver sees only their team on a project');
reset role;
select ti.ok((select count(*) from public.audit_logs where action = 'trip_project_assigned') = 1, 'assign: audited');

select ti.ok((select count(*) from public.audit_logs where action in ('project_alias_set', 'name_match_decided')) >= 4, 'mappings and people decisions are audited');

-- ===== Part 3: places, travel, employees, finance, insights =====
select ti.ok((select count(*) from public.locations where kind = 'airport') > 3000, 'places: airports loaded');
select ti.ok((select code from public.locations where id = private.resolve_place('HYD')) = 'HYD', 'places: airport code on a flight');
select ti.ok(private.resolve_place('GOA', false) is null, 'places: a 3-letter word on a hotel line is not read as an airport code');
select ti.ok((select code from public.locations where id = private.resolve_place('SAMALKOT JN (SLO)', false)) = 'SLO', 'places: station code in brackets');
select ti.ok((select kind from public.locations where id = private.resolve_place('Hyderabad', false)) = 'city', 'places: town name');
select ti.ok(private.resolve_place('TRICHY', false) is null, 'places: an unknown spelling is not guessed');
select ti.ok(private.resolve_place('VOM') is null, 'places: an airport code missing from the data stays off the map');
select ti.ok((select array_agg(role order by seq) from private.trip_stops('BOM', 'DEL -VTZ')) = array['origin', 'via', 'destination'],
  'places: "DEL -VTZ" is read as a connection through DEL');
select ti.ok((select (p).place_key from (select private.place_of(private.resolve_place('HYD')) as p) x)
           = (select (p).place_key from (select private.place_of(private.resolve_place('HYDERABAD', false)) as p) x),
  'places: HYD airport and the town Hyderabad are one place');
select ti.ok(private.fin_period('2027-03-31', 'fy') = 'FY 2026-27' and private.fin_period('2026-04-01', 'quarter') = 'FY 2026-27 Q1'
             and private.fin_period('2027-01-15', 'quarter') = 'FY 2026-27 Q4' and private.fin_period('2026-09-07', 'month') = '2026-09',
  'finance: Indian financial year and quarters (April to March)');
select ti.ok(private.money_text(4740713.10, 'INR') = '₹47,40,713' and private.money_text(999, 'INR') = '₹999' and private.money_text(1234.4, 'USD') = 'USD 1,234',
  'insights: money written the Indian way');

set local role authenticated;
select ti.login('30000000-0000-0000-0000-0000000000e1');
select ti.throws($$select public.bi_travel()$$, 'travel: employees refused');
select ti.throws($$select public.bi_employees()$$, 'employees: employees refused');
select ti.throws($$select public.bi_finance()$$, 'finance: employees refused');
select ti.throws($$select public.bi_insights()$$, 'insights: employees refused');

select ti.login('30000000-0000-0000-0000-0000000000b1');
select ti.throws($$select public.location_alias_set('TRICHY', (select id from public.locations where kind = 'airport' and code = 'TRZ'))$$, 'places: approver cannot link places');
select ti.ok((select (public.bi_employees()->'kpis'->>'travellers')::int) = 1, 'employees: approver sees only their team');

select ti.login('30000000-0000-0000-0000-0000000000d1');
select public.location_alias_set('TRICHY', (select id from public.locations where kind = 'airport' and code = 'TRZ'));
select ti.ok((select code from public.locations where id = private.resolve_place('Trichy', false)) = 'TRZ', 'places: travel desk links a spelling once');

select ti.login('30000000-0000-0000-0000-0000000000a1');
create temp table tv as select public.bi_travel() as j;
grant select on tv to authenticated;
select ti.ok((select (j->'kpis'->>'bookings')::int from tv) = (select count(*) from public.travel_records), 'travel: every booking counted');
select ti.ok((select (x->>'visits')::int = 2 and (x->>'departures')::int = 2 from tv, jsonb_array_elements(j->'places') x where x->>'key' = 'HYDERABAD|IN'),
  'travel: Hyderabad = 2 hotel stays + 2 flights out of HYD, in one place');
select ti.ok((select (j->'kpis'->>'international')::int from tv) = 2, 'travel: Monrovia and Singapore trips counted as international');
select ti.ok((select (x->>'lat')::numeric between 6 and 7 from tv, jsonb_array_elements(j->'places') x where x->>'country' = 'LR'),
  'travel: Liberia shown at Roberts International Airport''s real latitude');

create temp table fin as select public.bi_finance('{}', 'quarter') as j;
grant select on fin to authenticated;
select ti.ok((select (j->'kpis'->>'spend')::numeric from fin) = (select (public.bi_overview()->'kpis'->>'spend')::numeric),
  'finance: spend matches the overview');
select ti.ok((select sum((x->>'amount')::numeric) from fin, jsonb_array_elements(j->'charges') x) = (select (j->'kpis'->>'spend')::numeric from fin),
  'finance: fares plus extra charges add up to spend exactly (no double counting)');
select ti.ok((select array_agg(x->>'period' order by x->>'period') from fin, jsonb_array_elements(j->'periods') x) = array['FY 2026-27 Q2', 'FY 2026-27 Q3'],
  'finance: September is Q2 and October is Q3');
select ti.ok((select j->'other_currencies'->0->>'currency' from fin) = 'USD', 'finance: USD listed apart');

create temp table ins as select public.bi_insights() as j;
grant select on ins to authenticated;
select ti.ok((select bool_and(x ? 'basis' and length(x->>'basis') > 20) from ins, jsonb_array_elements(j) x), 'insights: each one states how it was calculated');
select ti.ok((select j @> '[{"id":"missing_cost"},{"id":"unassigned"},{"id":"cancelled"}]' from ins), 'insights: missing costs, unlinked travel and cancellations reported');
select ti.ok((select (x->>'value')::int from ins, jsonb_array_elements(j) x where x->>'id' = 'missing_cost') = 1, 'insights: missing cost count is the real count');
select ti.ok((select jsonb_array_length(public.location_search('SLO')) > 0 and public.location_search('SLO')->0->>'code' = 'SLO'), 'places: search finds a station by code');
reset role;
select ti.ok((select count(*) from public.audit_logs where action = 'location_alias_set') = 1, 'places: linking is audited');

\echo 'ALL TRAVEL INTELLIGENCE TESTS PASSED'
rollback;
