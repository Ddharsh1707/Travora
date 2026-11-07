-- =============================================================================
-- Travel desk: upload employee travel Excel, see a report for each upload
--
-- Builds on the Phase 3 import (import_stage → preview → import_commit):
--  * A "Department" column is now understood.
--  * Optionally, employees who are not in the system yet are added during the
--    import (as plain employees with no login), so a real company sheet does
--    not fail row by row. This must be switched on per upload.
--  * Every imported trip remembers which upload it came from, so the travel
--    desk can open a report for one file: totals, charts, routes and every
--    employee in it, with a link to that employee's full travel history.
-- Only Travel Desk / CEO (admin) can upload or see upload reports. Employees
-- still see only their own trips through the existing RLS policies.
-- =============================================================================

-- Safe to run more than once.
alter table public.import_batches
  add column if not exists create_missing_employees boolean not null default false,
  add column if not exists created_employees integer not null default 0;

alter table public.import_rows
  add column if not exists department text check (department is null or char_length(department) <= 120),
  add column if not exists new_employee boolean not null default false;

alter table public.travel_records
  add column if not exists import_batch_id uuid references public.import_batches (id) on delete set null;
create index if not exists travel_records_import_batch_idx on public.travel_records (import_batch_id) where import_batch_id is not null;

-- Only import_commit() may set which upload a trip came from.
create or replace function private.guard_import_batch_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.import_batch_id := null;
    else
      new.import_batch_id := old.import_batch_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists travel_records_import_batch_guard on public.travel_records;
create trigger travel_records_import_batch_guard
  before insert or update on public.travel_records
  for each row execute function private.guard_import_batch_link();

-- ---------------------------------------------------------------------------
-- import_stage, now with department and "add missing employees".
-- The old 4-argument version is replaced; existing callers still work because
-- the new argument has a default.
-- ---------------------------------------------------------------------------
drop function if exists public.import_stage(text, text, jsonb, jsonb);

