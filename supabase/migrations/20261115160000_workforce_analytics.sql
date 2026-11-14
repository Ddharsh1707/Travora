-- =============================================================================
-- Temporary workforce, part 5: travel spend analytics
--
-- Builds on 20261115140000_workforce_manage.sql. Adds one read-only function;
-- no table or row is changed.
--
-- workforce_analytics(filters) returns, for the travel desk, the Travel Desk
-- and the Director:
--  * by kind of worker: people, travellers, trips, cancelled trips, gross,
--    credits, net, missing and zero-fare costs, average net per traveller and
--    average ticket fare;
--  * permanent employees compared with everyone else, and each one's share of
--    total recorded travel spend;
--  * by contractor (people with none: "Unknown") and by project (from the
--    project linked to each trip; none: "Unassigned"), with permanent and
--    non-permanent spend side by side per project;
--  * monthly and quarterly trends;
--  * domestic, international and unclassified travel;
--  * spend in other currencies, listed apart.
--
-- filters: {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "project": uuid|"none",
--           "contractor": uuid|"none"} (travel date; all optional)
--
-- Rules (same as the worker directory, 20261115140000):
--  * Only trips and cost lines on file. Expense claims and anything else
--    (wages included) are not travel spend and are not counted.
--  * Costs come from cost_lines, or the trip's own amount when it has none.
--    Gross = positive amounts, credits = negative ones (refunds), net = both.
--  * Only the company's base currency is added up; other currencies are
--    listed apart, never converted.
--  * A blank cost is missing, never 0. A 0 fare is kept and counted, but left
--    out of the average ticket fare, as are trips with a missing cost.
--  * Cancelled trips are counted apart and left out of spend.
--  * A trip is international when any of its places is outside the company's
--    home country, domestic when every place is known and inside it, and
--    unclassified when a place cannot be found.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function public.workforce_analytics(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_cur text := private.base_currency();
  v_home text := coalesce((select home_country::text from public.companies where id = private.default_company_id()), 'IN');
  v_from date := private.bi_date(f ->> 'from');
  v_to date := private.bi_date(f ->> 'to');
  v jsonb;
begin
  perform private.require_workforce_viewer();

  with money as materialized (
    select m.*, p.workforce_type, p.contractor_id
      from private.trip_money() m
      join public.profiles p on p.id = m.employee_id
     where (v_from is null or m.departure_date >= v_from)
       and (v_to is null or m.departure_date <= v_to)
       and (coalesce(f ->> 'project', '') = ''
            or (f ->> 'project' = 'none' and m.project_id is null)
            or m.project_id = private.try_uuid(f ->> 'project'))
       and (coalesce(f ->> 'contractor', '') = ''
            or (f ->> 'contractor' = 'none' and p.contractor_id is null)
            or p.contractor_id = private.try_uuid(f ->> 'contractor'))
  ),
  -- One row per trip: base-currency money only; other currencies flagged.
  trips as materialized (
    select m.travel_record_id as id, m.employee_id, m.workforce_type, m.contractor_id, m.project_id,
           m.departure_date, m.status, m.booking_type,
           case when m.workforce_type = 'permanent_employee' then 'permanent' else 'non_permanent' end as grp,
           m.status = 'cancelled' as cancelled,
           coalesce(sum(m.gross) filter (where m.currency = v_cur), 0) as gross,
           coalesce(sum(m.credits) filter (where m.currency = v_cur), 0) as credits,
           coalesce(sum(m.missing_lines), 0) as missing,
           coalesce(sum(m.zero_lines), 0) as zeros,
           bool_or(m.currency = v_cur) as in_base,
           coalesce(sum(m.recorded_lines) filter (where m.currency = v_cur), 0) as recorded
      from money m
     group by m.travel_record_id, m.employee_id, m.workforce_type, m.contractor_id, m.project_id,
              m.departure_date, m.status, m.booking_type
  ),
  -- Domestic / international, the same way the Travel Intelligence page does it.
  stops as materialized (
    select t.id, t.booking_type, s.seq, s.label
      from trips t
      join public.travel_records r on r.id = t.id
      cross join lateral private.trip_stops(r.origin, r.destination) s
  ),
  labels as materialized (
    select d.label, d.air, private.resolve_place(d.label, d.air) as location_id
      from (select distinct label, booking_type = 'flight' as air from stops) d
  ),
  flags as materialized (
    select s.id,
           bool_or(lb.location_id is null) as unmapped,
           bool_or(pl.country is not null and pl.country <> v_home) as international
      from stops s
      join labels lb on lb.label = s.label and lb.air = (s.booking_type = 'flight')
      left join lateral (select x.country from private.place_of(lb.location_id) x) pl on lb.location_id is not null
     group by s.id
  ),
  t as materialized (
    select tr.*,
           tr.gross + tr.credits as net,
           case when coalesce(fl.international, false) then 'international'
                when fl.id is not null and not fl.unmapped then 'domestic'
                else 'unclassified' end as region,
           -- Counted in the average ticket fare: a base-currency cost, nothing missing, not a zero fare.
           (not tr.cancelled and tr.in_base and tr.missing = 0 and tr.gross + tr.credits > 0) as fare_counted
      from trips tr
      left join flags fl on fl.id = tr.id
  ),
  totals as (
    select coalesce(sum(net) filter (where not cancelled), 0) as net from t
  )
  select jsonb_build_object(
    'base_currency', v_cur,
    'home_country', v_home,
    'filters', jsonb_strip_nulls(jsonb_build_object('from', v_from, 'to', v_to, 'project', f ->> 'project', 'contractor', f ->> 'contractor')),

    'by_type', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'workforce_type', k.workforce_type,
               'people', k.people,
               'travellers', coalesce(s.travellers, 0),
               'trips', coalesce(s.trips, 0),
               'cancelled_trips', coalesce(s.cancelled_trips, 0),
               'gross', coalesce(s.gross, 0), 'credits', coalesce(s.credits, 0), 'net', coalesce(s.net, 0),
               'missing_cost_lines', coalesce(s.missing, 0), 'zero_fare_lines', coalesce(s.zeros, 0),
               'avg_net_per_traveller', case when coalesce(s.travellers, 0) > 0 then round(s.net / s.travellers, 2) end,
               'avg_ticket_fare', s.avg_fare, 'fares_averaged', coalesce(s.fares, 0))
             order by case k.workforce_type when 'permanent_employee' then 1 when 'temporary_worker' then 2
                       when 'contract_worker' then 3 when 'outsourced_worker' then 4 else 5 end), '[]'::jsonb)
        from (select p.workforce_type, count(*) as people
                from public.profiles p where p.merged_into is null group by p.workforce_type) k
        left join (
          select workforce_type,
                 count(distinct employee_id) filter (where not cancelled) as travellers,
                 count(*) filter (where not cancelled) as trips,
                 count(*) filter (where cancelled) as cancelled_trips,
                 sum(gross) filter (where not cancelled) as gross,
                 sum(credits) filter (where not cancelled) as credits,
                 sum(net) filter (where not cancelled) as net,
                 sum(missing) filter (where not cancelled) as missing,
                 sum(zeros) filter (where not cancelled) as zeros,
                 count(*) filter (where fare_counted) as fares,
                 round(avg(net) filter (where fare_counted), 2) as avg_fare
            from t group by workforce_type) s on s.workforce_type = k.workforce_type),

    'comparison', (
      select jsonb_agg(jsonb_build_object(
               'group', g.grp,
               'travellers', coalesce(c.travellers, 0), 'trips', coalesce(c.trips, 0),
               'gross', coalesce(c.gross, 0), 'credits', coalesce(c.credits, 0), 'net', coalesce(c.net, 0),
               'share_pct', case when (select net from totals) > 0 then round(100 * coalesce(c.net, 0) / (select net from totals), 1) end,
               'avg_ticket_fare', c.avg_fare)
             order by g.grp desc)
        from (values ('permanent'), ('non_permanent')) g(grp)
        left join (
          select grp, count(distinct employee_id) filter (where not cancelled) as travellers,
                 count(*) filter (where not cancelled) as trips,
                 sum(gross) filter (where not cancelled) as gross,
                 sum(credits) filter (where not cancelled) as credits,
                 sum(net) filter (where not cancelled) as net,
                 round(avg(net) filter (where fare_counted), 2) as avg_fare
            from t group by grp) c on c.grp = g.grp),

    'contractors', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'contractor_id', x.contractor_id, 'name', coalesce(c.name, 'Unknown'),
               'workers', x.workers, 'travellers', x.travellers, 'trips', x.trips,
               'gross', x.gross, 'credits', x.credits, 'net', x.net, 'missing_cost_lines', x.missing)
             order by x.net desc, coalesce(c.name, 'Unknown')), '[]'::jsonb)
        from (
          select t.contractor_id,
                 (select count(*) from public.profiles p
                   where p.merged_into is null and p.workforce_type <> 'permanent_employee'
                     and p.contractor_id is not distinct from t.contractor_id) as workers,
                 count(distinct t.employee_id) filter (where not t.cancelled) as travellers,
                 count(*) filter (where not t.cancelled) as trips,
                 coalesce(sum(t.gross) filter (where not t.cancelled), 0) as gross,
                 coalesce(sum(t.credits) filter (where not t.cancelled), 0) as credits,
                 coalesce(sum(t.net) filter (where not t.cancelled), 0) as net,
                 coalesce(sum(t.missing) filter (where not t.cancelled), 0) as missing
            from t where t.grp = 'non_permanent'
           group by t.contractor_id) x
        left join public.contractors c on c.id = x.contractor_id),

    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'project_id', x.project_id, 'name', coalesce(pj.name, 'Unassigned'),
               'non_permanent_workers', x.np_workers, 'non_permanent_trips', x.np_trips, 'non_permanent_net', x.np_net,
               'permanent_travellers', x.p_workers, 'permanent_trips', x.p_trips, 'permanent_net', x.p_net,
               'non_permanent_share_pct', case when x.np_net + x.p_net > 0 then round(100 * x.np_net / (x.np_net + x.p_net), 1) end)
             order by x.np_net desc, coalesce(pj.name, 'Unassigned')), '[]'::jsonb)
        from (
          select t.project_id,
                 count(distinct t.employee_id) filter (where not t.cancelled and t.grp = 'non_permanent') as np_workers,
                 count(*) filter (where not t.cancelled and t.grp = 'non_permanent') as np_trips,
                 coalesce(sum(t.net) filter (where not t.cancelled and t.grp = 'non_permanent'), 0) as np_net,
                 count(distinct t.employee_id) filter (where not t.cancelled and t.grp = 'permanent') as p_workers,
                 count(*) filter (where not t.cancelled and t.grp = 'permanent') as p_trips,
                 coalesce(sum(t.net) filter (where not t.cancelled and t.grp = 'permanent'), 0) as p_net
            from t group by t.project_id) x
        left join public.projects pj on pj.id = x.project_id
       where x.np_trips > 0),

    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', to_char(x.m, 'YYYY-MM'),
               'permanent_net', x.p_net, 'permanent_trips', x.p_trips,
               'non_permanent_net', x.np_net, 'non_permanent_trips', x.np_trips, 'non_permanent_travellers', x.np_people)
             order by x.m), '[]'::jsonb)
        from (
          select date_trunc('month', t.departure_date)::date as m,
                 coalesce(sum(t.net) filter (where not t.cancelled and t.grp = 'permanent'), 0) as p_net,
                 count(*) filter (where not t.cancelled and t.grp = 'permanent') as p_trips,
                 coalesce(sum(t.net) filter (where not t.cancelled and t.grp = 'non_permanent'), 0) as np_net,
                 count(*) filter (where not t.cancelled and t.grp = 'non_permanent') as np_trips,
                 count(distinct t.employee_id) filter (where not t.cancelled and t.grp = 'non_permanent') as np_people
            from t group by 1) x),

    'quarterly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'quarter', to_char(x.q, 'YYYY') || '-Q' || to_char(x.q, 'Q'),
               'permanent_net', x.p_net, 'non_permanent_net', x.np_net,
               'permanent_trips', x.p_trips, 'non_permanent_trips', x.np_trips)
             order by x.q), '[]'::jsonb)
        from (
          select date_trunc('quarter', t.departure_date)::date as q,
                 coalesce(sum(t.net) filter (where not t.cancelled and t.grp = 'permanent'), 0) as p_net,
                 coalesce(sum(t.net) filter (where not t.cancelled and t.grp = 'non_permanent'), 0) as np_net,
                 count(*) filter (where not t.cancelled and t.grp = 'permanent') as p_trips,
                 count(*) filter (where not t.cancelled and t.grp = 'non_permanent') as np_trips
            from t group by 1) x),

    'regions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'group', x.grp, 'region', x.region, 'trips', x.trips, 'net', x.net)
             order by x.grp desc, x.region), '[]'::jsonb)
        from (
          select t.grp, t.region,
                 count(*) filter (where not t.cancelled) as trips,
                 coalesce(sum(t.net) filter (where not t.cancelled), 0) as net
            from t group by t.grp, t.region) x),

    'other_currencies', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'currency', x.currency, 'group', x.grp, 'trips', x.trips, 'net', x.net)
             order by x.currency, x.grp desc), '[]'::jsonb)
        from (
          select m.currency,
                 case when m.workforce_type = 'permanent_employee' then 'permanent' else 'non_permanent' end as grp,
                 count(distinct m.travel_record_id) as trips,
                 sum(m.gross + m.credits) as net
            from money m
           where m.currency <> v_cur and m.status <> 'cancelled'
           group by 1, 2) x),

    'quality', (
      select jsonb_build_object(
               'trips', count(*) filter (where not cancelled),
               'cancelled_trips', count(*) filter (where cancelled),
               'missing_cost_lines', coalesce(sum(missing) filter (where not cancelled), 0),
               'zero_fare_lines', coalesce(sum(zeros) filter (where not cancelled), 0),
               'unclassified_trips', count(*) filter (where not cancelled and region = 'unclassified'),
               'unassigned_project_trips', count(*) filter (where not cancelled and project_id is null and grp = 'non_permanent'),
               'unknown_type_people', (select count(*) from public.profiles p where p.merged_into is null and p.workforce_type = 'unknown'))
        from t)
  ) into v;

  return v;
end;
$$;

revoke all on function public.workforce_analytics(jsonb) from public, anon;
grant execute on function public.workforce_analytics(jsonb) to authenticated;
