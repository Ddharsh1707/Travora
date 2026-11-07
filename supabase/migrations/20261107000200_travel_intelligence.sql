-- =============================================================================
-- Travel intelligence, part 1: smart upload of real company travel workbooks
--
-- What this adds (nothing is dropped, no existing row is rewritten):
--  * companies: the company the data belongs to. One row for now; new tables
--    carry company_id so more companies can be added later.
--  * projects + project_aliases: spreadsheet spellings ("HRRL RAJASTHAN",
--    "Liberia THOKADEH") are mapped to a project once and reused on every
--    upload. Nothing is mapped automatically.
--  * cost_lines: every charge on a booking (fare, add-on, reissue, hotel ...).
--    travel_records.amount stays the trip total, kept equal to the sum of its
--    recorded cost lines, so existing reports keep working and nothing is
--    counted twice.
--  * name_match_reviews: sheets without employee IDs. Each distinct person in
--    an upload is linked to an employee, added as new, or skipped by a person.
--  * import_stage_v2 / import_commit_v2: the multi-sheet upload. The older
--    import_stage / import_commit keep working unchanged.
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Company
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 200),
  base_currency  char(3) not null default 'INR' check (base_currency ~ '^[A-Z]{3}$'),
  created_at     timestamptz not null default now()
);

insert into public.companies (name)
select 'Company' where not exists (select 1 from public.companies);

create or replace function private.default_company_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select c.id from public.companies c order by c.created_at, c.id limit 1
$$;

alter table public.companies enable row level security;
revoke all on public.companies from anon, public;
revoke insert, update, delete on public.companies from authenticated;
grant select on public.companies to authenticated;
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated using (private.current_app_role() is not null);

-- ---------------------------------------------------------------------------
-- Text helpers
-- ---------------------------------------------------------------------------
-- "Liberia  THOKADEH " -> "liberia thokadeh"
create or replace function private.alias_key(v text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(v, '')), '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- A person's name as a comparable key. Handles the airline style
-- "KETA/RAJU MR" and "MR. RAJU KETA" (both -> "KETA RAJU"), titles, stray
-- digits and spacing. Words are sorted, so word order does not matter, but
-- every word must match: "P SATHEESH" and "SATHEESH PONNUSAMY" stay different.
create or replace function private.person_name_key(v text)
returns text
language sql immutable
set search_path = ''
as $$
  with s as (
    select upper(coalesce(v, '')) as t
  ), swapped as (
    select case when position('/' in t) > 0
                then split_part(t, '/', 2) || ' ' || split_part(t, '/', 1)
                else t end as t
      from s
  ), words as (
    select w
      from swapped, regexp_split_to_table(regexp_replace(swapped.t, '[^A-Z]+', ' ', 'g'), ' ') as w
     where w <> '' and w not in ('MR', 'MRS', 'MS', 'MISS', 'MSTR', 'DR', 'SHRI', 'SMT', 'PAX')
  )
  select nullif(string_agg(w, ' ' order by w), '') from words
$$;

create index if not exists profiles_name_key_idx on public.profiles (private.person_name_key(full_name));

-- ---------------------------------------------------------------------------
-- Projects and the spreadsheet spellings that point to them
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  code         text check (code is null or char_length(btrim(code)) between 1 and 64),
  name         text not null check (char_length(btrim(name)) between 1 and 200),
  kind         text not null default 'project' check (kind in ('project', 'cost_centre', 'event', 'other')),
  client       text check (client is null or char_length(client) <= 200),
  site         text check (site is null or char_length(site) <= 200),
  country      text check (country is null or char_length(country) <= 80),
  status       text not null default 'unknown' check (status in ('active', 'completed', 'on_hold', 'unknown')),
  start_date   date,
  end_date     date,
  notes        text check (notes is null or char_length(notes) <= 2000),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint projects_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index if not exists projects_name_uidx on public.projects (company_id, lower(btrim(name)));
create unique index if not exists projects_code_uidx on public.projects (company_id, lower(btrim(code))) where code is not null;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists audit_projects on public.projects;
create trigger audit_projects
  after insert or update or delete on public.projects
  for each row execute function private.audit_row_change();

create table if not exists public.project_aliases (
  id          bigint generated always as identity primary key,
  company_id  uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  alias_key   text not null check (char_length(alias_key) between 1 and 200),
  label       text not null check (char_length(label) between 1 and 200),
  project_id  uuid not null references public.projects (id) on delete cascade,
  mapped_by   uuid references auth.users (id) on delete set null default auth.uid(),
  mapped_at   timestamptz not null default now(),
  unique (company_id, alias_key)
);
create index if not exists project_aliases_project_idx on public.project_aliases (project_id);

alter table public.projects        enable row level security;
alter table public.project_aliases enable row level security;
revoke all on public.projects, public.project_aliases from anon, public;
revoke insert, update, delete on public.projects, public.project_aliases from authenticated;
grant select on public.projects, public.project_aliases to authenticated;