create or replace function public.import_stage(
  p_filename text, p_file_kind text, p_mapping jsonb, p_rows jsonb,
  p_create_missing boolean default false
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
  v_new boolean;
  v_code text; v_name text; v_dept text; v_profile uuid; v_active boolean; v_matches integer;
  v_dep date; v_ret date; v_amount numeric; v_raw text;
  v_origin text; v_dest text; v_ref text; v_ticket text; v_provider text; v_currency text; v_type_raw text;
  v_create boolean := coalesce(p_create_missing, false);
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

  insert into public.import_batches (original_filename, file_kind, column_mapping, create_missing_employees)
  values (coalesce(private.clean_text(p_filename, 255), 'upload'), p_file_kind,
          coalesce(p_mapping, '{}'::jsonb), v_create)
  returning id into v_batch;

  for v_row, v_n in select value, ordinality::integer from jsonb_array_elements(p_rows) with ordinality loop
    v_msgs := '{}';
    v_new := false;
    v_profile := null; v_active := null; v_dep := null; v_ret := null; v_amount := null;

    if jsonb_typeof(v_row) <> 'object' then
      insert into public.import_rows (batch_id, row_number, status, messages)
      values (v_batch, v_n, 'error', array['Row could not be read']);
      continue;
    end if;

    v_code     := private.clean_text(v_row ->> 'employee_code', 32);
    v_name     := private.clean_text(v_row ->> 'employee_name', 200);
    v_dept     := private.clean_text(v_row ->> 'department', 120);
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
        if not v_create then
          v_msgs := array_append(v_msgs, format('Employee ID %s not found', v_code));
        elsif v_code !~ '^[A-Za-z0-9._-]{2,32}$' then
          v_msgs := array_append(v_msgs, format('Employee ID "%s" cannot be used for a new employee (letters, numbers, . _ - only)', v_code));
        elsif v_name is null then
          v_msgs := array_append(v_msgs, format('Employee ID %s not found; add the employee name to create them', v_code));
        else
          v_new := true;
          v_msgs := array_append(v_msgs, format('Warning: new employee %s (%s) will be added', v_name, v_code));
        end if;
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
      elsif v_create then
        -- No ID in the sheet: give the new employee a stable generated ID, so
        -- every row with the same name lands on the same person.
        v_code := 'NEW-' || upper(substr(md5(lower(v_name)), 1, 8));
        v_new := true;
        v_msgs := array_append(v_msgs, format('Warning: new employee %s will be added with ID %s', v_name, v_code));
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
    elsif v_dep is not null and v_ref is not null and (
      (v_profile is not null and exists (select 1 from public.travel_records r
               where r.employee_id = v_profile and r.departure_date = v_dep and r.booking_reference = v_ref))
      or exists (select 1 from public.import_rows ir
                  where ir.batch_id = v_batch
                    and ((v_profile is not null and ir.profile_id = v_profile)
                         or (v_new and ir.new_employee and lower(ir.employee_code) = lower(v_code)))
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
      batch_id, row_number, employee_code, employee_name, department, new_employee, profile_id, origin, destination,
      departure_date, return_date, provider, booking_reference, ticket_number, amount,
      currency, booking_type, status, messages)
    values (
      v_batch, v_n, v_code, v_name, v_dept, v_new and v_status <> 'error', v_profile, v_origin, v_dest, v_dep,
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
    (select jsonb_build_object('rows', total_rows, 'errors', error_rows, 'duplicates', duplicate_rows,
                               'create_missing_employees', create_missing_employees)
       from public.import_batches where id = v_batch));
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_commit: as before, plus it adds new employees (when the upload asked
-- for it) and tags every trip with the upload it came from.
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
  v_profile uuid;
  v_imported integer := 0;
  v_created integer := 0;
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
    v_profile := v_r.profile_id;

    if v_profile is null and v_r.new_employee and v_b.create_missing_employees then
      select p.id into v_profile from public.profiles p where lower(p.employee_id) = lower(v_r.employee_code);
      if v_profile is null then
        insert into public.profiles (employee_id, full_name, department)
        values (v_r.employee_code, coalesce(v_r.employee_name, v_r.employee_code), v_r.department)
        returning id into v_profile;
        v_created := v_created + 1;
      end if;
      update public.import_rows set profile_id = v_profile where id = v_r.id;
    end if;

    if v_profile is null then
      update public.import_rows set status = 'skipped',
             messages = array_append(messages, 'Employee could not be matched')
       where id = v_r.id;
      continue;
    end if;

    insert into public.travel_records (
      employee_id, origin, destination, departure_date, return_date, airline_or_provider,
      booking_reference, ticket_number, amount, currency, booking_type, status, source, created_by)
    values (
      v_profile, v_r.origin, v_r.destination, v_r.departure_date, v_r.return_date, v_r.provider,
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
      -- Runs as the function owner, so the guard trigger keeps this value.
      update public.travel_records set import_batch_id = p_batch where id = v_id;
      update public.import_rows set status = 'imported', travel_record_id = v_id where id = v_r.id;
      v_imported := v_imported + 1;
    end if;
  end loop;

  update public.import_rows set status = 'skipped'
   where batch_id = p_batch and status in ('valid', 'warning');

  update public.import_batches
     set status = 'committed', committed_at = now(), imported_rows = v_imported, created_employees = v_created
   where id = p_batch
  returning * into v_b;

  perform private.write_audit('import_committed', 'import_batches', p_batch::text,
    jsonb_build_object('imported', v_imported, 'rows', v_b.total_rows, 'include_warnings', p_include_warnings,
                       'created_employees', v_created));
  return v_b;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_report: the report for one upload. Travel Desk / CEO only.
-- ---------------------------------------------------------------------------
create or replace function public.import_report(p_batch uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_b public.import_batches;
  v_result jsonb;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_b from public.import_batches where id = p_batch;
  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;

  with t as (
    select r.*, coalesce(p.department, 'Unassigned') as department, p.full_name, p.employee_id as employee_code
      from public.travel_records r
      join public.profiles p on p.id = r.employee_id
     where r.import_batch_id = p_batch
       and r.status <> 'cancelled'
  )
  select jsonb_build_object(
    'batch', jsonb_build_object(
        'id', v_b.id, 'original_filename', v_b.original_filename, 'status', v_b.status,
        'created_at', v_b.created_at, 'committed_at', v_b.committed_at,
        'total_rows', v_b.total_rows, 'imported_rows', v_b.imported_rows,
        'error_rows', v_b.error_rows, 'duplicate_rows', v_b.duplicate_rows,
        'created_employees', v_b.created_employees),
    'totals', (select jsonb_build_object(
        'trips', count(*),
        'travellers', count(distinct employee_id),
        'spend', coalesce(sum(amount), 0),
        'trips_without_cost', count(*) filter (where amount is null),
        'currencies', coalesce(jsonb_agg(distinct currency), '[]'::jsonb),
        'upcoming', count(*) filter (where departure_date > current_date),
        'first_date', min(departure_date),
        'last_date', max(departure_date))
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
    'top_routes', coalesce((select jsonb_agg(x) from (
        select initcap(btrim(origin)) as origin, initcap(btrim(destination)) as destination,
               count(*) as trips, coalesce(sum(amount), 0) as spend
          from t group by 1, 2 order by count(*) desc, sum(amount) desc nulls last limit 10) x), '[]'::jsonb),
    'top_providers', coalesce((select jsonb_agg(x) from (
        select coalesce(nullif(btrim(airline_or_provider), ''), 'Unknown') as provider, count(*) as trips, coalesce(sum(amount), 0) as spend
          from t group by 1 order by count(*) desc limit 10) x), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(x) from (
        select employee_id, employee_code, full_name, department, count(*) as trips,
               coalesce(sum(amount), 0) as spend, min(departure_date) as first_trip, max(departure_date) as last_trip
          from t group by 1, 2, 3, 4 order by sum(amount) desc nulls last, count(*) desc limit 2000) x), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Upload reports can be downloaded and are audited like the others.
create or replace function public.record_report_generated(p_report text, p_employee uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.current_app_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_report not in ('employee_travel_history', 'travel_search', 'travel_report', 'upload_report') then
    raise exception 'Unknown report' using errcode = '22023';
  end if;
  if p_employee is not null and not private.can_view_employee(p_employee) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.write_audit('report_generated', 'report', p_report,
    case when p_employee is null then '{}'::jsonb else jsonb_build_object('employee', p_employee) end);
end;
$$;

revoke all on function public.import_stage(text, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.import_stage(text, text, jsonb, jsonb, boolean) to authenticated;
revoke all on function public.import_commit(uuid, boolean) from public, anon;
grant execute on function public.import_commit(uuid, boolean) to authenticated;
revoke all on function public.import_report(uuid) from public, anon;
grant execute on function public.import_report(uuid) to authenticated;
revoke all on function public.record_report_generated(text, uuid) from public, anon;
grant execute on function public.record_report_generated(text, uuid) to authenticated;
revoke all on function private.guard_import_batch_link() from public;
