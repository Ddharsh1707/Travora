-- =============================================================================
-- Phase 3: Excel / CSV import with preview and confirmation
--
-- Flow: the browser reads the file and maps columns, then calls
-- import_stage(). The DATABASE validates every row (employee match, dates,
-- amounts, duplicates) and stores the result as a staged batch. Nothing
-- reaches travel_records until a person reviews the preview and calls
-- import_commit(). Both steps are Travel Desk / Admin only and audited.
-- The spreadsheet itself is never the system of record.
-- =============================================================================

create table public.import_batches (
  id                 uuid primary key default gen_random_uuid(),
  created_by         uuid references auth.users (id) on delete set null default auth.uid(),
  original_filename  text not null check (char_length(original_filename) between 1 and 255),
  file_kind          text not null check (file_kind in ('csv', 'xlsx')),
  column_mapping     jsonb not null default '{}'::jsonb,
  status             text not null default 'staged' check (status in ('staged', 'committed', 'cancelled')),
  total_rows         integer not null default 0,
  valid_rows         integer not null default 0,
  warning_rows       integer not null default 0,
  error_rows         integer not null default 0,
  duplicate_rows     integer not null default 0,
  imported_rows      integer not null default 0,
  created_at         timestamptz not null default now(),
  committed_at       timestamptz
);
create index import_batches_created_idx on public.import_batches (created_at desc);

create table public.import_rows (
  id                 bigint generated always as identity primary key,
  batch_id           uuid not null references public.import_batches (id) on delete cascade,
  row_number         integer not null,
  employee_code      text,
  employee_name      text,
  profile_id         uuid references public.profiles (id) on delete set null,
  origin             text,
  destination        text,
  departure_date     date,
  return_date        date,
  provider           text,
  booking_reference  text,
  ticket_number      text,
  amount             numeric(12, 2),
  currency           char(3) not null default 'INR',
  booking_type       public.travel_type not null default 'flight',
  status             text not null check (status in ('valid', 'warning', 'error', 'duplicate', 'imported', 'skipped')),
  messages           text[] not null default '{}',
  travel_record_id   uuid references public.travel_records (id) on delete set null,
  unique (batch_id, row_number)
);
create index import_rows_batch_idx on public.import_rows (batch_id, row_number);

alter table public.import_batches enable row level security;
alter table public.import_rows    enable row level security;

revoke all on public.import_batches, public.import_rows from anon, public;
revoke insert, update, delete on public.import_batches, public.import_rows from authenticated;
grant select on public.import_batches, public.import_rows to authenticated;

create policy import_batches_select on public.import_batches
  for select to authenticated using (private.is_staff());
create policy import_rows_select on public.import_rows
  for select to authenticated using (private.is_staff());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.clean_text(v text, max_len integer)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(v, ''), '[[:cntrl:]]', ' ', 'g')), max_len), '')
$$;

create or replace function private.map_booking_type(v text)
returns public.travel_type
language sql immutable
set search_path = ''
as $$
  select case
    when v is null or btrim(v) = '' then 'flight'
    when lower(v) ~ '(flight|air|plane)'     then 'flight'
    when lower(v) ~ '(train|rail)'           then 'train'
    when lower(v) ~ '(bus|coach)'            then 'bus'
    when lower(v) ~ '(cab|taxi|car)'         then 'cab'
    when lower(v) ~ '(hotel|stay|lodg)'      then 'hotel'
    when lower(v) ~ '(multi)'                then 'multi_modal'
    else 'other'
  end::public.travel_type
$$;