-- Staff and approvers can read projects; changes go through the functions below.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (private.has_role('travel_desk', 'admin', 'approver'));
drop policy if exists project_aliases_select on public.project_aliases;
create policy project_aliases_select on public.project_aliases
  for select to authenticated using (private.has_role('travel_desk', 'admin', 'approver'));

-- ---------------------------------------------------------------------------
-- Trips: the extra facts real company sheets carry
-- ---------------------------------------------------------------------------
alter table public.travel_records
  add column if not exists project_id          uuid references public.projects (id) on delete set null,
  add column if not exists project_source      text check (project_source is null or project_source in ('alias', 'manual')),
  add column if not exists project_raw         text check (project_raw is null or char_length(project_raw) <= 200),
  add column if not exists purpose             text check (purpose is null or char_length(purpose) <= 500),
  add column if not exists route               text check (route is null or char_length(route) <= 300),
  add column if not exists booking_date        date,
  add column if not exists requisition_date    date,
  add column if not exists requisition_channel text check (requisition_channel is null or char_length(requisition_channel) <= 120),
  add column if not exists approved_by_text    text check (approved_by_text is null or char_length(approved_by_text) <= 120),
  add column if not exists consultant          text check (consultant is null or char_length(consultant) <= 120),
  add column if not exists payment_mode        text check (payment_mode is null or char_length(payment_mode) <= 120),
  add column if not exists source_sheet        text check (source_sheet is null or char_length(source_sheet) <= 120),
  add column if not exists source_row          integer,
  add column if not exists notes               text[] not null default '{}',
  add column if not exists extra               jsonb not null default '{}'::jsonb;

create index if not exists travel_records_project_idx on public.travel_records (project_id, departure_date);
create index if not exists travel_records_project_raw_idx on public.travel_records (private.alias_key(project_raw)) where project_id is null;

-- A hotel stay or a cab has a place, not a route.
alter table public.travel_records alter column origin drop not null;

-- More honest statuses for imported bookings.
alter table public.travel_records drop constraint if exists travel_records_status_check;
alter table public.travel_records add constraint travel_records_status_check
  check (status in ('confirmed', 'cancelled', 'completed', 'no_show', 'reissued', 'refunded'));

-- Only the project functions may set which project a trip belongs to.
create or replace function private.guard_trip_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.project_id := null;
      new.project_source := null;
    else
      new.project_id := old.project_id;
      new.project_source := old.project_source;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists travel_records_project_guard on public.travel_records;
create trigger travel_records_project_guard
  before insert or update on public.travel_records
  for each row execute function private.guard_trip_project();

-- ---------------------------------------------------------------------------
-- Cost lines: every charge on a booking
-- ---------------------------------------------------------------------------
create table if not exists public.cost_lines (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  travel_record_id  uuid not null references public.travel_records (id) on delete cascade,
  line_type         text not null default 'fare' check (line_type in (
                      'fare', 'addon', 'reissue', 'change_fee', 'cancellation_fee', 'refund',
                      'hotel', 'cab', 'visa', 'forex', 'other')),
  amount            numeric(12, 2) check (amount is null or amount between -10000000 and 10000000),
  currency          char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  basis             text not null default 'actual' check (basis in ('actual', 'estimated')),
  -- recorded = a number was in the sheet; zero = the sheet said 0;
  -- missing = blank; included_in_group = covered by a shared (merged) cost
  amount_state      text not null default 'recorded'
                    check (amount_state in ('recorded', 'zero', 'missing', 'included_in_group')),
  group_key         text check (group_key is null or char_length(group_key) <= 120),
  description       text check (description is null or char_length(description) <= 500),
  import_batch_id   uuid references public.import_batches (id) on delete set null,
  source_sheet      text check (source_sheet is null or char_length(source_sheet) <= 120),
  source_row        integer,
  fingerprint       text unique check (fingerprint is null or char_length(fingerprint) <= 64),
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint cost_lines_amount_state check (
    (amount_state = 'recorded' and amount is not null and amount <> 0)
    or (amount_state = 'zero' and amount = 0)
    or (amount_state in ('missing', 'included_in_group') and amount is null))
);
create index if not exists cost_lines_record_idx on public.cost_lines (travel_record_id);
create index if not exists cost_lines_batch_idx  on public.cost_lines (import_batch_id) where import_batch_id is not null;

alter table public.cost_lines enable row level security;
revoke all on public.cost_lines from anon, public;
revoke insert, update, delete on public.cost_lines from authenticated;
grant select on public.cost_lines to authenticated;
drop policy if exists cost_lines_select on public.cost_lines;
create policy cost_lines_select on public.cost_lines
  for select to authenticated
  using (exists (select 1 from public.travel_records r
                  where r.id = travel_record_id and private.can_view_employee(r.employee_id)));

drop trigger if exists audit_cost_lines on public.cost_lines;
create trigger audit_cost_lines
  after insert or update or delete on public.cost_lines
  for each row execute function private.audit_row_change();

