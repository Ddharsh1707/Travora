-- =============================================================================
-- Phase 5: bulk / group bookings
--
-- A bulk booking is one group movement (a flight block, a train coach, a team
-- offsite). Each member is a real employee, and each member gets their OWN
-- travel record, so the trip shows up in that person's history, in search, in
-- totals and in reports exactly like any other trip. Tickets per member are
-- ordinary documents attached to the member's travel record.
--
-- Who sees what:
--   Travel Desk / Admin  every booking and every member
--   Approver             bookings that include someone in their team, and only
--                        those team members' rows
--   Employee             bookings they are on, and only their own member row
--                        (the rest of the manifest stays private)
-- All writes go through checked functions; the tables are read-only to the API.
-- =============================================================================

create table public.bulk_bookings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  group_reference  text not null check (char_length(btrim(group_reference)) between 1 and 64),
  origin           text not null check (char_length(btrim(origin)) between 1 and 120),
  destination      text not null check (char_length(btrim(destination)) between 1 and 120),
  departure_date   date not null,
  return_date      date,
  booking_type     public.travel_type not null default 'flight',
  provider         text check (provider is null or char_length(provider) <= 120),
  total_cost       numeric(14, 2) check (total_cost is null or total_cost >= 0),
  currency         char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  savings          numeric(14, 2) check (savings is null or savings >= 0),
  project          text check (project is null or char_length(project) <= 200),
  notes            text check (notes is null or char_length(notes) <= 4000),
  status           text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  review_status    text not null default 'pending_review' check (review_status in ('pending_review', 'approved', 'noted')),
  review_comment   text check (review_comment is null or char_length(review_comment) <= 2000),
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bulk_bookings_dates check (return_date is null or return_date >= departure_date)
);
create index bulk_bookings_departure_idx on public.bulk_bookings (departure_date desc);
create index bulk_bookings_reference_idx on public.bulk_bookings (upper(group_reference));

create trigger bulk_bookings_set_updated_at
  before update on public.bulk_bookings
  for each row execute function public.set_updated_at();

