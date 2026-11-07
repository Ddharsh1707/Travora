-- =============================================================================
-- Travel intelligence, part 2: management overview and Project Intelligence
--
-- All reporting functions run with the CALLER's rights (security invoker), so
-- the existing row-level security decides what each person sees:
--   travel desk and CEO: the whole company
--   approvers: only the employees they manage or approve for
--   employees: refused (they keep their own history pages)
-- Nothing here writes data except trip_assign_project (CEO only, audited).
--
-- Money rules (the same everywhere):
--   booking cost   = travel_records.amount (the sum of its recorded cost lines)
--   spend          = booking cost of bookings that are not cancelled
--   cancelled cost = cost recorded on cancelled bookings (refund not recorded);
--                    reported on its own, never inside spend
--   missing / shared / zero cost are counted, never treated as 0 spend
--   only the company's base currency is summed; other currencies are listed
--   separately and never added in
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One filtered list of bookings that every report starts from
-- p: {"from","to","project" (uuid or "unassigned"),"employee","department",
--     "destination","category"}; unknown or malformed values are ignored.
-- ---------------------------------------------------------------------------
create or replace function private.bi_date(v text)
returns date
language plpgsql immutable
set search_path = ''
as $$
begin
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return v::date;
exception when others then
  return null;
end;
$$;

drop function if exists private.bi_trips(jsonb);
create or replace function private.bi_trips(p jsonb)
returns table (
  id uuid, employee_id uuid, full_name text, employee_code text, department text,
  departure_date date, return_date date, origin text, destination text, route text, category text,
  provider text, booking_reference text, status text,
  project_id uuid, project_name text, project_kind text, project_raw text, purpose text,
  currency text, amount numeric, cost_state text, spend numeric, cancelled_cost numeric,
  source_sheet text, import_batch_id uuid
)
language sql stable security invoker
set search_path = ''
as $$
  select r.id, r.employee_id, pr.full_name, pr.employee_id, coalesce(nullif(btrim(pr.department), ''), 'Not recorded'),
         r.departure_date, r.return_date, r.origin, r.destination, r.route, r.booking_type::text,
         nullif(btrim(r.airline_or_provider), ''), r.booking_reference, r.status,
         r.project_id, pj.name, pj.kind, r.project_raw, r.purpose,
         r.currency::text, r.amount,
         case
           when r.amount is null then
             case when exists (select 1 from public.cost_lines c
                                where c.travel_record_id = r.id and c.amount_state = 'included_in_group')
                  then 'shared' else 'missing' end
           when r.amount = 0 then 'zero'
           else 'recorded'
         end,
         case when r.status = 'cancelled' then 0 else coalesce(r.amount, 0) end,
         case when r.status = 'cancelled' then coalesce(r.amount, 0) else 0 end,
         r.source_sheet, r.import_batch_id
    from public.travel_records r
    join public.profiles pr on pr.id = r.employee_id
    left join public.projects pj on pj.id = r.project_id
   where (private.bi_date(p ->> 'from') is null or r.departure_date >= private.bi_date(p ->> 'from'))
     and (private.bi_date(p ->> 'to') is null or r.departure_date <= private.bi_date(p ->> 'to'))
     and (coalesce(p ->> 'project', '') = ''
          or (p ->> 'project' = 'unassigned' and r.project_id is null)
          or r.project_id = private.try_uuid(p ->> 'project'))
     and (private.try_uuid(p ->> 'employee') is null or r.employee_id = private.try_uuid(p ->> 'employee'))
     and (coalesce(p ->> 'department', '') = ''
          or coalesce(nullif(btrim(pr.department), ''), 'Not recorded') = p ->> 'department')
     and (coalesce(p ->> 'destination', '') = '' or upper(btrim(r.destination)) = upper(btrim(p ->> 'destination')))
     and (coalesce(p ->> 'category', '') = '' or r.booking_type::text = p ->> 'category')
$$;

create or replace function private.bi_require_viewer()
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if not private.has_role('travel_desk', 'admin', 'approver') then
    raise exception 'Business Intelligence is for the travel desk, approvers and the CEO' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.base_currency()
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select c.base_currency::text from public.companies c where c.id = private.default_company_id()), 'INR')
$$;

