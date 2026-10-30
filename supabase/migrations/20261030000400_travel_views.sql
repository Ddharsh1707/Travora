-- =============================================================================
-- Phase 2: read models for search, history and employee summaries
--
-- Both views use security_invoker = true, so they run with the CALLER's
-- permissions and the RLS policies on profiles / travel_records still apply.
-- An employee querying them sees only their own rows, an approver their
-- scope, the Travel Desk everything. They are computed live, so a new or
-- edited trip shows up everywhere immediately with no manual refresh.
-- =============================================================================

create view public.travel_records_search
with (security_invoker = true) as
select
  r.id,
  r.employee_id,
  p.employee_id   as employee_code,
  p.full_name     as employee_name,
  p.department,
  r.request_id,
  r.booking_reference,
  r.origin,
  r.destination,
  r.departure_date,
  r.return_date,
  r.airline_or_provider,
  r.ticket_number,
  r.amount,
  r.currency,
  r.booking_type,
  r.status,
  r.source,
  r.created_at,
  r.updated_at
from public.travel_records r
join public.profiles p on p.id = r.employee_id;

create view public.employee_travel_summary
with (security_invoker = true) as
select
  p.id                as employee_id,
  p.employee_id       as employee_code,
  p.full_name         as employee_name,
  p.department,
  p.designation,
  p.active,
  count(r.id) filter (where r.status <> 'cancelled')                                         as total_trips,
  coalesce(sum(r.amount) filter (where r.status <> 'cancelled'), 0)::numeric(14, 2)          as total_spend,
  max(r.departure_date) filter (where r.status <> 'cancelled' and r.departure_date <= current_date) as last_trip_date,
  min(r.departure_date) filter (where r.status <> 'cancelled' and r.departure_date >  current_date) as next_trip_date,
  count(r.id) filter (where r.status <> 'cancelled' and r.departure_date > current_date)     as upcoming_trips
from public.profiles p
left join public.travel_records r on r.employee_id = p.id
group by p.id;

revoke all on public.travel_records_search, public.employee_travel_summary from anon, public;
grant select on public.travel_records_search, public.employee_travel_summary to authenticated;

-- Trigram indexes make "contains" searches on names, places and references fast.
create extension if not exists pg_trgm with schema extensions;
create index profiles_full_name_trgm_idx      on public.profiles       using gin (full_name extensions.gin_trgm_ops);
create index travel_records_destination_trgm  on public.travel_records using gin (destination extensions.gin_trgm_ops);
create index travel_records_origin_trgm       on public.travel_records using gin (origin extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Booking a trip against an approved request marks the request as booked,
-- so the Travel Desk does not have to update two screens.
-- ---------------------------------------------------------------------------
create or replace function private.sync_request_on_booking()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.travel_requests;
begin
  if new.request_id is null then
    return new;
  end if;
  select * into v_req from public.travel_requests where id = new.request_id;
  if not found then
    return new;
  end if;
  if v_req.employee_id <> new.employee_id then
    raise exception 'Travel record and request belong to different employees' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and v_req.status = 'approved' and new.status = 'confirmed' then
    update public.travel_requests set status = 'booked' where id = v_req.id;
  end if;
  return new;
end;
$$;

create trigger travel_records_sync_request
  after insert or update of request_id, employee_id on public.travel_records
  for each row execute function private.sync_request_on_booking();

-- New helpers in `private` are not callable by default.
alter default privileges in schema private revoke execute on functions from public;
revoke all on function private.sync_request_on_booking() from public;

-- ---------------------------------------------------------------------------
-- Audit entry when someone downloads a report. Only known report names are
-- accepted, and the caller must be allowed to see the employee concerned.
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
  if p_report not in ('employee_travel_history', 'travel_search') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  if p_employee is not null and not private.can_view_employee(p_employee) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.write_audit('report_generated', 'report', p_report,
    case when p_employee is null then '{}'::jsonb else jsonb_build_object('employee', p_employee) end);
end;
$$;

revoke all on function public.record_report_generated(text, uuid) from public, anon;
grant execute on function public.record_report_generated(text, uuid) to authenticated;
