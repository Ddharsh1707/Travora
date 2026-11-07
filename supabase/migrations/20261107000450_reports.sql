-- =============================================================================
-- Travel intelligence, part 4: period reports (weekly, monthly, quarterly,
-- financial year) for download as PDF, Excel or CSV.
--
-- Same rules as the other reports: runs with the caller's rights, so approvers
-- get their team only and employees are refused; spend excludes cancelled
-- bookings; missing, shared and zero costs are counted, never treated as 0;
-- only the base currency is summed.
--
-- Additive only. Safe to run more than once.
-- =============================================================================

-- Period key for a travel date.
--   week    -> the Monday that starts the week, "2026-09-07"
--   month   -> "2026-09"
--   quarter -> "FY 2026-27 Q2" (Indian financial year, Q1 = April to June)
--   fy      -> "FY 2026-27"
create or replace function private.report_period(d date, p_grain text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when p_grain = 'week' then to_char(date_trunc('week', d)::date, 'YYYY-MM-DD')
              else private.fin_period(d, p_grain) end
$$;

create or replace function public.bi_report(p_filters jsonb default '{}'::jsonb, p_grain text default 'month')
returns jsonb
language plpgsql stable security invoker
set search_path = ''
set jit = off
as $$
declare
  v_cur text := private.base_currency();
  v_grain text := case when p_grain in ('week', 'month', 'quarter', 'fy') then p_grain else 'month' end;
  v jsonb;
begin
  perform private.bi_require_viewer();
  with t as materialized (
         select *, private.report_period(departure_date, v_grain) as period
           from private.bi_trips(coalesce(p_filters, '{}'::jsonb))),
       b as materialized (select * from t where currency = v_cur),
       costed as (select * from b where cost_state in ('recorded', 'zero') and status <> 'cancelled'),
       dims as (
         select period, 'project' as dimension, coalesce(project_id::text, 'unassigned') as key,
                coalesce(project_name, 'Not linked to a project') as label, employee_id, spend, cost_state, status
           from b
         union all
         select period, 'department', department, department, employee_id, spend, cost_state, status from b
         union all
         select period, 'category', category, category, employee_id, spend, cost_state, status from b
         union all
         select period, 'employee', employee_id::text, full_name || ' (' || employee_code || ')', employee_id, spend, cost_state, status from b
       )
  select jsonb_build_object(
    'base_currency', v_cur,
    'grain', v_grain,
    'viewer_role', private.current_app_role(),
    'generated_at', now(),
    'totals', (select jsonb_build_object(
        'bookings', count(*),
        'travellers', count(distinct employee_id),
        'spend', coalesce(sum(spend) filter (where currency = v_cur), 0),
        'costed', count(*) filter (where currency = v_cur and cost_state in ('recorded', 'zero') and status <> 'cancelled'),
        'missing_cost', count(*) filter (where cost_state = 'missing'),
        'shared_cost', count(*) filter (where cost_state = 'shared'),
        'zero_cost', count(*) filter (where cost_state = 'zero'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'cancelled_cost', coalesce(sum(cancelled_cost) filter (where currency = v_cur), 0),
        'unassigned', count(*) filter (where project_id is null),
        'first_date', min(departure_date),
        'last_date', max(departure_date))
      from t),
    'other_currencies', coalesce((select jsonb_agg(x) from (
        select currency, count(*) as bookings, sum(spend) as spend from t where currency <> v_cur group by 1 order by 1) x), '[]'::jsonb),
    'periods', coalesce((select jsonb_agg(x order by x.period) from (
        select period, min(departure_date) as first_date, max(departure_date) as last_date,
               count(*) as bookings, count(distinct employee_id) as travellers,
               sum(spend) as spend, sum(cancelled_cost) as cancelled_cost,
               count(*) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled') as costed,
               count(*) filter (where cost_state in ('missing', 'shared')) as without_cost,
               count(*) filter (where status = 'cancelled') as cancelled
          from b group by period) x), '[]'::jsonb),
    'breakdown', coalesce((select jsonb_agg(x order by x.dimension, x.period, x.spend desc, x.label) from (
        select dimension, period, key, label, count(*) as bookings, count(distinct employee_id) as travellers,
               sum(spend) as spend, count(*) filter (where cost_state in ('missing', 'shared')) as without_cost
          from dims group by dimension, period, key, label) x), '[]'::jsonb),
    -- Same breakdown over the whole range; travellers are counted once, not per period.
    'dimensions', coalesce((select jsonb_agg(x order by x.dimension, x.spend desc, x.label) from (
        select dimension, key, label, count(*) as bookings, count(distinct employee_id) as travellers,
               sum(spend) as spend, count(*) filter (where cost_state in ('missing', 'shared')) as without_cost,
               count(*) filter (where status = 'cancelled') as cancelled
          from dims group by dimension, key, label) x), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(x) from (
        select upper(btrim(origin)) as origin, upper(btrim(destination)) as destination, count(*) as bookings,
               count(distinct employee_id) as travellers, sum(spend) as spend,
               round(avg(spend) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled'), 0) as avg_cost
          from b where origin is not null and destination is not null
         group by 1, 2 order by count(*) desc, sum(spend) desc limit 25) x), '[]'::jsonb),
    'period_routes', coalesce((select jsonb_agg(x order by x.period, x.rank) from (
        select period, origin, destination, bookings, spend, rank from (
          select period, upper(btrim(origin)) as origin, upper(btrim(destination)) as destination,
                 count(*) as bookings, sum(spend) as spend,
                 row_number() over (partition by period order by count(*) desc, sum(spend) desc, upper(btrim(origin)), upper(btrim(destination))) as rank
            from b where origin is not null and destination is not null group by 1, 2, 3) r
         where rank <= 5) x), '[]'::jsonb),
    'completeness', coalesce((select jsonb_agg(x) from (
        select coalesce(source_sheet, 'Entered in Trapple') as source, category, count(*) as bookings,
               count(*) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled') as with_cost,
               count(*) filter (where cost_state = 'shared') as shared,
               count(*) filter (where cost_state = 'missing') as missing,
               count(*) filter (where status = 'cancelled') as cancelled,
               count(*) filter (where project_id is null) as unassigned
          from t group by 1, 2 order by count(*) desc) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- Downloads are audited by name.
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
                      'project_intelligence', 'project_detail', 'employee_intelligence', 'financial_intelligence',
                      'management_summary', 'period_report', 'project_report', 'employee_report',
                      'travel_report_bi', 'financial_report', 'data_completeness') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  if p_employee is not null and not private.can_view_employee(p_employee) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.write_audit('report_generated', 'report', p_report,
    case when p_employee is null then '{}'::jsonb else jsonb_build_object('employee', p_employee) end);
end;
$$;

revoke all on function public.bi_report(jsonb, text) from public, anon;
grant execute on function public.bi_report(jsonb, text) to authenticated;
grant execute on function private.report_period(date, text) to authenticated;