create table public.bulk_booking_members (
  id                 uuid primary key default gen_random_uuid(),
  bulk_booking_id    uuid not null references public.bulk_bookings (id) on delete cascade,
  employee_id        uuid not null references public.profiles (id) on delete restrict,
  seat_or_coach      text check (seat_or_coach is null or char_length(seat_or_coach) <= 40),
  booking_reference  text check (booking_reference is null or char_length(booking_reference) <= 64),
  ticket_number      text check (ticket_number is null or char_length(ticket_number) <= 64),
  amount             numeric(12, 2) check (amount is null or amount >= 0),
  travel_record_id   uuid unique references public.travel_records (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (bulk_booking_id, employee_id)
);
create index bulk_booking_members_employee_idx on public.bulk_booking_members (employee_id);

create trigger audit_bulk_bookings        after insert or update or delete on public.bulk_bookings        for each row execute function private.audit_row_change();
create trigger audit_bulk_booking_members after insert or update or delete on public.bulk_booking_members for each row execute function private.audit_row_change();

alter table public.bulk_bookings        enable row level security;
alter table public.bulk_booking_members enable row level security;

revoke all on public.bulk_bookings, public.bulk_booking_members from anon, public;
revoke insert, update, delete on public.bulk_bookings, public.bulk_booking_members from authenticated;
grant select on public.bulk_bookings, public.bulk_booking_members to authenticated;

-- True when the caller may see at least one member of the booking.
create or replace function private.can_view_bulk_booking(target uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.current_app_role() is not null and (
    private.is_staff()
    or exists (select 1 from public.bulk_booking_members m
                where m.bulk_booking_id = target and private.can_view_employee(m.employee_id))
  )
$$;

create policy bulk_bookings_select on public.bulk_bookings
  for select to authenticated using (private.can_view_bulk_booking(id));

create policy bulk_booking_members_select on public.bulk_booking_members
  for select to authenticated using (private.can_view_employee(employee_id));

-- ---------------------------------------------------------------------------
-- Keep each member's travel record in step with the booking.
-- ---------------------------------------------------------------------------
create or replace function private.bulk_sync_records(p_booking uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.bulk_bookings%rowtype;
  m record;
  v_count integer;
  v_share numeric;
  v_ref text;
  v_amount numeric;
  v_record uuid;
begin
  select * into b from public.bulk_bookings where id = p_booking;
  select count(*) into v_count from public.bulk_booking_members where bulk_booking_id = p_booking;
  v_share := case when b.total_cost is not null and v_count > 0 then round(b.total_cost / v_count, 2) end;

  for m in select * from public.bulk_booking_members where bulk_booking_id = p_booking loop
    v_ref := coalesce(m.booking_reference, upper(b.group_reference));
    v_amount := coalesce(m.amount, v_share);
    v_record := m.travel_record_id;

    if v_record is null then
      -- Re-use an existing trip for the same person, day and PNR (e.g. one that
      -- was imported earlier) instead of creating a duplicate.
      select r.id into v_record from public.travel_records r
       where r.employee_id = m.employee_id and r.departure_date = b.departure_date and r.booking_reference = v_ref
         and not exists (select 1 from public.bulk_booking_members o where o.travel_record_id = r.id);
    end if;

    if v_record is null then
      insert into public.travel_records (
        employee_id, booking_reference, origin, destination, departure_date, return_date,
        airline_or_provider, ticket_number, amount, currency, booking_type, status, source, created_by
      ) values (
        m.employee_id, v_ref, b.origin, b.destination, b.departure_date, b.return_date,
        b.provider, m.ticket_number, v_amount, b.currency, b.booking_type,
        case when b.status = 'cancelled' then 'cancelled' else 'confirmed' end, 'bulk_booking', auth.uid()
      ) returning id into v_record;
    else
      update public.travel_records
         set booking_reference = v_ref, origin = b.origin, destination = b.destination,
             departure_date = b.departure_date, return_date = b.return_date,
             airline_or_provider = b.provider, ticket_number = m.ticket_number,
             amount = v_amount, currency = b.currency, booking_type = b.booking_type,
             status = case when b.status = 'cancelled' then 'cancelled'
                           when status = 'completed' then 'completed' else 'confirmed' end,
             source = 'bulk_booking'
       where id = v_record;
    end if;

    if m.travel_record_id is distinct from v_record then
      update public.bulk_booking_members set travel_record_id = v_record where id = m.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- bulk_save: create (p_id null) or update a bulk booking and its manifest.
-- p_booking: title, group_reference, origin, destination, departure_date,
--   return_date, booking_type, provider, total_cost, currency, savings,
--   project, notes (strings)
-- p_members: array of { employee_id | employee_code, seat_or_coach,
--   booking_reference, ticket_number, amount }
-- Members left out of p_members are removed and their trips cancelled.
-- Returns the booking id.
-- ---------------------------------------------------------------------------
create or replace function public.bulk_save(p_id uuid, p_booking jsonb, p_members jsonb)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_title text; v_ref text; v_origin text; v_dest text; v_provider text; v_project text; v_notes text; v_currency text;
  v_dep date; v_ret date; v_total numeric; v_savings numeric; v_type public.travel_type; v_raw text;
  v_member jsonb; v_emp uuid; v_code text; v_active boolean;
  v_errors text[] := '{}';
  v_seen uuid[] := '{}';
  v_n integer := 0;
  v_m_amount numeric;
  v_existing public.bulk_bookings%rowtype;
  v_removed uuid[];
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_booking is null or jsonb_typeof(p_booking) <> 'object' then
    raise exception 'Invalid booking' using errcode = '22023';
  end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'Add at least one traveller' using errcode = '22023';
  end if;
  if jsonb_array_length(p_members) > 500 then
    raise exception 'A bulk booking can have at most 500 travellers' using errcode = '22023';
  end if;

  v_title    := private.clean_text(p_booking ->> 'title', 200);
  v_ref      := upper(private.clean_text(p_booking ->> 'group_reference', 64));
  v_origin   := private.clean_text(p_booking ->> 'origin', 120);
  v_dest     := private.clean_text(p_booking ->> 'destination', 120);
  v_provider := private.clean_text(p_booking ->> 'provider', 120);
  v_project  := private.clean_text(p_booking ->> 'project', 200);
  v_notes    := left(nullif(btrim(coalesce(p_booking ->> 'notes', '')), ''), 4000);
  v_currency := upper(coalesce(private.clean_text(p_booking ->> 'currency', 8), 'INR'));
  v_type     := private.map_booking_type(p_booking ->> 'booking_type');

  if v_title is null or v_ref is null or v_origin is null or v_dest is null then
    raise exception 'Title, group reference, From and To are required' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter code' using errcode = '22023';
  end if;

  v_raw := private.clean_text(p_booking ->> 'departure_date', 10);
  if v_raw is null or v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Travel date must be YYYY-MM-DD' using errcode = '22023';
  end if;
  begin v_dep := v_raw::date; exception when others then raise exception 'Travel date is not a real date' using errcode = '22023'; end;
  v_raw := private.clean_text(p_booking ->> 'return_date', 10);
  if v_raw is not null then
    if v_raw !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Return date must be YYYY-MM-DD' using errcode = '22023'; end if;
    begin v_ret := v_raw::date; exception when others then raise exception 'Return date is not a real date' using errcode = '22023'; end;
    if v_ret < v_dep then raise exception 'Return date is before the travel date' using errcode = '22023'; end if;
  end if;

  v_raw := regexp_replace(coalesce(p_booking ->> 'total_cost', ''), '[^0-9.\-]', '', 'g');
  if v_raw <> '' then
    if v_raw !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'Total cost must be a positive number' using errcode = '22023'; end if;
    v_total := v_raw::numeric;
  end if;
  v_raw := regexp_replace(coalesce(p_booking ->> 'savings', ''), '[^0-9.\-]', '', 'g');
  if v_raw <> '' then
    if v_raw !~ '^\d{1,12}(\.\d{1,2})?$' then raise exception 'Savings must be a positive number' using errcode = '22023'; end if;
    v_savings := v_raw::numeric;
  end if;

  if v_id is null then
    insert into public.bulk_bookings (title, group_reference, origin, destination, departure_date, return_date,
      booking_type, provider, total_cost, currency, savings, project, notes)
    values (v_title, v_ref, v_origin, v_dest, v_dep, v_ret, v_type, v_provider, v_total, v_currency, v_savings, v_project, v_notes)
    returning id into v_id;
  else
    select * into v_existing from public.bulk_bookings where id = v_id for update;
    if not found then raise exception 'Bulk booking not found' using errcode = 'P0002'; end if;
    if v_existing.status = 'cancelled' then raise exception 'This bulk booking is cancelled' using errcode = '22023'; end if;
    update public.bulk_bookings
       set title = v_title, group_reference = v_ref, origin = v_origin, destination = v_dest,
           departure_date = v_dep, return_date = v_ret, booking_type = v_type, provider = v_provider,
           total_cost = v_total, currency = v_currency, savings = v_savings, project = v_project, notes = v_notes,
           -- material changes need a fresh review
           review_status = case when (v_existing.total_cost, v_existing.departure_date, v_existing.destination)
                                     is distinct from (v_total, v_dep, v_dest) then 'pending_review' else v_existing.review_status end
     where id = v_id;
  end if;

  -- Resolve and validate every member before changing the manifest.
  create temp table if not exists pg_temp.bulk_new (employee_id uuid, seat text, ref text, ticket text, amount numeric) on commit drop;
  delete from pg_temp.bulk_new;
  for v_member in select * from jsonb_array_elements(p_members) loop
    v_n := v_n + 1;
    v_emp := null;
    if jsonb_typeof(v_member) <> 'object' then
      v_errors := v_errors || format('Traveller %s: invalid entry', v_n);
      continue;
    end if;
    if coalesce(v_member ->> 'employee_id', '') ~ '^[0-9a-f-]{36}$' then
      select id, active into v_emp, v_active from public.profiles where id = (v_member ->> 'employee_id')::uuid;
    else
      v_code := upper(private.clean_text(v_member ->> 'employee_code', 64));
      if v_code is not null then
        select id, active into v_emp, v_active from public.profiles where upper(employee_id) = v_code;
      end if;
    end if;
    if v_emp is null then
      v_errors := v_errors || format('Traveller %s: employee %s not found', v_n, coalesce(v_code, v_member ->> 'employee_id', '?'));
      continue;
    end if;
    if not v_active then
      v_errors := v_errors || format('Traveller %s: employee is deactivated', v_n);
      continue;
    end if;
    if v_emp = any (v_seen) then
      v_errors := v_errors || format('Traveller %s: listed twice', v_n);
      continue;
    end if;
    v_seen := v_seen || v_emp;

    v_raw := regexp_replace(coalesce(v_member ->> 'amount', ''), '[^0-9.\-]', '', 'g');
    v_m_amount := null;
    if v_raw <> '' then
      if v_raw !~ '^\d{1,10}(\.\d{1,2})?$' then
        v_errors := v_errors || format('Traveller %s: amount must be a positive number', v_n);
        continue;
      end if;
      v_m_amount := v_raw::numeric;
    end if;

    insert into pg_temp.bulk_new values (
      v_emp,
      private.clean_text(v_member ->> 'seat_or_coach', 40),
      upper(private.clean_text(v_member ->> 'booking_reference', 64)),
      private.clean_text(v_member ->> 'ticket_number', 64),
      v_m_amount);
  end loop;

  if array_length(v_errors, 1) is not null then
    raise exception '%', array_to_string(v_errors[1:10], '; ') using errcode = '22023';
  end if;

  -- Removed members: cancel the trip that this booking created for them.
  select coalesce(array_agg(travel_record_id), '{}') into v_removed
    from public.bulk_booking_members
   where bulk_booking_id = v_id and employee_id <> all (v_seen) and travel_record_id is not null;
  delete from public.bulk_booking_members where bulk_booking_id = v_id and employee_id <> all (v_seen);
  update public.travel_records set status = 'cancelled' where id = any (v_removed) and status <> 'completed';

  insert into public.bulk_booking_members (bulk_booking_id, employee_id, seat_or_coach, booking_reference, ticket_number, amount)
  select v_id, n.employee_id, n.seat, n.ref, n.ticket, n.amount from pg_temp.bulk_new n
  on conflict (bulk_booking_id, employee_id) do update
    set seat_or_coach = excluded.seat_or_coach, booking_reference = excluded.booking_reference,
        ticket_number = excluded.ticket_number, amount = excluded.amount;

  perform private.bulk_sync_records(v_id);
  perform private.write_audit(case when p_id is null then 'bulk_created' else 'bulk_updated' end,
    'bulk_bookings', v_id::text, jsonb_build_object('travellers', cardinality(v_seen), 'removed', cardinality(v_removed)));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- bulk_cancel: cancels the booking and every member's trip (Travel Desk / Admin).
-- ---------------------------------------------------------------------------
create or replace function public.bulk_cancel(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.bulk_bookings
     set status = 'cancelled',
         notes = left(concat_ws(E'\n', notes, 'Cancelled: ' || nullif(btrim(coalesce(p_reason, '')), '')), 4000)
   where id = p_id and status <> 'cancelled';
  if not found then
    raise exception 'Bulk booking not found or already cancelled' using errcode = 'P0002';
  end if;
  perform private.bulk_sync_records(p_id);
  perform private.write_audit('bulk_cancelled', 'bulk_bookings', p_id::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- bulk_review: an approver signs off the group budget ('approved') or notes it.
-- Approvers may review only bookings with someone from their team on them,
-- and nobody reviews a booking they created.
-- ---------------------------------------------------------------------------
create or replace function public.bulk_review(p_id uuid, p_decision text, p_comment text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  b public.bulk_bookings%rowtype;
begin
  if not private.has_role('approver', 'admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'noted') then
    raise exception 'Decision must be approved or noted' using errcode = '22023';
  end if;
  select * into b from public.bulk_bookings where id = p_id for update;
  if not found or not private.can_view_bulk_booking(p_id) then
    raise exception 'Bulk booking not found' using errcode = 'P0002';
  end if;
  if b.created_by = auth.uid() then
    raise exception 'You cannot review a booking you created' using errcode = '42501';
  end if;
  if b.status = 'cancelled' then
    raise exception 'This bulk booking is cancelled' using errcode = '22023';
  end if;
  update public.bulk_bookings
     set review_status = p_decision,
         review_comment = left(nullif(btrim(coalesce(p_comment, '')), ''), 2000),
         reviewed_by = private.current_profile_id(),
         reviewed_at = now()
   where id = p_id;
  perform private.write_audit('bulk_reviewed', 'bulk_bookings', p_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke all on function private.can_view_bulk_booking(uuid), private.bulk_sync_records(uuid) from public;
grant execute on function private.can_view_bulk_booking(uuid) to authenticated;
revoke all on function public.bulk_save(uuid, jsonb, jsonb), public.bulk_cancel(uuid, text), public.bulk_review(uuid, text, text) from public, anon;
grant execute on function public.bulk_save(uuid, jsonb, jsonb), public.bulk_cancel(uuid, text), public.bulk_review(uuid, text, text) to authenticated;