-- Keeps travel_records.amount equal to the sum of its recorded cost lines.
create or replace function private.refresh_trip_amount(p_record uuid)
returns void
language sql security definer
set search_path = ''
as $$
  update public.travel_records r
     set amount = s.total
    from (select case when count(*) filter (where amount_state in ('recorded', 'zero')) = 0 then null
                      else greatest(coalesce(sum(amount) filter (where amount_state in ('recorded', 'zero')), 0), 0) end as total
            from public.cost_lines where travel_record_id = p_record) s
   where r.id = p_record
$$;

-- ---------------------------------------------------------------------------
-- Upload staging: the extra facts per row and per file
-- ---------------------------------------------------------------------------
alter table public.import_batches
  add column if not exists format_version    integer not null default 1,
  add column if not exists assumed_currency  char(3),
  add column if not exists sheets            jsonb not null default '[]'::jsonb;

-- The old staging table insisted on From/To; hotel and cab lines have no route.
alter table public.import_rows
  add column if not exists sheet_name     text check (sheet_name is null or char_length(sheet_name) <= 120),
  add column if not exists source_row     integer,
  add column if not exists name_key       text,
  add column if not exists project_raw    text check (project_raw is null or char_length(project_raw) <= 200),
  add column if not exists line_type      text,
  add column if not exists amount_state   text,
  add column if not exists group_key      text,
  add column if not exists record_status  text,
  add column if not exists fingerprint    text,
  add column if not exists details        jsonb not null default '{}'::jsonb,
  add column if not exists raw            jsonb not null default '{}'::jsonb;
create index if not exists import_rows_name_key_idx on public.import_rows (batch_id, name_key);

create table if not exists public.name_match_reviews (
  id                    bigint generated always as identity primary key,
  batch_id              uuid not null references public.import_batches (id) on delete cascade,
  name_key              text not null,
  display_name          text not null,
  raw_names             text[] not null default '{}',
  employee_code         text,
  department            text,
  row_count             integer not null default 0,
  suggested_profile_id  uuid references public.profiles (id) on delete set null,
  match_reason          text,
  decision              text not null default 'pending' check (decision in ('pending', 'link', 'create', 'skip')),
  profile_id            uuid references public.profiles (id) on delete set null,
  decided_by            uuid references auth.users (id) on delete set null,
  decided_at            timestamptz,
  unique (batch_id, name_key)
);

alter table public.name_match_reviews enable row level security;
revoke all on public.name_match_reviews from anon, public;
revoke insert, update, delete on public.name_match_reviews from authenticated;
grant select on public.name_match_reviews to authenticated;
drop policy if exists name_match_reviews_select on public.name_match_reviews;
create policy name_match_reviews_select on public.name_match_reviews
  for select to authenticated using (private.is_staff());

