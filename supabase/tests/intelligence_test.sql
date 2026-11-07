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

select ti.ok((select count(*) from public.audit_logs where action in ('project_alias_set', 'name_match_decided')) >= 4, 'mappings and people decisions are audited');

\echo 'ALL TRAVEL INTELLIGENCE TESTS PASSED'
rollback;