-- ---------------------------------------------------------------------------
-- Filter choices (only what the caller is allowed to see)
-- ---------------------------------------------------------------------------
create or replace function public.bi_filter_options()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  perform private.bi_require_viewer();
  return jsonb_build_object(
    'base_currency', private.base_currency(),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind) order by name)
                            from public.projects), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(d order by d) from (select distinct department as d from private.bi_trips('{}'::jsonb)) x), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e, 'name', n, 'code', c) order by n)
                             from (select distinct employee_id as e, full_name as n, employee_code as c from private.bi_trips('{}'::jsonb)) x), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(d order by n desc, d) from (
                               select upper(btrim(destination)) as d, count(*) as n from private.bi_trips('{}'::jsonb)
                                group by 1 order by 2 desc limit 300) x), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(c order by c) from (select distinct category as c from private.bi_trips('{}'::jsonb)) x), '[]'::jsonb),
    'first_date', (select min(departure_date) from private.bi_trips('{}'::jsonb)),
    'last_date', (select max(departure_date) from private.bi_trips('{}'::jsonb))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Management overview
-- ---------------------------------------------------------------------------
create or replace function public.bi_overview(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_cur text := private.base_currency();
  v jsonb;
begin
  perform private.bi_require_viewer();
  with t as (select * from private.bi_trips(coalesce(p_filters, '{}'::jsonb))),
       b as (select * from t where currency = v_cur)
  select jsonb_build_object(
    'base_currency', v_cur,
    'kpis', (select jsonb_build_object(
        'bookings', count(*),
        'travellers', count(distinct employee_id),
        'spend', coalesce(sum(spend) filter (where currency = v_cur), 0),
        'costed_bookings', count(*) filter (where currency = v_cur and cost_state in ('recorded', 'zero') and status <> 'cancelled'),
        'missing_cost', count(*) filter (where cost_state = 'missing'),
        'shared_cost', count(*) filter (where cost_state = 'shared'),
        'zero_cost', count(*) filter (where cost_state = 'zero'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'cancelled_cost', coalesce(sum(cancelled_cost) filter (where currency = v_cur), 0),
        'no_show', count(*) filter (where status = 'no_show'),
        'projects_with_travel', count(distinct project_id),
        'unassigned_bookings', count(*) filter (where project_id is null),
        'first_date', min(departure_date),
        'last_date', max(departure_date))
      from t),
    'active_projects', (select count(*) from public.projects where status = 'active'),
    'other_currencies', coalesce((select jsonb_agg(x) from (
        select currency, count(*) as bookings, sum(spend) as spend from t where currency <> v_cur group by 1 order by 1) x), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(x order by x.month) from (
        select to_char(date_trunc('month', departure_date), 'YYYY-MM') as month,
               count(*) as bookings, sum(spend) as spend, count(distinct employee_id) as travellers
          from b group by 1) x), '[]'::jsonb),
    'top_projects', coalesce((select jsonb_agg(x) from (
        select project_id, coalesce(project_name, 'Unassigned') as name, project_kind as kind,
               count(*) as bookings, count(distinct employee_id) as travellers, sum(spend) as spend
          from b group by 1, 2, 3 order by sum(spend) desc, count(*) desc limit 8) x), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(x) from (
        select department, count(*) as bookings, count(distinct employee_id) as travellers, sum(spend) as spend
          from b group by 1 order by sum(spend) desc limit 12) x), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(x) from (
        select upper(btrim(destination)) as destination, count(*) as bookings, count(distinct employee_id) as travellers, sum(spend) as spend
          from b where destination is not null and destination <> 'Not recorded'
         group by 1 order by count(*) desc, sum(spend) desc limit 10) x), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(x) from (
        select category, count(*) as bookings, sum(spend) as spend from b group by 1 order by sum(spend) desc) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x) from (
        select id, employee_id, full_name, departure_date, origin, destination, category, project_name, project_raw,
               amount, currency, cost_state, status
          from t where departure_date <= current_date
         order by departure_date desc, full_name limit 12) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Project Intelligence: all projects