-- ---------------------------------------------------------------------------
-- import_stage_v2: check every row of a multi-sheet workbook, save a preview.
--
-- p_sheets: what the browser found per sheet (kind, header row, mapped and
--   unmapped columns, skipped blocks). Saved for the upload's history.
-- p_rows: one object per booking line, with string values:
--   kind (flight|train|bus|cab|hotel|visa|forex|other), sheet, source_row,
--   employee_code, employee_name, display_name, department,
--   departure_date, return_date, booking_date, requisition_date (YYYY-MM-DD),
--   origin, destination, route, provider, booking_reference, ticket_number,
--   amount, currency, line_type, amount_state ('included_in_group' or empty),
--   group_key, record_status (cancelled|no_show|reissued|refunded or empty),
--   project, purpose, consultant, approved_by, requisition_channel,
--   payment_mode, notes (array), raw (object: every original cell, by header)
-- ---------------------------------------------------------------------------
create or replace function public.import_stage_v2(
  p_filename text, p_file_kind text, p_sheets jsonb, p_rows jsonb,
  p_create_missing boolean default false, p_currency text default 'INR'
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
  v_kind text; v_type public.travel_type;
  v_code text; v_name text; v_key text; v_profile uuid; v_active boolean; v_matches integer;
  v_dep date; v_ret date; v_req date; v_bdate date; v_amount numeric; v_raw text; v_state text;
  v_origin text; v_dest text; v_ref text; v_ticket text; v_currency text; v_line text; v_rstatus text;
  v_fp_base text; v_fp text; v_occ integer;
  v_default_currency text := upper(coalesce(nullif(btrim(p_currency), ''), 'INR'));
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
  if v_default_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter code such as INR' using errcode = '22023';
  end if;
  if p_sheets is not null and (jsonb_typeof(p_sheets) <> 'array' or octet_length(p_sheets::text) > 200000) then
    raise exception 'Sheet summary is not valid' using errcode = '22023';
  end if;

  insert into public.import_batches (original_filename, file_kind, column_mapping, create_missing_employees,
                                     format_version, assumed_currency, sheets)
  values (coalesce(private.clean_text(p_filename, 255), 'upload'), p_file_kind, '{}'::jsonb, v_create,
          2, v_default_currency, coalesce(p_sheets, '[]'::jsonb))
  returning id into v_batch;

  for v_row, v_n in select value, ordinality::integer from jsonb_array_elements(p_rows) with ordinality loop
    v_msgs := '{}';
    v_profile := null; v_active := null; v_dep := null; v_ret := null; v_req := null; v_bdate := null;
    v_amount := null; v_key := null;

    if jsonb_typeof(v_row) <> 'object' then
      insert into public.import_rows (batch_id, row_number, status, messages)
      values (v_batch, v_n, 'error', array['Row could not be read']);
      continue;
    end if;

    v_kind := lower(coalesce(private.clean_text(v_row ->> 'kind', 20), 'other'));
    if v_kind not in ('flight', 'train', 'bus', 'cab', 'hotel', 'visa', 'forex', 'other') then v_kind := 'other'; end if;
    v_type := case v_kind when 'flight' then 'flight' when 'train' then 'train' when 'bus' then 'bus'
                          when 'cab' then 'cab' when 'hotel' then 'hotel' else 'other' end::public.travel_type;

    v_code     := private.clean_text(v_row ->> 'employee_code', 32);
    v_name     := private.clean_text(v_row ->> 'employee_name', 200);
    v_origin   := private.clean_text(v_row ->> 'origin', 120);
    v_dest     := private.clean_text(v_row ->> 'destination', 120);
    v_ref      := upper(private.clean_text(v_row ->> 'booking_reference', 64));
    v_ticket   := private.clean_text(v_row ->> 'ticket_number', 64);
    v_currency := upper(coalesce(private.clean_text(v_row ->> 'currency', 3), v_default_currency));
    v_line     := lower(coalesce(private.clean_text(v_row ->> 'line_type', 20), ''));
    v_rstatus  := lower(coalesce(private.clean_text(v_row ->> 'record_status', 20), ''));
    if v_line not in ('fare', 'addon', 'reissue', 'change_fee', 'cancellation_fee', 'refund', 'hotel', 'cab', 'visa', 'forex', 'other') then
      v_line := case v_kind when 'hotel' then 'hotel' when 'cab' then 'cab' when 'visa' then 'visa' when 'forex' then 'forex' else 'fare' end;
    end if;
    if v_rstatus not in ('cancelled', 'no_show', 'reissued', 'refunded') then v_rstatus := null; end if;

    -- Who travelled: employee ID first, then the same name (every word).
    if v_code is not null then
      select p.id, p.active into v_profile, v_active from public.profiles p where lower(p.employee_id) = lower(v_code);
      v_key := 'ID:' || upper(v_code);
      if v_profile is null then
        if v_name is null then
          v_msgs := array_append(v_msgs, format('Employee ID %s not found and no name given', v_code));
        elsif v_code !~ '^[A-Za-z0-9._-]{2,32}$' then
          v_msgs := array_append(v_msgs, format('Employee ID "%s" cannot be used (letters, numbers, . _ - only)', v_code));
        else
          v_msgs := array_append(v_msgs, 'Warning: employee ID not found yet; review on the People step');
        end if;
      end if;
    elsif v_name is not null then
      v_key := private.person_name_key(v_name);
      if v_key is null then
        v_msgs := array_append(v_msgs, format('Traveller name "%s" could not be read', left(v_name, 40)));
      else
        select count(*) into v_matches from public.profiles p where private.person_name_key(p.full_name) = v_key;
        if v_matches = 1 then
          select p.id, p.active into v_profile, v_active from public.profiles p where private.person_name_key(p.full_name) = v_key;
          v_msgs := array_append(v_msgs, 'Warning: matched by name; confirm on the People step');
        else
          v_msgs := array_append(v_msgs, 'Warning: person needs review on the People step');
        end if;
      end if;
    else
      v_msgs := array_append(v_msgs, 'Traveller is missing');
    end if;
    if v_active is false then
      v_msgs := array_append(v_msgs, 'Warning: employee is deactivated');
    end if;

    -- Dates (the browser sends YYYY-MM-DD)
    v_raw := btrim(coalesce(v_row ->> 'departure_date', ''));
    if v_raw = '' then
      v_msgs := array_append(v_msgs, case v_kind when 'hotel' then 'Check-in date is missing' else 'Travel date is missing' end);
    elsif v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      v_msgs := array_append(v_msgs, format('Date "%s" not recognised', left(v_raw, 30)));
    else
      begin v_dep := v_raw::date; exception when others then v_msgs := array_append(v_msgs, format('Date "%s" is not a real date', v_raw)); end;
    end if;
    if v_dep is not null and (v_dep < date '2000-01-01' or v_dep > current_date + 730) then
      v_msgs := array_append(v_msgs, 'Travel date is out of range'); v_dep := null;
    end if;
    v_raw := btrim(coalesce(v_row ->> 'return_date', ''));
    if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin v_ret := v_raw::date; exception when others then v_ret := null; end;
      if v_ret is not null and v_dep is not null and v_ret < v_dep then
        v_msgs := array_append(v_msgs, 'Warning: return date is before the travel date and was ignored'); v_ret := null;
      end if;
    end if;
    v_raw := btrim(coalesce(v_row ->> 'requisition_date', ''));
    if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then begin v_req := v_raw::date; exception when others then v_req := null; end; end if;
    v_raw := btrim(coalesce(v_row ->> 'booking_date', ''));
    if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then begin v_bdate := v_raw::date; exception when others then v_bdate := null; end; end if;

    -- Places
    if v_kind in ('flight', 'train', 'bus') and v_origin is null then
      v_msgs := array_append(v_msgs, 'From is missing');
    end if;
    if v_dest is null and v_kind not in ('visa', 'forex') then
      v_msgs := array_append(v_msgs, case when v_kind in ('hotel', 'cab') then 'Place is missing' else 'To is missing' end);
    end if;

    -- Cost
    v_raw := replace(replace(replace(btrim(coalesce(v_row ->> 'amount', '')), ',', ''), '₹', ''), ' ', '');
    v_raw := regexp_replace(v_raw, '^(INR|Rs\.?)', '', 'i');
    if v_raw = '' then
      if lower(coalesce(v_row ->> 'amount_state', '')) = 'included_in_group' then
        v_state := 'included_in_group';
      else
        v_state := 'missing';
        v_msgs := array_append(v_msgs, 'Warning: cost is missing');
      end if;
    elsif v_raw !~ '^-?\d{1,10}(\.\d{1,2})?$' then
      v_msgs := array_append(v_msgs, format('Cost "%s" is not a valid number', left(v_row ->> 'amount', 30)));
      v_state := 'missing';
    else
      v_amount := v_raw::numeric;
      v_state := case when v_amount = 0 then 'zero' else 'recorded' end;
      if v_amount < 0 and v_line <> 'refund' then
        v_msgs := array_append(v_msgs, 'Warning: negative cost saved as a refund'); v_line := 'refund';
      end if;
    end if;
    if v_currency !~ '^[A-Z]{3}$' then
      v_msgs := array_append(v_msgs, format('Warning: currency not recognised, using %s', v_default_currency));
      v_currency := v_default_currency;
    end if;

    -- Parser notes from the browser (status words, shared costs, several travellers)
    if jsonb_typeof(v_row -> 'notes') = 'array' then
      select v_msgs || coalesce(array_agg('Warning: ' || left(x, 200)), '{}') into v_msgs
        from jsonb_array_elements_text(v_row -> 'notes') x;
    end if;

    -- Same line uploaded before? Identical lines inside one file (two equal
    -- add-on charges) stay separate because they are counted.
    v_fp_base := concat_ws('|', v_kind, coalesce(v_key, ''), coalesce(v_ref, ''), coalesce(v_dep::text, ''),
                           coalesce(v_amount::text, ''), v_line, coalesce(lower(v_dest), ''));
    select count(*) into v_occ from public.import_rows ir
     where ir.batch_id = v_batch and ir.details ->> 'fp_base' = v_fp_base;
    v_fp := md5(v_fp_base || '|' || v_occ);

    if exists (select 1 from unnest(v_msgs) m where m not like 'Warning:%') then
      v_status := 'error';
    elsif exists (select 1 from public.cost_lines c where c.fingerprint = v_fp) then
      v_status := 'duplicate';
      v_msgs := array_append(v_msgs, 'Already imported in an earlier upload');
    elsif v_profile is not null and v_dep is not null and v_ref is not null and exists (
      select 1 from public.travel_records r
       where r.employee_id = v_profile and r.departure_date = v_dep and r.booking_reference = v_ref
         and not exists (select 1 from public.cost_lines c where c.travel_record_id = r.id)) then
      v_status := 'duplicate';
      v_msgs := array_append(v_msgs, 'Already recorded (same person, date and PNR)');
    elsif cardinality(v_msgs) > 0 then
      v_status := 'warning';
    else
      v_status := 'valid';
    end if;

    insert into public.import_rows (
      batch_id, row_number, employee_code, employee_name, department, profile_id, origin, destination,
      departure_date, return_date, provider, booking_reference, ticket_number, amount, currency, booking_type,
      status, messages, sheet_name, source_row, name_key, project_raw, line_type, amount_state, group_key,
      record_status, fingerprint, details, raw)
    values (
      v_batch, v_n, v_code, v_name, private.clean_text(v_row ->> 'department', 120), v_profile, v_origin, v_dest,
      v_dep, v_ret, private.clean_text(v_row ->> 'provider', 120), v_ref, v_ticket, v_amount, v_currency, v_type,
      v_status, v_msgs,
      private.clean_text(v_row ->> 'sheet', 120),
      case when (v_row ->> 'source_row') ~ '^\d{1,7}$' then (v_row ->> 'source_row')::integer end,
      v_key, private.clean_text(v_row ->> 'project', 200), v_line, v_state,
      private.clean_text(v_row ->> 'group_key', 120), v_rstatus, v_fp,
      jsonb_strip_nulls(jsonb_build_object(
        'fp_base', v_fp_base, 'kind', v_kind,
        'display_name', private.clean_text(v_row ->> 'display_name', 200),
        'route', private.clean_text(v_row ->> 'route', 300),
        'purpose', private.clean_text(v_row ->> 'purpose', 500),
        'consultant', private.clean_text(v_row ->> 'consultant', 120),
        'approved_by', private.clean_text(v_row ->> 'approved_by', 120),
        'requisition_channel', private.clean_text(v_row ->> 'requisition_channel', 120),
        'payment_mode', private.clean_text(v_row ->> 'payment_mode', 120),
        'requisition_date', v_req, 'booking_date', v_bdate)),
      case when jsonb_typeof(v_row -> 'raw') = 'object' and octet_length((v_row -> 'raw')::text) <= 8000
           then v_row -> 'raw' else '{}'::jsonb end);
  end loop;

  -- One review line per distinct person who is not matched by employee ID.
  insert into public.name_match_reviews (batch_id, name_key, display_name, raw_names, employee_code, department,
                                         row_count, suggested_profile_id, match_reason, decision, profile_id)
  select v_batch, g.name_key, g.display_name, g.raw_names, g.employee_code, g.department, g.row_count,
         g.suggested, case when g.suggested is not null then 'Same name as an existing employee' end,
         case when g.suggested is not null then 'link' when v_create then 'create' else 'pending' end,
         g.suggested
    from (
      select ir.name_key,
             coalesce(mode() within group (order by ir.details ->> 'display_name'), min(ir.employee_name)) as display_name,
             array_agg(distinct ir.employee_name) filter (where ir.employee_name is not null) as raw_names,
             max(ir.employee_code) as employee_code,
             max(ir.department) as department,
             count(*)::integer as row_count,
             (array_agg(distinct ir.profile_id) filter (where ir.profile_id is not null))[1] as suggested,
             bool_or(ir.profile_id is not null and ir.employee_code is not null) as matched_by_id
        from public.import_rows ir
       where ir.batch_id = v_batch and ir.status <> 'error' and ir.name_key is not null
       group by ir.name_key
    ) g
   where not g.matched_by_id;

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
                               'format', 2, 'sheets', jsonb_array_length(sheets), 'currency', assumed_currency)
       from public.import_batches where id = v_batch));
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- People step: decide who each name in an upload is.
-- p_decisions: [{"name_key": "...", "decision": "link|create|skip", "profile_id": "..."}]
-- ---------------------------------------------------------------------------
create or replace function public.name_match_decide(p_batch uuid, p_decisions jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_d jsonb;
  v_decision text;
  v_profile uuid;
  v_n integer := 0;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.import_batches where id = p_batch and status = 'staged') then
    raise exception 'This upload is not waiting for review' using errcode = '22023';
  end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) > 5000 then
    raise exception 'Decisions are not valid' using errcode = '22023';
  end if;

  for v_d in select value from jsonb_array_elements(p_decisions) loop
    v_decision := lower(coalesce(v_d ->> 'decision', ''));
    if v_decision not in ('link', 'create', 'skip', 'pending') then
      raise exception 'Unknown decision "%"', left(v_decision, 20) using errcode = '22023';
    end if;
    v_profile := null;
    if v_decision = 'link' then
      v_profile := private.try_uuid(v_d ->> 'profile_id');
      if v_profile is null or not exists (select 1 from public.profiles where id = v_profile) then
        raise exception 'Choose the employee to link to' using errcode = '22023';
      end if;
    end if;
    update public.name_match_reviews
       set decision = v_decision, profile_id = v_profile,
           decided_by = auth.uid(), decided_at = now()
     where batch_id = p_batch and name_key = v_d ->> 'name_key';
    if found then v_n := v_n + 1; end if;
  end loop;

  perform private.write_audit('name_match_decided', 'import_batches', p_batch::text, jsonb_build_object('decisions', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Projects step
-- ---------------------------------------------------------------------------
-- The project names found in one upload, with what they are mapped to.
create or replace function public.import_projects(p_batch uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.rows desc, x.label)
      from (
        select private.alias_key(ir.project_raw) as alias_key,
               mode() within group (order by ir.project_raw) as label,
               count(*) as rows,
               coalesce(sum(ir.amount) filter (where ir.amount_state in ('recorded', 'zero')), 0) as amount,
               a.project_id, p.name as project_name, p.kind as project_kind
          from public.import_rows ir
          left join public.project_aliases a
                 on a.company_id = private.default_company_id() and a.alias_key = private.alias_key(ir.project_raw)
          left join public.projects p on p.id = a.project_id
         where ir.batch_id = p_batch and ir.status <> 'error' and private.alias_key(ir.project_raw) is not null
         group by 1, a.project_id, p.name, p.kind
      ) x), '[]'::jsonb);
