-- =============================================================================
-- Travel intelligence, part 3: places on a map, Travel / Employee / Financial
-- Intelligence, and calculated insights.
--
-- Places: public.locations holds real coordinates copied from public datasets
-- (airports: OurAirports; Indian railway stations: datameet/railways; Indian
-- towns: GeoNames), loaded by the 000410-000430 files. A place written in a
-- sheet is put on the map only when it matches one of those exactly:
--   1. a spelling the travel desk linked by hand (location_aliases)
--   2. a 3-letter airport code (HYD), on flight lines only
--   3. a station code in brackets: "SAMALKOT JN (SLO)"
--   4. a town or city name that is unique in India
--   5. a railway station name that is unique
-- Anything else is listed as "not on the map". Nothing is guessed.
--
-- Reporting functions run with the caller's rights (security invoker), so row
-- level security decides what each person sees, as in part 2. Money rules are
-- the same as part 2 (see 20261107000300).
--
-- Additive only. Safe to run more than once.
-- =============================================================================

-- The company's home country, used only to split domestic and international
-- travel. One company today (Mahathi Infra Services, India).
alter table public.companies add column if not exists home_country char(2) not null default 'IN'
  check (home_country ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------
-- Reference places (shared, read-only for users)
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('airport', 'station', 'city')),
  code        text check (code is null or code ~ '^[A-Z0-9]{1,6}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  name_key    text not null check (char_length(name_key) between 1 and 200),
  city        text check (city is null or char_length(city) <= 200),
  region      text check (region is null or char_length(region) <= 120),
  country     char(2) not null check (country ~ '^[A-Z]{2}$'),
  lat         numeric(9, 6) not null check (lat between -90 and 90),
  lng         numeric(9, 6) not null check (lng between -180 and 180),
  source      text not null check (source in ('ourairports', 'datameet_railways', 'geonames')),
  source_ref  text check (source_ref is null or char_length(source_ref) <= 64)
);
create unique index if not exists locations_code_uidx on public.locations (kind, code) where code is not null;
create unique index if not exists locations_point_uidx on public.locations (kind, name_key, lat, lng) where code is null;
create index if not exists locations_name_idx on public.locations (name_key);
create index if not exists locations_city_idx on public.locations (upper(city));

alter table public.locations enable row level security;
drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations for select to authenticated using (true);
revoke insert, update, delete on public.locations from authenticated, anon;
grant select on public.locations to authenticated;

-- Sheet spellings the travel desk linked to a place by hand ("TRICHY")
create table if not exists public.location_aliases (
  id           bigint generated always as identity primary key,
  company_id   uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  alias_key    text not null check (char_length(alias_key) between 1 and 200),
  label        text not null check (char_length(label) between 1 and 200),
  location_id  bigint not null references public.locations (id) on delete cascade,
  mapped_by    uuid references auth.users (id) on delete set null default auth.uid(),
  mapped_at    timestamptz not null default now(),
  unique (company_id, alias_key)
);
alter table public.location_aliases enable row level security;
drop policy if exists location_aliases_read on public.location_aliases;
create policy location_aliases_read on public.location_aliases for select to authenticated
  using (company_id = private.default_company_id() and private.has_role('travel_desk', 'admin', 'approver'));
revoke insert, update, delete on public.location_aliases from authenticated, anon;
grant select on public.location_aliases to authenticated;

-- ---------------------------------------------------------------------------
-- Matching a sheet's place to a real location
-- ---------------------------------------------------------------------------
create or replace function private.place_key(v text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(upper(coalesce(v, '')), '[^A-Z0-9]+', ' ', 'g')), '')
$$;

create or replace function private.resolve_place(p text, p_air boolean default true)
returns bigint
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_key text := private.place_key(p);
  v_id bigint;
  v_code text;
