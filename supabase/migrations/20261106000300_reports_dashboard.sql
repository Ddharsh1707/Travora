-- =============================================================================
-- Phase 6: reports, dashboard and live updates
--
-- Every report runs with the CALLER's permissions (security invoker), so Row
-- Level Security decides which trips are counted: an employee's report covers
-- their own trips, an approver's their team, Travel Desk / Admin everyone.
-- There is no separate permission model for reports to get wrong.
-- =============================================================================

-- One row per month / department / mode / currency. The base for the charts.
create view public.report_spend_monthly
with (security_invoker = true) as
select
  date_trunc('month', r.departure_date)::date as month,
  coalesce(p.department, 'Unassigned')         as department,
  r.booking_type,
  r.currency,
  count(*)                                      as trips,
  count(distinct r.employee_id)                 as travellers,
  coalesce(sum(r.amount), 0)::numeric(14, 2)    as spend,
  count(*) filter (where r.amount is null)      as trips_without_cost
from public.travel_records r
join public.profiles p on p.id = r.employee_id
where r.status <> 'cancelled'
group by 1, 2, 3, 4;

-- Routes, by month so the date filter works.
create view public.report_routes_monthly
with (security_invoker = true) as
select
  date_trunc('month', r.departure_date)::date as month,
  initcap(btrim(r.origin))                      as origin,
  initcap(btrim(r.destination))                 as destination,
  r.booking_type,
  coalesce(p.department, 'Unassigned')          as department,
  count(*)                                       as trips,
  coalesce(sum(r.amount), 0)::numeric(14, 2)     as spend
from public.travel_records r
join public.profiles p on p.id = r.employee_id
where r.status <> 'cancelled'
group by 1, 2, 3, 4, 5;

grant select on public.report_spend_monthly, public.report_routes_monthly to authenticated;
revoke all on public.report_spend_monthly, public.report_routes_monthly from anon;

-- ---------------------------------------------------------------------------
-- travel_report: everything the Reports screen shows, for one date range.
-- Filters are plain parameters; nothing is concatenated into SQL.
-- ---------------------------------------------------------------------------
create or replace function public.travel_report(
  p_from date, p_to date, p_department text default null, p_mode text default null
)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_mode public.travel_type;
  v_dept text := nullif(btrim(coalesce(p_department, '')), '');
  v_result jsonb;
begin
  if private.current_app_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a valid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 366 * 5 then
    raise exception 'Choose a range of five years or less' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_mode, '')), '') is not null then
    begin
      v_mode := p_mode::public.travel_type;
    exception when others then
      raise exception 'Unknown travel mode' using errcode = '22023';
    end;
  end if;

  with t as (
    select r.*, coalesce(p.department, 'Unassigned') as department, p.full_name, p.employee_id as employee_code
      from public.travel_records r
      join public.profiles p on p.id = r.employee_id
     where r.status <> 'cancelled'
       and r.departure_date between p_from and p_to
       and (v_dept is null or coalesce(p.department, 'Unassigned') = v_dept)
       and (v_mode is null or r.booking_type = v_mode)
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', (select jsonb_build_object(
        'trips', count(*),
        'travellers', count(distinct employee_id),
        'spend', coalesce(sum(amount), 0),
        'trips_without_cost', count(*) filter (where amount is null),
        'currencies', coalesce(jsonb_agg(distinct currency), '[]'::jsonb),
        'upcoming', count(*) filter (where departure_date > current_date))
      from t),
    'by_month', coalesce((select jsonb_agg(x order by x.month) from (
        select to_char(date_trunc('month', departure_date), 'YYYY-MM') as month,
               count(*) as trips, coalesce(sum(amount), 0) as spend, count(distinct employee_id) as travellers
          from t group by 1) x), '[]'::jsonb),
    'by_department', coalesce((select jsonb_agg(x order by x.spend desc) from (
        select department, count(*) as trips, coalesce(sum(amount), 0) as spend, count(distinct employee_id) as travellers
          from t group by 1) x), '[]'::jsonb),
    'by_mode', coalesce((select jsonb_agg(x order by x.trips desc) from (
        select booking_type as mode, count(*) as trips, coalesce(sum(amount), 0) as spend
          from t group by 1) x), '[]'::jsonb),
    'by_source', coalesce((select jsonb_agg(x order by x.trips desc) from (
        select source, count(*) as trips from t group by 1) x), '[]'::jsonb),
    'top_routes', coalesce((select jsonb_agg(x) from (
        select initcap(btrim(origin)) as origin, initcap(btrim(destination)) as destination,
               count(*) as trips, coalesce(sum(amount), 0) as spend
          from t group by 1, 2 order by count(*) desc, sum(amount) desc nulls last limit 10) x), '[]'::jsonb),
    'top_travellers', coalesce((select jsonb_agg(x) from (
        select employee_id, employee_code, full_name, department, count(*) as trips, coalesce(sum(amount), 0) as spend
          from t group by 1, 2, 3, 4 order by sum(amount) desc nulls last, count(*) desc limit 10) x), '[]'::jsonb),
    'top_providers', coalesce((select jsonb_agg(x) from (
        select coalesce(nullif(btrim(airline_or_provider), ''), 'Unknown') as provider, count(*) as trips, coalesce(sum(amount), 0) as spend
          from t group by 1 order by count(*) desc limit 10) x), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.travel_report(date, date, text, text) from public, anon;
grant execute on function public.travel_report(date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- dashboard_counts: the "what needs my attention" numbers for the home screen.
-- Also security invoker, so each count only covers what the caller can see.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_counts()
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_me uuid := private.current_profile_id();
begin
  if v_me is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'my_upcoming_trips', (select count(*) from public.travel_records
                           where employee_id = v_me and status <> 'cancelled' and departure_date >= current_date),
    'my_next_trip', (select jsonb_build_object('id', id, 'origin', origin, 'destination', destination, 'departure_date', departure_date, 'booking_type', booking_type)
                       from public.travel_records
                      where employee_id = v_me and status <> 'cancelled' and departure_date >= current_date
                      order by departure_date limit 1),
    'my_pending_requests', (select count(*) from public.travel_requests where employee_id = v_me and status = 'pending'),
    'approvals_waiting', (select count(*) from public.travel_requests where approver_id = v_me and status = 'pending'),
    'requests_to_book', case when private.is_staff() then (select count(*) from public.travel_requests where status = 'approved') end,
    'documents_to_review', case when private.is_staff() then (select count(*) from public.documents where extraction_status in ('none', 'extracted', 'failed')) end,
    'bulk_awaiting_review', (select count(*) from public.bulk_bookings where status = 'confirmed' and review_status = 'pending_review'),
    'trips_next_7_days', (select count(*) from public.travel_records
                           where status <> 'cancelled' and departure_date between current_date and current_date + 7)
  );
end;
$$;
revoke all on function public.dashboard_counts() from public, anon;
grant execute on function public.dashboard_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates. Supabase Realtime checks RLS for every change it sends, so a
-- browser is only told about rows its user could read anyway. The app uses
-- the event only as a signal to re-run its (RLS-filtered) queries.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.travel_records, public.travel_requests, public.documents, public.bulk_bookings;
  end if;
end;
$$;

-- Report downloads from the Reports screen are audited like the others.
create or replace function public.record_report_generated(p_report text, p_employee uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_report not in ('employee_travel_history', 'travel_search', 'travel_report') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  if p_employee is not null and not private.can_view_employee(p_employee) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.write_audit('report_generated', 'report', p_report,
    case when p_employee is null then '{}'::jsonb else jsonb_build_object('employee', p_employee) end);
end;
$$;