end;
$$;

-- Creates a project (name and kind only; the CEO completes the details).
create or replace function public.project_create(p_name text, p_kind text default 'project', p_code text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := private.clean_text(p_name, 200);
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Project name is required' using errcode = '22023';
  end if;
  if coalesce(p_kind, 'project') not in ('project', 'cost_centre', 'event', 'other') then
    raise exception 'Unknown project type' using errcode = '22023';
  end if;
  select id into v_id from public.projects
   where company_id = private.default_company_id() and lower(btrim(name)) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;
  insert into public.projects (name, kind, code)
  values (v_name, coalesce(p_kind, 'project'), private.clean_text(p_code, 64))
  returning id into v_id;
  return v_id;
end;
$$;

-- Project details (status, client, dates). CEO only.
create or replace function public.project_update(
  p_id uuid, p_name text, p_kind text, p_code text, p_client text, p_site text, p_country text,
  p_status text, p_start date, p_end date, p_notes text
)
returns public.projects
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p public.projects;
begin
  if not private.has_role('admin') then
    raise exception 'Only the CEO can change project details' using errcode = '42501';
  end if;
  update public.projects set
    name = coalesce(private.clean_text(p_name, 200), name),
    kind = coalesce(p_kind, kind),
    code = private.clean_text(p_code, 64),
    client = private.clean_text(p_client, 200),
    site = private.clean_text(p_site, 200),
    country = private.clean_text(p_country, 80),
    status = coalesce(p_status, status),
    start_date = p_start,
    end_date = p_end,
    notes = private.clean_text(p_notes, 2000)
  where id = p_id
  returning * into v_p;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  return v_p;
end;
$$;

-- Maps a spreadsheet spelling to a project (or removes the mapping when
-- p_project is null). Trips already imported with that spelling follow,
-- unless someone assigned their project by hand.
create or replace function public.project_alias_set(p_alias text, p_project uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_key text := private.alias_key(p_alias);
  v_company uuid := private.default_company_id();
  v_n integer;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_key is null then
    raise exception 'Project name is empty' using errcode = '22023';
  end if;
  if p_project is null then
    delete from public.project_aliases where company_id = v_company and alias_key = v_key;
  else
    if not exists (select 1 from public.projects where id = p_project and company_id = v_company) then
      raise exception 'Project not found' using errcode = 'P0002';
    end if;
    insert into public.project_aliases (company_id, alias_key, label, project_id)
    values (v_company, v_key, coalesce(private.clean_text(p_alias, 200), v_key), p_project)
    on conflict (company_id, alias_key) do update
      set project_id = excluded.project_id, label = excluded.label, mapped_by = auth.uid(), mapped_at = now();
  end if;

  update public.travel_records r
     set project_id = p_project, project_source = case when p_project is null then null else 'alias' end
   where private.alias_key(r.project_raw) = v_key
     and (r.project_source is null or r.project_source = 'alias');
  get diagnostics v_n = row_count;

  perform private.write_audit('project_alias_set', 'project_aliases', v_key,
    jsonb_build_object('project', p_project, 'trips_updated', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_commit_v2: save the reviewed upload.
-- ---------------------------------------------------------------------------
create or replace function public.import_commit_v2(p_batch uuid, p_include_warnings boolean default true)
returns public.import_batches
language plpgsql security definer
set search_path = ''
as $$
declare
  v_b public.import_batches;
  v_r public.import_rows;
  v_rev public.name_match_reviews;
  v_profile uuid;
  v_record uuid;
  v_project uuid;
  v_code text;
  v_imported integer := 0;
  v_created integer := 0;
  v_line uuid;
  v_status text;
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
  if v_b.format_version <> 2 then
    raise exception 'Use import_commit for this upload' using errcode = '22023';
  end if;

  -- People first: create the new employees that were approved.
  for v_rev in select * from public.name_match_reviews where batch_id = p_batch and decision = 'create' loop
    v_code := coalesce(v_rev.employee_code, 'NEW-' || upper(substr(md5(v_rev.name_key), 1, 8)));
    select id into v_profile from public.profiles where lower(employee_id) = lower(v_code);
    if v_profile is null then
      insert into public.profiles (employee_id, full_name, department)
      values (v_code, v_rev.display_name, v_rev.department)
      returning id into v_profile;
      v_created := v_created + 1;
    end if;
    update public.name_match_reviews set profile_id = v_profile where id = v_rev.id;
  end loop;

  for v_r in
    select * from public.import_rows
     where batch_id = p_batch
       and (status = 'valid' or (p_include_warnings and status = 'warning'))
     order by row_number
  loop
    v_profile := null;
    v_record := null;

    if v_r.employee_code is not null and v_r.profile_id is not null then
      v_profile := v_r.profile_id;
    else
      select * into v_rev from public.name_match_reviews where batch_id = p_batch and name_key = v_r.name_key;
      if found and v_rev.decision in ('link', 'create') then
        v_profile := v_rev.profile_id;
      end if;
    end if;

    if v_profile is null then
      update public.import_rows set status = 'skipped',
             messages = array_append(messages, 'Person not confirmed on the People step')
       where id = v_r.id;
      continue;
    end if;

    if exists (select 1 from public.cost_lines where fingerprint = v_r.fingerprint) then
      update public.import_rows set status = 'duplicate', profile_id = v_profile,
             messages = array_append(messages, 'Already imported')
       where id = v_r.id;
      continue;
    end if;

    -- The same booking (person, date, PNR) gets one trip; extra lines are its charges.
    if v_r.booking_reference is not null then
      select id into v_record from public.travel_records
       where employee_id = v_profile and departure_date = v_r.departure_date and booking_reference = v_r.booking_reference;
    end if;

    if v_record is null then
      select a.project_id into v_project from public.project_aliases a
       where a.company_id = private.default_company_id() and a.alias_key = private.alias_key(v_r.project_raw);

      insert into public.travel_records (
        employee_id, origin, destination, departure_date, return_date, airline_or_provider,
        booking_reference, ticket_number, amount, currency, booking_type, status, source, created_by,
        project_raw, purpose, route, booking_date, requisition_date, requisition_channel,
        approved_by_text, consultant, payment_mode, source_sheet, source_row, notes, extra)
      values (
        v_profile, v_r.origin, coalesce(v_r.destination, 'Not recorded'), v_r.departure_date, v_r.return_date,
        v_r.provider, v_r.booking_reference, v_r.ticket_number, null, v_r.currency, v_r.booking_type,
        case when v_r.departure_date < current_date then 'completed' else 'confirmed' end,
        'import', auth.uid(),
        v_r.project_raw, v_r.details ->> 'purpose', v_r.details ->> 'route',
        (v_r.details ->> 'booking_date')::date, (v_r.details ->> 'requisition_date')::date,
        v_r.details ->> 'requisition_channel', v_r.details ->> 'approved_by', v_r.details ->> 'consultant',
        v_r.details ->> 'payment_mode', v_r.sheet_name, v_r.source_row,
        coalesce((select array_agg(substr(m, 10)) from unnest(v_r.messages) m
                   where m like 'Warning:%' and m not like 'Warning: matched by name%'
                     and m not like 'Warning: person needs review%'), '{}'),
        v_r.raw)
      returning id into v_record;

      -- Runs as the function owner, so the guard triggers keep these values.
      update public.travel_records
         set import_batch_id = p_batch,
             project_id = v_project,
             project_source = case when v_project is not null then 'alias' end
       where id = v_record;
    end if;

    insert into public.cost_lines (travel_record_id, line_type, amount, currency, amount_state, group_key,
                                   description, import_batch_id, source_sheet, source_row, fingerprint)
    values (v_record, coalesce(v_r.line_type, 'fare'), v_r.amount, v_r.currency, coalesce(v_r.amount_state, 'missing'),
            v_r.group_key, left(array_to_string(v_r.messages, '; '), 500), p_batch, v_r.sheet_name, v_r.source_row,
            v_r.fingerprint)
    on conflict (fingerprint) do nothing
    returning id into v_line;

    if v_line is null then
      update public.import_rows set status = 'duplicate', profile_id = v_profile,
             messages = array_append(messages, 'Already imported') where id = v_r.id;
      continue;
    end if;

    -- Status words from the sheet (CANCELLED, NO SHOW, reissue, refund).
    if v_r.record_status is not null then
      select status into v_status from public.travel_records where id = v_record;
      if v_status not in ('refunded', 'cancelled') or v_r.record_status = 'refunded' then
        update public.travel_records set status = v_r.record_status where id = v_record;
      end if;
    end if;

    perform private.refresh_trip_amount(v_record);
    update public.import_rows set status = 'imported', travel_record_id = v_record, profile_id = v_profile where id = v_r.id;
    v_imported := v_imported + 1;
  end loop;

  update public.import_rows set status = 'skipped'
   where batch_id = p_batch and status in ('valid', 'warning');

  update public.import_batches
     set status = 'committed', committed_at = now(), imported_rows = v_imported, created_employees = v_created
   where id = p_batch
  returning * into v_b;

  perform private.write_audit('import_committed', 'import_batches', p_batch::text,
    jsonb_build_object('imported', v_imported, 'rows', v_b.total_rows, 'include_warnings', p_include_warnings,
                       'created_employees', v_created, 'format', 2));
  return v_b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.import_stage_v2(text, text, jsonb, jsonb, boolean, text) from public, anon;
grant execute on function public.import_stage_v2(text, text, jsonb, jsonb, boolean, text) to authenticated;
revoke all on function public.import_commit_v2(uuid, boolean) from public, anon;
grant execute on function public.import_commit_v2(uuid, boolean) to authenticated;
revoke all on function public.name_match_decide(uuid, jsonb) from public, anon;
grant execute on function public.name_match_decide(uuid, jsonb) to authenticated;
revoke all on function public.import_projects(uuid) from public, anon;
grant execute on function public.import_projects(uuid) to authenticated;
revoke all on function public.project_create(text, text, text) from public, anon;
grant execute on function public.project_create(text, text, text) to authenticated;
revoke all on function public.project_update(uuid, text, text, text, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.project_update(uuid, text, text, text, text, text, text, text, date, date, text) to authenticated;
revoke all on function public.project_alias_set(text, uuid) from public, anon;
grant execute on function public.project_alias_set(text, uuid) to authenticated;
revoke all on function private.refresh_trip_amount(uuid) from public, authenticated;
revoke all on function private.guard_trip_project() from public;