begin
  if v_key is null then return null; end if;
  select a.location_id into v_id from public.location_aliases a
   where a.company_id = private.default_company_id() and a.alias_key = v_key;
  if found then return v_id; end if;
  -- airport codes only for flights: on a hotel or cab line "GOA" is not Genoa
  if p_air and btrim(p) ~* '^[A-Z]{3}$' then
    select id into v_id from public.locations where kind = 'airport' and code = upper(btrim(p));
    return v_id;
  end if;
  v_code := upper(substring(p from '\(\s*([A-Za-z0-9]{1,6})\s*\)\s*$'));
  if v_code is not null then
    select id into v_id from public.locations where kind = 'station' and code = v_code;
    if found then return v_id; end if;
  end if;
  select min(id) into v_id from public.locations where kind = 'city' and name_key = v_key having count(*) = 1;
  if v_id is not null then return v_id; end if;
  select min(id) into v_id from public.locations where kind = 'station' and name_key = v_key having count(*) = 1;
  return v_id;
end;
$$;

-- The stops of one booking, in order. "DEL -VTZ" (codes joined by dashes)
-- is read as a connection through DEL; any other text is one stop.
create or replace function private.trip_stops(p_origin text, p_destination text)
returns table (seq integer, label text, role text)
language sql immutable
set search_path = ''
as $$
  with parts as (
    select 1 as part, x.label, x.n
      from unnest(case when p_origin ~ '^\s*[A-Za-z]{3}(\s*-\s*[A-Za-z]{3})+\s*$'
                       then regexp_split_to_array(btrim(p_origin), '\s*-\s*')
                       else array[nullif(btrim(p_origin), '')] end) with ordinality as x(label, n)
    union all
    select 2, x.label, x.n
      from unnest(case when p_destination ~ '^\s*[A-Za-z]{3}(\s*-\s*[A-Za-z]{3})+\s*$'
                       then regexp_split_to_array(btrim(p_destination), '\s*-\s*')
                       else array[nullif(btrim(p_destination), '')] end) with ordinality as x(label, n)
  ),
  ordered as (
    select row_number() over (order by part, n)::integer as seq, label, part
      from parts where label is not null
  )
  select seq, label,
         case when seq = (select max(seq) from ordered) and part = 2 then 'destination'
              when seq = 1 and part = 1 then 'origin'
              else 'via' end
    from ordered
$$;

-- A place as people talk about it: the city for an airport or a town, the
-- station name for a station. Coordinates are those of the town when the
-- town itself is a known location, otherwise of the airport or station.
create or replace function private.place_of(p_location bigint)
returns table (place_key text, place_name text, country text, lat numeric, lng numeric, kind text, code text)
language sql stable security definer
set search_path = ''
as $$
  with l as (select * from public.locations where id = p_location),
       n as (select case when l.kind = 'airport' then coalesce(nullif(l.city, ''), l.name)
                         when l.kind = 'station' then initcap(l.name)
                         else l.name end as pname, l.* from l),
       town as (select c.lat, c.lng from public.locations c, n
                 where n.kind = 'airport' and c.kind = 'city' and c.country = n.country
                   and c.name_key = private.place_key(n.pname)
                 order by c.id limit 1)
  select private.place_key(n.pname) || '|' || n.country, n.pname, n.country::text,
         coalesce((select lat from town), n.lat), coalesce((select lng from town), n.lng), n.kind, n.code
    from n
$$;

-- ---------------------------------------------------------------------------
-- Staff tools: find a place, link a sheet spelling to it
-- ---------------------------------------------------------------------------
create or replace function public.location_search(p_query text)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select l.id, l.kind, l.code, l.name, l.city, l.region, l.country, l.lat, l.lng, l.source
      from public.locations l
     where private.place_key(p_query) is not null
       and (l.code = upper(btrim(p_query))
            or l.name_key like private.place_key(p_query) || '%'
            or upper(l.city) like upper(btrim(p_query)) || '%')
     order by (l.code = upper(btrim(p_query))) desc nulls last, (l.name_key = private.place_key(p_query)) desc,
              case l.kind when 'city' then 0 when 'airport' then 1 else 2 end, l.name
     limit 25) x
$$;