-- ---------------------------------------------------------------------------
-- import_stage: validate rows and save them as a preview batch
-- p_rows: JSON array of objects with string values for the keys
--   employee_code, employee_name, departure_date (YYYY-MM-DD), return_date,
--   origin, destination, provider, booking_reference, ticket_number,
--   amount, currency, booking_type
-- ---------------------------------------------------------------------------
create or replace function public.import_stage(
  p_filename text, p_file_kind text, p_mapping jsonb, p_rows jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_row jsonb;
  v_n integer;
  v_msgs text[];
  v_status text;
  v_code text; v_name text; v_profile uuid; v_active boolean; v_matches integer;
  v_dep date; v_ret date; v_amount numeric; v_raw text;
  v_origin text; v_dest text; v_ref text; v_ticket text; v_provider text; v_currency text; v_type_raw text;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_file_kind not in ('csv', 'xlsx') then
    raise exception 'Only .csv and .xlsx files can be imported' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no data rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import at most 5,000 rows at a time' using errcode = '22023';
  end if;

  insert into public.import_batches (original_filename, file_kind, column_mapping)
  values (coalesce(private.clean_text(p_filename, 255), 'upload'), p_file_kind,
          coalesce(p_mapping, '{}'::jsonb))
  returning id into v_batch;

  for v_row, v_n in select value, ordinality::integer from jsonb_array_elements(p_rows) with ordinality loop
    v_msgs := '{}';
    v_profile := null; v_active := null; v_dep := null; v_ret := null; v_amount := null;

    if jsonb_typeof(v_row) <> 'object' then
      insert into public.import_rows (batch_id, row_number, status, messages)
      values (v_batch, v_n, 'error', array['Row could not be read']);
      continue;
    end if;

    v_code     := private.clean_text(v_row ->> 'employee_code', 32);
    v_name     := private.clean_text(v_row ->> 'employee_name', 200);
    v_origin   := private.clean_text(v_row ->> 'origin', 120);
    v_dest     := private.clean_text(v_row ->> 'destination', 120);
    v_provider := private.clean_text(v_row ->> 'provider', 120);
    v_ref      := upper(private.clean_text(v_row ->> 'booking_reference', 64));
    v_ticket   := private.clean_text(v_row ->> 'ticket_number', 64);
    v_currency := upper(coalesce(private.clean_text(v_row ->> 'currency', 3), 'INR'));
    v_type_raw := private.clean_text(v_row ->> 'booking_type', 40);

    -- Employee: by ID first, then by exact unique name.
    if v_code is not null then
      select p.id, p.active into v_profile, v_active
        from public.profiles p where lower(p.employee_id) = lower(v_code);
      if v_profile is null then
        v_msgs := array_append(v_msgs, format('Employee ID %s not found', v_code));
      elsif v_name is not null and not exists (
        select 1 from public.profiles p where p.id = v_profile and lower(p.full_name) = lower(v_name)) then
        v_msgs := array_append(v_msgs, 'Warning: name does not match the employee ID');
      end if;
    elsif v_name is not null then
      select count(*) into v_matches from public.profiles p where lower(p.full_name) = lower(v_name);
      if v_matches = 1 then
        select p.id, p.active into v_profile, v_active from public.profiles p where lower(p.full_name) = lower(v_name);
        v_msgs := array_append(v_msgs, 'Warning: matched by name only');
      elsif v_matches > 1 then
        v_msgs := array_append(v_msgs, 'Several employees have this name; add the employee ID');
      else
        v_msgs := array_append(v_msgs, format('Employee "%s" not found', v_name));
      end if;
    else
      v_msgs := array_append(v_msgs, 'Employee is missing');
    end if;
    if v_active is false then
      v_msgs := array_append(v_msgs, 'Warning: employee is deactivated');
    end if;

    -- Dates (the browser converts to YYYY-MM-DD; anything else is rejected here)
    v_raw := btrim(coalesce(v_row ->> 'departure_date', ''));
    if v_raw = '' then
      v_msgs := array_append(v_msgs, 'Travel date is missing');
    elsif v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      v_msgs := array_append(v_msgs, format('Travel date "%s" not recognised', left(v_raw, 30)));
    else
      begin v_dep := v_raw::date; exception when others then v_msgs := array_append(v_msgs, format('Travel date "%s" is not a real date', v_raw)); end;
    end if;
    if v_dep is not null and (v_dep < date '2000-01-01' or v_dep > current_date + 730) then
      v_msgs := array_append(v_msgs, 'Travel date is out of range'); v_dep := null;
    end if;

    v_raw := btrim(coalesce(v_row ->> 'return_date', ''));
    if v_raw <> '' then
      if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
        begin v_ret := v_raw::date; exception when others then v_msgs := array_append(v_msgs, 'Warning: return date ignored (not a real date)'); end;
      else
        v_msgs := array_append(v_msgs, 'Warning: return date ignored (not recognised)');
      end if;
      if v_ret is not null and v_dep is not null and v_ret < v_dep then
        v_msgs := array_append(v_msgs, 'Return date is before the travel date');
      end if;
    end if;

    if v_origin is null then v_msgs := array_append(v_msgs, 'From is missing'); end if;
    if v_dest is null then v_msgs := array_append(v_msgs, 'To is missing'); end if;

    -- Amount
    v_raw := replace(replace(replace(btrim(coalesce(v_row ->> 'amount', '')), ',', ''), '₹', ''), ' ', '');
    v_raw := regexp_replace(v_raw, '^(INR|Rs\.?)', '', 'i');
    if v_raw = '' then
      v_msgs := array_append(v_msgs, 'Warning: amount is missing');
    elsif v_raw !~ '^\d{1,10}(\.\d{1,2})?$' then
      v_msgs := array_append(v_msgs, format('Amount "%s" is not a valid number', left(v_row ->> 'amount', 30)));
    else
      v_amount := v_raw::numeric;
    end if;

    if v_currency !~ '^[A-Z]{3}$' then
      v_msgs := array_append(v_msgs, 'Warning: currency not recognised, using INR'); v_currency := 'INR';
    end if;
    if v_type_raw is not null and private.map_booking_type(v_type_raw) = 'other' then
      v_msgs := array_append(v_msgs, format('Warning: travel mode "%s" saved as other', v_type_raw));
    end if;
    if v_ref is null then
      v_msgs := array_append(v_msgs, 'Warning: no PNR / booking reference');
    end if;

    -- Status: any message without "Warning:" is a blocking error.
    if exists (select 1 from unnest(v_msgs) m where m not like 'Warning:%') then
      v_status := 'error';
    elsif v_profile is not null and v_dep is not null and v_ref is not null and (
      exists (select 1 from public.travel_records r
               where r.employee_id = v_profile and r.departure_date = v_dep and r.booking_reference = v_ref)
      or exists (select 1 from public.import_rows ir
                  where ir.batch_id = v_batch and ir.profile_id = v_profile
                    and ir.departure_date = v_dep and ir.booking_reference = v_ref and ir.status <> 'error')) then
      v_status := 'duplicate';
      v_msgs := array_append(v_msgs, 'Already recorded (same employee, date and PNR)');
    elsif v_profile is not null and v_dep is not null and exists (
      select 1 from public.travel_records r
       where r.employee_id = v_profile and r.departure_date = v_dep
         and lower(r.origin) = lower(v_origin) and lower(r.destination) = lower(v_dest)) then
      v_status := 'warning';
      v_msgs := array_append(v_msgs, 'Warning: a similar trip already exists for this day');
    elsif cardinality(v_msgs) > 0 then
      v_status := 'warning';
    else
      v_status := 'valid';
    end if;

    insert into public.import_rows (
      batch_id, row_number, employee_code, employee_name, profile_id, origin, destination,
      departure_date, return_date, provider, booking_reference, ticket_number, amount,
      currency, booking_type, status, messages)
    values (
      v_batch, v_n, v_code, v_name, v_profile, v_origin, v_dest, v_dep,
      case when v_ret >= v_dep then v_ret end, v_provider, v_ref, v_ticket, v_amount,
      v_currency, private.map_booking_type(v_type_raw), v_status, v_msgs);
  end loop;

  update public.import_batches b set
    total_rows     = s.total,
    valid_rows     = s.valid,
    warning_rows   = s.warning,
    error_rows     = s.error,
    duplicate_rows = s.duplicate
  from (
    select count(*) as total,
           count(*) filter (where status = 'valid') as valid,
           count(*) filter (where status = 'warning') as warning,
           count(*) filter (where status = 'error') as error,
           count(*) filter (where status = 'duplicate') as duplicate
      from public.import_rows where batch_id = v_batch
  ) s
  where b.id = v_batch;

  perform private.write_audit('import_staged', 'import_batches', v_batch::text,
    (select jsonb_build_object('rows', total_rows, 'errors', error_rows, 'duplicates', duplicate_rows)
       from public.import_batches where id = v_batch));
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_commit: after a person confirms, insert valid (and optionally
-- warning) rows. Errors and duplicates are never imported.
-- ---------------------------------------------------------------------------
create or replace function public.import_commit(p_batch uuid, p_include_warnings boolean default true)
returns public.import_batches
language plpgsql security definer
set search_path = ''
as $$
declare
  v_b public.import_batches;
  v_r public.import_rows;
  v_id uuid;
  v_imported integer := 0;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_b from public.import_batches where id = p_batch for update;
  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  if v_b.status <> 'staged' then
    raise exception 'This import was already %', v_b.status using errcode = '22023';
  end if;

  for v_r in
    select * from public.import_rows
     where batch_id = p_batch
       and (status = 'valid' or (p_include_warnings and status = 'warning'))
     order by row_number
  loop
    v_id := null;
    insert into public.travel_records (
      employee_id, origin, destination, departure_date, return_date, airline_or_provider,
      booking_reference, ticket_number, amount, currency, booking_type, status, source, created_by)
    values (
      v_r.profile_id, v_r.origin, v_r.destination, v_r.departure_date, v_r.return_date, v_r.provider,
      v_r.booking_reference, v_r.ticket_number, v_r.amount, v_r.currency, v_r.booking_type,
      case when v_r.departure_date < current_date then 'completed' else 'confirmed' end,
      'import', auth.uid())
    on conflict (employee_id, departure_date, booking_reference) where booking_reference is not null
    do nothing
    returning id into v_id;

    if v_id is null then
      update public.import_rows set status = 'duplicate',
             messages = array_append(messages, 'Already recorded when importing')
       where id = v_r.id;
    else
      update public.import_rows set status = 'imported', travel_record_id = v_id where id = v_r.id;
      v_imported := v_imported + 1;
    end if;
  end loop;

  update public.import_rows set status = 'skipped'
   where batch_id = p_batch and status in ('valid', 'warning');

  update public.import_batches
     set status = 'committed', committed_at = now(), imported_rows = v_imported
   where id = p_batch
  returning * into v_b;

  perform private.write_audit('import_committed', 'import_batches', p_batch::text,
    jsonb_build_object('imported', v_imported, 'rows', v_b.total_rows, 'include_warnings', p_include_warnings));
  return v_b;
end;
$$;

create or replace function public.import_cancel(p_batch uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.import_batches set status = 'cancelled' where id = p_batch and status = 'staged';
  if not found then
    raise exception 'Import not found or already finished' using errcode = 'P0002';
  end if;
  perform private.write_audit('import_cancelled', 'import_batches', p_batch::text, '{}'::jsonb);
end;
$$;

revoke all on function public.import_stage(text, text, jsonb, jsonb) from public, anon;
revoke all on function public.import_commit(uuid, boolean) from public, anon;
revoke all on function public.import_cancel(uuid) from public, anon;
grant execute on function public.import_stage(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.import_commit(uuid, boolean) to authenticated;
grant execute on function public.import_cancel(uuid) to authenticated;
revoke all on function private.clean_text(text, integer) from public;
revoke all on function private.map_booking_type(text) from public;
grant execute on function private.clean_text(text, integer), private.map_booking_type(text) to authenticated;