-- ---------------------------------------------------------------------------
create or replace function public.bi_projects(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_cur text := private.base_currency();
  v jsonb;
begin
  perform private.bi_require_viewer();
  with t as (select * from private.bi_trips(coalesce(p_filters, '{}'::jsonb) - 'project')),
       b as (select * from t where currency = v_cur),
       per as (
         select project_id, count(*) as bookings, count(distinct employee_id) as travellers, sum(spend) as spend,
                count(*) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled') as costed,
                count(*) filter (where cost_state in ('missing', 'shared')) as without_cost,
                min(departure_date) as first_date, max(departure_date) as last_date
           from b group by 1),
       months as (
         select project_id, jsonb_agg(jsonb_build_object('month', m, 'spend', s) order by m) as monthly
           from (select project_id, to_char(date_trunc('month', departure_date), 'YYYY-MM') as m, sum(spend) as s
                   from b group by 1, 2) x group by 1)
  select jsonb_build_object(
    'base_currency', v_cur,
    'status_counts', (select jsonb_build_object(
        'total', count(*) filter (where kind = 'project'),
        'active', count(*) filter (where kind = 'project' and status = 'active'),
        'completed', count(*) filter (where kind = 'project' and status = 'completed'),
        'on_hold', count(*) filter (where kind = 'project' and status = 'on_hold'),
        'unknown', count(*) filter (where kind = 'project' and status = 'unknown'),
        'cost_centres', count(*) filter (where kind = 'cost_centre'),
        'events', count(*) filter (where kind = 'event'),
        'other', count(*) filter (where kind = 'other'))
      from public.projects),
    'travellers_on_projects', (select count(distinct employee_id) from t where project_id is not null),
    'projects', coalesce((select jsonb_agg(x order by x.spend desc nulls last, x.name) from (
        select pj.id as project_id, pj.name, pj.code, pj.kind, pj.status, pj.client, pj.site, pj.country,
               pj.start_date, pj.end_date,
               coalesce(per.bookings, 0) as bookings, coalesce(per.travellers, 0) as travellers,
               coalesce(per.spend, 0) as spend,
               case when per.costed > 0 then round(per.spend / per.costed, 2) end as avg_per_booking,
               coalesce(per.without_cost, 0) as without_cost,
               per.first_date, per.last_date, coalesce(m.monthly, '[]'::jsonb) as monthly
          from public.projects pj
          left join per on per.project_id = pj.id
          left join months m on m.project_id = pj.id) x), '[]'::jsonb),
    'unassigned', (select jsonb_build_object(
        'bookings', coalesce(per.bookings, 0), 'travellers', coalesce(per.travellers, 0), 'spend', coalesce(per.spend, 0),
        'avg_per_booking', case when per.costed > 0 then round(per.spend / per.costed, 2) end,
        'without_cost', coalesce(per.without_cost, 0), 'first_date', per.first_date, 'last_date', per.last_date,
        'monthly', coalesce((select monthly from months where project_id is null), '[]'::jsonb),
        'names', coalesce((select jsonb_agg(x) from (
            select coalesce(project_raw, '(no project in the sheet)') as project_raw, count(*) as bookings, sum(spend) as spend
              from b where project_id is null group by 1 order by count(*) desc limit 50) x), '[]'::jsonb))
      from (select 1) one left join per on per.project_id is null),
    'months', coalesce((select jsonb_agg(distinct to_char(date_trunc('month', departure_date), 'YYYY-MM')) from b), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Project Intelligence: one project (p_project null = unassigned bookings)
-- ---------------------------------------------------------------------------
create or replace function public.bi_project_detail(p_project uuid, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_cur text := private.base_currency();
  v_p public.projects;
  v jsonb;
  v_f jsonb := coalesce(p_filters, '{}'::jsonb) - 'project'
               || jsonb_build_object('project', coalesce(p_project::text, 'unassigned'));
begin
  perform private.bi_require_viewer();
  if p_project is not null then
    select * into v_p from public.projects where id = p_project;
    if not found then
      raise exception 'Project not found' using errcode = 'P0002';
    end if;
  end if;

  with t as (select * from private.bi_trips(v_f)),
       b as (select * from t where currency = v_cur)
  select jsonb_build_object(
    'base_currency', v_cur,
    'project', case when p_project is null then null else to_jsonb(v_p) end,
    'aliases', coalesce((select jsonb_agg(label order by label) from public.project_aliases where project_id = p_project), '[]'::jsonb),
    'kpis', (select jsonb_build_object(
        'bookings', count(*), 'travellers', count(distinct employee_id),
        'spend', coalesce(sum(spend) filter (where currency = v_cur), 0),
        'costed_bookings', count(*) filter (where currency = v_cur and cost_state in ('recorded', 'zero') and status <> 'cancelled'),
        'missing_cost', count(*) filter (where cost_state = 'missing'),
        'shared_cost', count(*) filter (where cost_state = 'shared'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'cancelled_cost', coalesce(sum(cancelled_cost) filter (where currency = v_cur), 0),
        'first_date', min(departure_date), 'last_date', max(departure_date),
        'places', count(distinct upper(btrim(destination))))
      from t),
    'other_currencies', coalesce((select jsonb_agg(x) from (
        select currency, count(*) as bookings, sum(spend) as spend from t where currency <> v_cur group by 1) x), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(x) from (
        select employee_id, full_name, employee_code, department, count(*) as bookings,
               coalesce(sum(spend) filter (where currency = v_cur), 0) as spend,
               count(*) filter (where cost_state in ('missing', 'shared')) as without_cost,
               min(departure_date) as first_date, max(departure_date) as last_date
          from t group by 1, 2, 3, 4 order by 6 desc, 5 desc) x), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(x order by x.month) from (
        select to_char(date_trunc('month', departure_date), 'YYYY-MM') as month, count(*) as bookings, sum(spend) as spend,
               count(distinct employee_id) as travellers
          from b group by 1) x), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(x) from (
        select upper(btrim(origin)) as origin, upper(btrim(destination)) as destination, count(*) as bookings, sum(spend) as spend
          from b where origin is not null group by 1, 2 order by count(*) desc, sum(spend) desc limit 15) x), '[]'::jsonb),
    'destinations', coalesce((select jsonb_agg(x) from (
        select upper(btrim(destination)) as destination, count(*) as bookings, sum(spend) as spend
          from b group by 1 order by count(*) desc, sum(spend) desc limit 15) x), '[]'::jsonb),
    'providers', coalesce((select jsonb_agg(x) from (
        select coalesce(provider, 'Not recorded') as provider, category, count(*) as bookings, sum(spend) as spend
          from b group by 1, 2 order by sum(spend) desc, count(*) desc limit 15) x), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(x) from (
        select category, count(*) as bookings, sum(spend) as spend from b group by 1 order by sum(spend) desc) x), '[]'::jsonb),
    'purposes', coalesce((select jsonb_agg(x) from (
        select coalesce(nullif(initcap(btrim(purpose)), ''), 'Not recorded') as purpose, count(*) as bookings, sum(spend) as spend
          from b group by 1 order by count(*) desc limit 10) x), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(x order by x.departure_date desc, x.full_name) from (
        select t.id, t.employee_id, t.full_name, t.employee_code, t.departure_date, t.return_date, t.origin, t.destination,
               t.route, t.category, t.provider, t.booking_reference, t.status, t.project_raw, t.purpose, t.amount, t.currency,
               t.cost_state, t.source_sheet,
               (select count(*) from public.cost_lines c where c.travel_record_id = t.id) as cost_lines
          from t order by t.departure_date desc limit 2000) x), '[]'::jsonb),
    'ledger_total', (select count(*) from t)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual project assignment for a trip whose sheet had no usable project.
-- CEO only. p_project null removes a manual assignment.
-- ---------------------------------------------------------------------------
create or replace function public.trip_assign_project(p_trip uuid, p_project uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  if not private.has_role('admin') then
    raise exception 'Only the CEO can assign trips to projects' using errcode = '42501';
  end if;
  select project_id into v_old from public.travel_records where id = p_trip for update;
  if not found then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  update public.travel_records
     set project_id = p_project,
         project_source = case when p_project is null then null else 'manual' end
   where id = p_trip;
  perform private.write_audit('trip_project_assigned', 'travel_records', p_trip::text,
    jsonb_build_object('from', v_old, 'to', p_project));
end;
$$;

-- ---------------------------------------------------------------------------
-- Downloads are audited: accept the new report names (and upload_report,
-- which the upload screen already sends)
-- ---------------------------------------------------------------------------
create or replace function public.record_report_generated(p_report text, p_employee uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_report not in ('employee_travel_history', 'travel_search', 'travel_report', 'upload_report',
                      'project_intelligence', 'project_detail') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  if p_employee is not null and not private.can_view_employee(p_employee) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.write_audit('report_generated', 'report', p_report,
    case when p_employee is null then '{}'::jsonb else jsonb_build_object('employee', p_employee) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.bi_filter_options() from public, anon;
grant execute on function public.bi_filter_options() to authenticated;
revoke all on function public.bi_overview(jsonb) from public, anon;
grant execute on function public.bi_overview(jsonb) to authenticated;
revoke all on function public.bi_projects(jsonb) from public, anon;
grant execute on function public.bi_projects(jsonb) to authenticated;
revoke all on function public.bi_project_detail(uuid, jsonb) from public, anon;
grant execute on function public.bi_project_detail(uuid, jsonb) to authenticated;
revoke all on function public.trip_assign_project(uuid, uuid) from public, anon;
grant execute on function public.trip_assign_project(uuid, uuid) to authenticated;
revoke all on function private.bi_trips(jsonb) from public, anon;
grant execute on function private.bi_trips(jsonb) to authenticated;
revoke all on function private.bi_require_viewer() from public, anon;
grant execute on function private.bi_require_viewer() to authenticated;
grant execute on function private.bi_date(text) to authenticated;
grant execute on function private.base_currency() to authenticated;