create or replace function public.location_alias_set(p_label text, p_location bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_key text := private.place_key(p_label);
  v_company uuid := private.default_company_id();
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_key is null then
    raise exception 'Place name is empty' using errcode = '22023';
  end if;
  if p_location is null then
    delete from public.location_aliases where company_id = v_company and alias_key = v_key;
  else
    if not exists (select 1 from public.locations where id = p_location) then
      raise exception 'Place not found' using errcode = 'P0002';
    end if;
    insert into public.location_aliases (company_id, alias_key, label, location_id)
    values (v_company, v_key, coalesce(private.clean_text(p_label, 200), v_key), p_location)
    on conflict (company_id, alias_key) do update
      set location_id = excluded.location_id, label = excluded.label, mapped_by = auth.uid(), mapped_at = now();
  end if;
  perform private.write_audit('location_alias_set', 'location_aliases', v_key, jsonb_build_object('location', p_location));
end;
$$;

-- ---------------------------------------------------------------------------
-- Travel Intelligence
-- ---------------------------------------------------------------------------
create or replace function public.bi_travel(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
set jit = off
as $$
declare
  v_cur text := private.base_currency();
  v_home text := coalesce((select home_country::text from public.companies where id = private.default_company_id()), 'IN');
  v jsonb;
begin
  perform private.bi_require_viewer();
  with t as materialized (select * from private.bi_trips(coalesce(p_filters, '{}'::jsonb))),
       stops as materialized (select t.id, t.employee_id, t.currency, t.spend, t.amount, t.cost_state, t.status, t.category, s.seq, s.label, s.role
                   from t cross join lateral private.trip_stops(t.origin, t.destination) s),
       labels as materialized (select label, air, private.resolve_place(label, air) as location_id
                    from (select distinct label, category = 'flight' as air from stops) d),
       locs as materialized (select x.location_id, p.* from (select distinct location_id from labels where location_id is not null) x
                  cross join lateral private.place_of(x.location_id) p),
       placed as materialized (select s.*, lb.location_id, p.place_key, p.place_name, p.country, p.lat, p.lng
                    from stops s join labels lb on lb.label = s.label and lb.air = (s.category = 'flight')
                    left join locs p on p.location_id = lb.location_id),
       trip_flags as materialized (select id, bool_or(location_id is null) as has_unmapped,
                             bool_or(country is not null and country <> v_home) as international,
                             max(place_key) filter (where role = 'destination') as dest_key
                        from placed group by id),
       legs as materialized (select a.id, a.employee_id, a.place_key as from_key, b.place_key as to_key
                  from placed a join placed b on b.id = a.id and b.seq = a.seq + 1
                 where a.place_key is not null and b.place_key is not null and a.place_key <> b.place_key),
       places as materialized (select distinct on (place_key) place_key, place_name, country, lat, lng from placed where place_key is not null
                   order by place_key, lat),
       ends as materialized (select id, (array_agg(place_name order by seq) filter (where place_key is not null))[1] as from_name,
                       (array_agg(place_name order by seq desc) filter (where place_key is not null))[1] as to_name,
                       count(*) as stops
                  from placed group by id),
       journeys as (select t.id, t.employee_id, t.currency, t.spend, t.cost_state, t.status, e.from_name, e.to_name, e.stops
                      from t join ends e on e.id = t.id)
  select jsonb_build_object(
    'base_currency', v_cur,
    'home_country', v_home,
    'kpis', (select jsonb_build_object(
        'bookings', count(*),
        'on_map', count(*) filter (where not coalesce(f.has_unmapped, true)),
        'not_on_map', count(*) filter (where coalesce(f.has_unmapped, true)),
        'international', count(*) filter (where coalesce(f.international, false)),
        'domestic', count(*) filter (where not coalesce(f.international, false) and not coalesce(f.has_unmapped, true)),
        'places', (select count(distinct place_key) from placed where role = 'destination'),
        'countries', (select count(distinct country) from placed where country is not null),
        'routes', (select count(distinct (from_key, to_key)) from legs))
      from t left join trip_flags f on f.id = t.id),
    'places', coalesce((select jsonb_agg(x order by x.visits desc, x.name) from (
        select pl.place_key as key, pl.place_name as name, pl.country, pl.lat, pl.lng,
               count(distinct s.id) filter (where s.role = 'destination') as visits,
               count(distinct s.id) filter (where s.role = 'origin') as departures,
               count(distinct s.id) filter (where s.role = 'via') as connections,
               count(distinct s.employee_id) filter (where s.role = 'destination') as travellers,
               coalesce(sum(s.spend) filter (where s.role = 'destination' and s.currency = v_cur), 0) as spend
          from places pl join placed s on s.place_key = pl.place_key
         group by 1, 2, 3, 4, 5) x), '[]'::jsonb),
    'legs', coalesce((select jsonb_agg(x order by x.bookings desc) from (
        select l.from_key, l.to_key, count(distinct l.id) as bookings, count(distinct l.employee_id) as travellers
          from legs l group by 1, 2) x), '[]'::jsonb),
    'journeys', coalesce((select jsonb_agg(x) from (
        select from_name, to_name, count(*) as bookings,
               count(*) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled' and currency = v_cur) as costed,
               coalesce(sum(spend) filter (where currency = v_cur), 0) as spend,
               round(avg(spend) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled' and currency = v_cur), 0) as avg_cost,
               max(stops) > 2 as has_connections
          from journeys where from_name is not null and to_name is not null and from_name <> to_name
         group by 1, 2 order by count(*) desc, sum(spend) desc limit 25) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(x order by x.bookings desc) from (
        select p.country, count(distinct p.id) as bookings, count(distinct p.employee_id) as travellers
          from placed p where p.country is not null group by 1) x), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(x order by x.bookings desc) from (
        select t.category, count(*) as bookings,
               count(*) filter (where coalesce(f.international, false)) as international,
               coalesce(sum(t.spend) filter (where t.currency = v_cur), 0) as spend
          from t left join trip_flags f on f.id = t.id group by 1) x), '[]'::jsonb),
    'not_on_map', coalesce((select jsonb_agg(x order by x.bookings desc, x.label) from (
        select label, count(distinct id) as bookings from placed where location_id is null group by 1 limit 100) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee Intelligence
-- ---------------------------------------------------------------------------
create or replace function public.bi_employees(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
set jit = off
as $$
declare
  v_cur text := private.base_currency();
  v jsonb;
begin
  perform private.bi_require_viewer();
  with t as (select * from private.bi_trips(coalesce(p_filters, '{}'::jsonb))),
       adv as (select r.id, (r.departure_date - r.booking_date) as days
                 from public.travel_records r join t on t.id = r.id
                where r.booking_date is not null and r.booking_date <= r.departure_date),
       per as (
         select t.employee_id, t.full_name, t.employee_code, t.department,
                count(*) as bookings,
                coalesce(sum(t.spend) filter (where t.currency = v_cur), 0) as spend,
                count(*) filter (where t.cost_state in ('missing', 'shared')) as without_cost,
                count(*) filter (where t.status = 'cancelled') as cancelled,
                count(*) filter (where t.status = 'no_show') as no_show,
                count(distinct t.project_id) as projects,
                count(*) filter (where t.project_id is null) as unassigned,
                count(distinct upper(btrim(t.destination))) as places,
                min(t.departure_date) as first_date, max(t.departure_date) as last_date,
                round(avg(a.days), 1) as avg_advance_days
           from t left join adv a on a.id = t.id
          group by 1, 2, 3, 4),
       proj as (
         select employee_id, jsonb_agg(jsonb_build_object('id', project_id, 'name', project_name, 'bookings', n) order by n desc, project_name) as list
           from (select employee_id, project_id, project_name, count(*) as n from t where project_id is not null group by 1, 2, 3) x
          group by 1),
       dest as (
         select distinct on (employee_id) employee_id, upper(btrim(destination)) as top_destination, count(*) as n
           from t where destination is not null group by employee_id, upper(btrim(destination))
          order by employee_id, count(*) desc, upper(btrim(destination)))
  select jsonb_build_object(
    'base_currency', v_cur,
    'kpis', (select jsonb_build_object(
        'travellers', count(*),
        'bookings', coalesce(sum(bookings), 0),
        'avg_bookings', case when count(*) > 0 then round(sum(bookings)::numeric / count(*), 1) end,
        'multi_project', count(*) filter (where projects > 1),
        'spend', coalesce(sum(spend), 0),
        'top5_spend', coalesce((select sum(spend) from (select spend from per order by spend desc limit 5) x), 0))
      from per),
    'frequency', coalesce((select jsonb_agg(x order by x.sort) from (
        select case when bookings = 1 then '1 booking' when bookings <= 3 then '2 to 3' when bookings <= 6 then '4 to 6' else '7 or more' end as bucket,
               min(case when bookings = 1 then 1 when bookings <= 3 then 2 when bookings <= 6 then 3 else 4 end) as sort,
               count(*) as travellers, sum(spend) as spend
          from per group by 1) x), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(x order by x.spend desc) from (
        select department, count(*) as travellers, sum(bookings) as bookings, sum(spend) as spend from per group by 1) x), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(x order by x.spend desc, x.bookings desc, x.full_name) from (
        select per.*, coalesce(proj.list, '[]'::jsonb) as project_list, dest.top_destination
          from per left join proj using (employee_id) left join dest using (employee_id)) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Financial Intelligence. Periods: month, quarter or financial year (India:
-- 1 April to 31 March; Q1 = April to June).
-- ---------------------------------------------------------------------------
create or replace function private.fin_period(d date, p_period text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_period
    when 'fy' then 'FY ' || fy || '-' || lpad(((fy + 1) % 100)::text, 2, '0')
    when 'quarter' then 'FY ' || fy || '-' || lpad(((fy + 1) % 100)::text, 2, '0') || ' Q' || (((extract(month from d)::int + 8) % 12) / 3 + 1)
    else to_char(d, 'YYYY-MM') end
    from (select case when extract(month from d) >= 4 then extract(year from d)::int else extract(year from d)::int - 1 end as fy) x
$$;

create or replace function public.bi_finance(p_filters jsonb default '{}'::jsonb, p_period text default 'month')
returns jsonb
language plpgsql stable security invoker
set search_path = ''
set jit = off
as $$
declare
  v_cur text := private.base_currency();
  v_period text := case when p_period in ('month', 'quarter', 'fy') then p_period else 'month' end;
  v jsonb;
begin
  perform private.bi_require_viewer();
  with t as (select *, private.fin_period(departure_date, v_period) as period from private.bi_trips(coalesce(p_filters, '{}'::jsonb))),
       b as (select * from t where currency = v_cur),
       r as (select tr.id, tr.payment_mode, tr.booking_date from public.travel_records tr join t on t.id = tr.id),
       lines as (select c.line_type, c.amount, c.amount_state
                   from public.cost_lines c join b on b.id = c.travel_record_id
                  where b.status <> 'cancelled' and c.currency = v_cur and c.amount_state in ('recorded', 'zero'))
  select jsonb_build_object(
    'base_currency', v_cur,
    'period', v_period,
    'kpis', (select jsonb_build_object(
        'spend', coalesce(sum(spend), 0),
        'bookings', count(*),
        'costed', count(*) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled'),
        'missing_cost', count(*) filter (where cost_state = 'missing'),
        'shared_cost', count(*) filter (where cost_state = 'shared'),
        'zero_cost', count(*) filter (where cost_state = 'zero'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'cancelled_cost', coalesce(sum(cancelled_cost), 0),
        'avg_cost', round(avg(spend) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled'), 0))
      from b),
    'other_currencies', coalesce((select jsonb_agg(x) from (
        select currency, count(*) as bookings, sum(spend) as spend from t where currency <> v_cur group by 1 order by 1) x), '[]'::jsonb),
    'periods', coalesce((select jsonb_agg(x order by x.period) from (
        select period, count(*) as bookings, sum(spend) as spend, sum(cancelled_cost) as cancelled_cost,
               count(*) filter (where cost_state in ('missing', 'shared')) as without_cost,
               (select jsonb_object_agg(category, s) from (select b2.category, sum(b2.spend) as s from b b2 where b2.period = b.period group by 1) c) as by_category
          from b group by period) x), '[]'::jsonb),
    'vendors', coalesce((select jsonb_agg(x) from (
        select coalesce(provider, 'Not recorded') as provider, category, count(*) as bookings,
               count(*) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled') as costed,
               sum(spend) as spend,
               round(avg(spend) filter (where cost_state in ('recorded', 'zero') and status <> 'cancelled'), 0) as avg_cost
          from b group by 1, 2 order by sum(spend) desc, count(*) desc limit 40) x), '[]'::jsonb),
    'payment_modes', coalesce((select jsonb_agg(x) from (
        select coalesce(nullif(upper(btrim(r.payment_mode)), ''), 'Not recorded') as payment_mode, count(*) as bookings, sum(b.spend) as spend
          from b join r on r.id = b.id group by 1 order by sum(b.spend) desc limit 15) x), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(x) from (
        select line_type, count(*) as lines, sum(amount) as amount from lines group by 1 order by sum(amount) desc) x), '[]'::jsonb),
    'completeness', coalesce((select jsonb_agg(x) from (
        select coalesce(source_sheet, 'Entered in Trapple') as source, category, count(*) as bookings,
               count(*) filter (where cost_state = 'recorded' and status <> 'cancelled') as recorded,
               count(*) filter (where cost_state = 'zero') as zero,
               count(*) filter (where cost_state = 'shared') as shared,
               count(*) filter (where cost_state = 'missing') as missing,
               count(*) filter (where status = 'cancelled') as cancelled,
               sum(spend) as spend, sum(cancelled_cost) as cancelled_cost
          from b group by 1, 2 order by count(*) desc) x), '[]'::jsonb),
    'advance', coalesce((select jsonb_agg(x order by x.sort) from (
        select case when d <= 2 then '0 to 2 days' when d <= 7 then '3 to 7 days' when d <= 14 then '8 to 14 days'
                    when d <= 30 then '15 to 30 days' else 'More than 30 days' end as bucket,
               min(case when d <= 2 then 1 when d <= 7 then 2 when d <= 14 then 3 when d <= 30 then 4 else 5 end) as sort,
               count(*) as bookings, round(avg(spend), 0) as avg_cost
          from (select b.spend, b.departure_date - r.booking_date as d
                  from b join r on r.id = b.id
                 where b.category = 'flight' and r.booking_date is not null and r.booking_date <= b.departure_date
                   and b.cost_state in ('recorded', 'zero') and b.status <> 'cancelled') a
         group by 1) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- Money as people read it: ₹47,40,713 (Indian grouping); other currencies by code.
create or replace function private.money_text(n numeric, cur text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  i text;
  r text;
begin
  if n is null then return 'not recorded'; end if;
  i := abs(round(n))::bigint::text;
  if cur is distinct from 'INR' then
    return coalesce(cur, '') || ' ' || case when n < 0 then '-' else '' end || to_char(abs(round(n)), 'FM999,999,999,999,990');
  end if;
  if length(i) > 3 then
    r := ',' || right(i, 3);
    i := left(i, length(i) - 3);
    while length(i) > 2 loop
      r := ',' || right(i, 2) || r;
      i := left(i, length(i) - 2);
    end loop;
    r := i || r;
  else
    r := i;
  end if;
  return case when n < 0 then '-' else '' end || '₹' || r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Calculated insights: each is a number worked out from the bookings, with
-- the calculation spelled out. No causes or explanations are generated.
-- ---------------------------------------------------------------------------
create or replace function public.bi_insights(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
set jit = off
as $$
declare
  v_cur text := private.base_currency();
  v_out jsonb := '[]'::jsonb;
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_total numeric; v_n bigint; v_costed bigint;
  r record;
begin
  perform private.bi_require_viewer();

  select coalesce(sum(spend) filter (where currency = v_cur), 0), count(*),
         count(*) filter (where currency = v_cur and cost_state in ('recorded', 'zero') and status <> 'cancelled')
    into v_total, v_n, v_costed from private.bi_trips(v_f);
  if v_n = 0 then return v_out; end if;

  -- Spend concentration by project
  select coalesce(project_name, 'Not linked to a project') as name, sum(spend) as s into r
    from private.bi_trips(v_f) where currency = v_cur group by 1 order by 2 desc limit 1;
  if v_total > 0 and r.s is not null then
    v_out := v_out || jsonb_build_object('id', 'top_project', 'kind', 'spend',
      'title', format('%s accounts for %s%% of travel spend', r.name, round(100 * r.s / v_total)),
      'value', r.s, 'basis', format('Spend on %s (%s) divided by total spend (%s, from %s costed bookings that were not cancelled).', r.name, private.money_text(r.s, v_cur), private.money_text(v_total, v_cur), v_costed),
      'link', '/travel/bi/projects');
  end if;

  -- Top five travellers
  select sum(s) as s into r from (select sum(spend) as s from private.bi_trips(v_f) where currency = v_cur group by employee_id order by 1 desc limit 5) x;
  if v_total > 0 and (select count(distinct employee_id) from private.bi_trips(v_f)) > 5 then
    v_out := v_out || jsonb_build_object('id', 'top_travellers', 'kind', 'people',
      'title', format('The 5 highest-spending travellers account for %s%% of spend', round(100 * r.s / v_total)),
      'value', r.s, 'basis', format('Sum of the five largest per-person totals divided by total spend, among %s travellers.', (select count(distinct employee_id) from private.bi_trips(v_f))),
      'link', '/travel/bi/employees');
  end if;

  -- Costs not in the sheets
  select count(*) filter (where cost_state = 'missing') as m, count(*) filter (where cost_state = 'shared') as sh into r from private.bi_trips(v_f);
  if r.m > 0 then
    v_out := v_out || jsonb_build_object('id', 'missing_cost', 'kind', 'quality',
      'title', format('%s of %s bookings (%s%%) have no cost in the sheet', r.m, v_n, round(100.0 * r.m / v_n)),
      'value', r.m, 'basis', format('Bookings whose cost cell was blank. They are left out of spend, not counted as zero.%s',
        case when r.sh > 0 then format(' A further %s share one merged cost with another line.', r.sh) else '' end),
      'link', '/travel/bi/finance');
  end if;

  -- Travel not linked to a project
  select count(*) as u into r from private.bi_trips(v_f) where project_id is null;
  if r.u > 0 then
    v_out := v_out || jsonb_build_object('id', 'unassigned', 'kind', 'quality',
      'title', format('%s bookings (%s%%) are not linked to a project', r.u, round(100.0 * r.u / v_n)),
      'value', r.u, 'basis', 'Bookings whose sheet had no project name, or a name not yet linked on the upload screen.',
      'link', '/travel/bi/projects/unassigned');
  end if;

  -- Busiest month
  select to_char(date_trunc('month', departure_date), 'YYYY-MM') as m, sum(spend) as s, count(*) as n into r
    from private.bi_trips(v_f) where currency = v_cur group by 1 order by 2 desc limit 1;
  if r.s > 0 and (select count(distinct date_trunc('month', departure_date)) from private.bi_trips(v_f)) > 1 then
    v_out := v_out || jsonb_build_object('id', 'top_month', 'kind', 'time',
      'title', format('Highest spend month: %s', to_char(to_date(r.m, 'YYYY-MM'), 'Mon YYYY')),
      'value', r.s, 'basis', format('%s bookings travelling that month, %s. Months are by travel date.', r.n, private.money_text(r.s, v_cur)),
      'link', '/travel/bi/finance');
  end if;

  -- Most frequent route
  select upper(btrim(origin)) || ' → ' || upper(btrim(destination)) as route, count(*) as n into r
    from private.bi_trips(v_f) where origin is not null and destination is not null group by 1 order by 2 desc, 1 limit 1;
  if r.n > 1 then
    v_out := v_out || jsonb_build_object('id', 'top_route', 'kind', 'travel',
      'title', format('Most travelled route: %s (%s bookings)', r.route, r.n),
      'value', r.n, 'basis', 'Bookings with exactly this From and To, as written in the sheets.', 'link', '/travel/bi/travel');
  end if;

  -- Late-booked flights: fares compared
  select count(*) filter (where d <= 3) as late_n, round(avg(spend) filter (where d <= 3), 0) as late_avg,
         count(*) filter (where d >= 15) as early_n, round(avg(spend) filter (where d >= 15), 0) as early_avg, count(*) as n
    into r
    from (select t.spend, t.departure_date - tr.booking_date as d
            from private.bi_trips(v_f) t join public.travel_records tr on tr.id = t.id
           where t.category = 'flight' and t.currency = v_cur and t.cost_state = 'recorded' and t.status <> 'cancelled'
             and tr.booking_date is not null and tr.booking_date <= t.departure_date) a;
  if r.n >= 10 and r.late_n > 0 then
    v_out := v_out || jsonb_build_object('id', 'late_flights', 'kind', 'spend',
      'title', format('%s%% of flights were booked 3 days or less before travel', round(100.0 * r.late_n / r.n)),
      'value', r.late_n,
      'basis', format('%s of %s flights with both a booking date and a cost. Average cost: %s when booked 0 to 3 days ahead%s. Routes differ, so this compares averages only.',
        r.late_n, r.n, private.money_text(r.late_avg, v_cur),
        case when r.early_n > 0 then format(', %s when booked 15 or more days ahead (%s flights)', private.money_text(r.early_avg, v_cur), r.early_n) else '' end),
      'link', '/travel/bi/finance');
  end if;

  -- Cancelled cost
  select count(*) as n, sum(cancelled_cost) as c into r from private.bi_trips(v_f) where status = 'cancelled' and currency = v_cur;
  if r.n > 0 then
    v_out := v_out || jsonb_build_object('id', 'cancelled', 'kind', 'spend',
      'title', format('%s cancelled booking%s with %s recorded', r.n, case when r.n = 1 then '' else 's' end, private.money_text(r.c, v_cur)),
      'value', r.c, 'basis', 'Cost written against bookings marked cancelled. Refunds are not in the sheets, so the amount actually lost is not known.',
      'link', '/travel/bi/finance');
  end if;

  return v_out;
end;
$$;

-- Downloads from the new pages are audited too.
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
                      'project_intelligence', 'project_detail', 'employee_intelligence', 'financial_intelligence') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  if p_employee is not null and not private.can_view_employee(p_employee) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.write_audit('report_generated', 'report', p_report,
    case when p_employee is null then '{}'::jsonb else jsonb_build_object('employee', p_employee) end);
end;
$$;

-- The reports are many small steps; just-in-time compilation only slows them down.
alter function public.bi_overview(jsonb) set jit = off;
alter function public.bi_projects(jsonb) set jit = off;
alter function public.bi_project_detail(uuid, jsonb) set jit = off;
alter function public.bi_filter_options() set jit = off;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.bi_travel(jsonb) from public, anon;
grant execute on function public.bi_travel(jsonb) to authenticated;
revoke all on function public.bi_employees(jsonb) from public, anon;
grant execute on function public.bi_employees(jsonb) to authenticated;
revoke all on function public.bi_finance(jsonb, text) from public, anon;
grant execute on function public.bi_finance(jsonb, text) to authenticated;
revoke all on function public.bi_insights(jsonb) from public, anon;
grant execute on function public.bi_insights(jsonb) to authenticated;
revoke all on function public.location_search(text) from public, anon;
grant execute on function public.location_search(text) to authenticated;
revoke all on function public.location_alias_set(text, bigint) from public, anon;
grant execute on function public.location_alias_set(text, bigint) to authenticated;
revoke all on function private.resolve_place(text, boolean) from public, anon;
grant execute on function private.resolve_place(text, boolean) to authenticated;
revoke all on function private.place_of(bigint) from public, anon;
grant execute on function private.place_of(bigint) to authenticated;
grant execute on function private.place_key(text) to authenticated;
grant execute on function private.trip_stops(text, text) to authenticated;
grant execute on function private.fin_period(date, text) to authenticated;
grant execute on function private.money_text(numeric, text) to authenticated;
