-- =============================================================================
-- Travel requests reach the CEO and the Admin together, and PDF uploads
--
-- 1. Employees describe the trip in more detail (project, preferred times,
--    hotel, contact, notes). They still cannot set status or approver.
-- 2. Every request is visible to the CEO and to every Admin at the same time.
--    Whoever decides first wins; the decision (who, when, why) is saved on the
--    request so the employee sees it on their own screen.
-- 3. Travel desk uploads accept PDF as well as Excel and CSV. The PDF is read
--    in the browser into the same rows as a sheet, so every check, the People
--    and Projects steps and the stored original file work the same way.
--
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. More trip details on a request
-- ---------------------------------------------------------------------------
alter table public.travel_requests
  add column if not exists project_name          text check (project_name is null or char_length(project_name) <= 200),
  add column if not exists preferred_time        text check (preferred_time is null or preferred_time in ('any', 'early_morning', 'morning', 'afternoon', 'evening', 'night')),
  add column if not exists return_preferred_time text check (return_preferred_time is null or return_preferred_time in ('any', 'early_morning', 'morning', 'afternoon', 'evening', 'night')),
  add column if not exists hotel_required        boolean not null default false,
  add column if not exists hotel_city            text check (hotel_city is null or char_length(hotel_city) <= 120),
  add column if not exists hotel_check_in        date,
  add column if not exists hotel_check_out       date,
  add column if not exists contact_phone         text check (contact_phone is null or contact_phone ~ '^[0-9+() -]{6,20}$'),
  add column if not exists notes                 text check (notes is null or char_length(notes) <= 2000),
  -- The decision, kept on the request so the employee can read it without
  -- being able to read the CEO's or Admin's profile.
  add column if not exists decided_by            uuid references public.profiles (id) on delete set null,
  add column if not exists decided_by_name       text check (decided_by_name is null or char_length(decided_by_name) <= 200),
  add column if not exists decided_by_role       text check (decided_by_role is null or decided_by_role in ('CEO', 'Admin', 'Manager')),
  add column if not exists decided_at            timestamptz,
  add column if not exists decision_comment      text check (decision_comment is null or char_length(decision_comment) <= 2000);

alter table public.travel_requests drop constraint if exists travel_requests_hotel_dates;
alter table public.travel_requests add constraint travel_requests_hotel_dates
  check (hotel_check_out is null or hotel_check_in is null or hotel_check_out >= hotel_check_in);

-- Only decide_travel_request() may write the decision columns.
create or replace function private.guard_request_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.decided_by := null; new.decided_by_name := null; new.decided_by_role := null;
      new.decided_at := null; new.decision_comment := null;
    else
      new.decided_by := old.decided_by; new.decided_by_name := old.decided_by_name;
      new.decided_by_role := old.decided_by_role; new.decided_at := old.decided_at;
      new.decision_comment := old.decision_comment;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists travel_requests_decision_guard on public.travel_requests;
create trigger travel_requests_decision_guard
  before insert or update on public.travel_requests
  for each row execute function private.guard_request_decision();

create index if not exists travel_requests_created_idx on public.travel_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. CEO and Admins decide together; first decision wins
-- ---------------------------------------------------------------------------
create or replace function public.decide_travel_request(
  p_request_id uuid,
  p_decision public.approval_status,
  p_comments text default null
)
returns public.travel_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me    uuid := private.current_profile_id();
  v_role  public.app_role := private.current_app_role();
  v_req   public.travel_requests;
  v_name  text;
  v_label text;
  v_note  text := nullif(btrim(p_comments), '');
begin
  if v_me is null or v_role::text not in ('approver', 'admin', 'company_admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_req from public.travel_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.employee_id = v_me then
    raise exception 'You cannot decide your own request' using errcode = '42501';
  end if;
  if v_role::text = 'approver'
     and v_req.approver_id is distinct from v_me
     and not exists (select 1 from public.profiles p
                     where p.id = v_req.employee_id and p.manager_id = v_me) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- An Admin cannot decide for the CEO or another Admin.
  if v_role::text = 'company_admin' and not private.can_manage_person(v_req.employee_id) then
    raise exception 'Only the CEO can decide requests from the CEO or an Admin' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception '%', format('This request was already %s by %s', v_req.status, coalesce(v_req.decided_by_name, 'someone else'))
      using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Comment too long' using errcode = '22001';
  end if;
  if p_decision = 'rejected' and v_note is null then
    raise exception 'Please give a reason for rejecting' using errcode = '22023';
  end if;

  select full_name into v_name from public.profiles where id = v_me;
  v_label := case v_role::text when 'admin' then 'CEO' when 'company_admin' then 'Admin' else 'Manager' end;

  insert into public.approvals (request_id, approver_id, status, comments)
  values (p_request_id, v_me, p_decision, v_note);

  update public.travel_requests
     set status = p_decision::text::public.request_status,
         approver_id = v_me,
         decided_by = v_me,
         decided_by_name = left(coalesce(v_name, v_label), 200),
         decided_by_role = v_label,
         decided_at = now(),
         decision_comment = v_note
   where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;
revoke all on function public.decide_travel_request(uuid, public.approval_status, text) from public, anon;
grant execute on function public.decide_travel_request(uuid, public.approval_status, text) to authenticated;

-- Fill the decision on requests decided before this file was run.
update public.travel_requests r
   set decided_by = a.approver_id,
       decided_by_name = left(p.full_name, 200),
       decided_by_role = case p.role::text when 'admin' then 'CEO' when 'company_admin' then 'Admin' else 'Manager' end,
       decided_at = a.decided_at,
       decision_comment = a.comments
  from (select distinct on (request_id) request_id, approver_id, decided_at, comments
          from public.approvals order by request_id, decided_at desc) a
  join public.profiles p on p.id = a.approver_id
 where a.request_id = r.id and r.decided_at is null;

-- ---------------------------------------------------------------------------
-- 3. PDF uploads
-- ---------------------------------------------------------------------------
alter table public.import_batches drop constraint if exists import_batches_file_kind_check;
alter table public.import_batches add constraint import_batches_file_kind_check
  check (file_kind in ('csv', 'xlsx', 'pdf'));

alter table public.import_batches drop constraint if exists import_batches_file_path_check;
alter table public.import_batches add constraint import_batches_file_path_check
  check (file_path is null or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv|pdf)$');

update storage.buckets
   set allowed_mime_types = array[
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-excel',
         'text/csv',
         'application/pdf'
       ]
 where id = 'import-files';

drop policy if exists import_files_insert on storage.objects;
create policy import_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'import-files'
    and private.is_staff()
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv|pdf)$'
    and exists (select 1 from public.import_batches b
                 where b.id = private.try_uuid((storage.foldername(name))[1])
                   and b.file_path is null)
  );

create or replace function public.import_attach_file(p_batch uuid, p_path text, p_size bigint, p_sha256 text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> p_batch::text
     or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv|pdf)$' then
    raise exception 'The file must be stored in this upload''s folder' using errcode = '22023';
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid file checksum' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'import-files' and o.name = p_path) then
    raise exception 'The file has not been uploaded' using errcode = 'P0002';
  end if;
  update public.import_batches
     set file_path = p_path, file_size = p_size, file_sha256 = p_sha256, file_stored_at = now()
   where id = p_batch and file_path is null;
  if not found then
    raise exception 'This upload already has its file, or does not exist' using errcode = '22023';
  end if;
  perform private.write_audit('store_import_file', 'import_batches', p_batch::text,
                              jsonb_build_object('size', p_size));
end;
$$;
revoke all on function public.import_attach_file(uuid, text, bigint, text) from public, anon;
grant execute on function public.import_attach_file(uuid, text, bigint, text) to authenticated;

-- import_stage_v2 only accepted csv and xlsx. Its body is long and owned by
-- an earlier file, so widen that one check in place instead of copying it.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.import_stage_v2(text, text, jsonb, jsonb, boolean, text)'::regprocedure);
  if position('''csv'', ''xlsx'', ''pdf''' in v_def) = 0 then
    v_def := replace(v_def, 'p_file_kind not in (''csv'', ''xlsx'')', 'p_file_kind not in (''csv'', ''xlsx'', ''pdf'')');
    v_def := replace(v_def, 'Only .csv and .xlsx files can be imported', 'Only .xlsx, .csv and .pdf files can be imported');
    if position('''csv'', ''xlsx'', ''pdf''' in v_def) = 0 then
      raise exception 'Could not update import_stage_v2 for PDF uploads';
    end if;
    execute v_def;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. CEO / Admin overview of every employee, built from the uploaded files
--    and claims: trips, spend, cancellations, claims and where they travel.
-- ---------------------------------------------------------------------------
create or replace function public.people_spend_overview(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_from date := coalesce(p_from, date '1900-01-01');
  v_to   date := coalesce(p_to, date '2999-12-31');
begin
  if not private.is_manager() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'uploads', (select jsonb_build_object(
        'files', count(*) filter (where status = 'committed'),
        'lines', coalesce(sum(imported_rows) filter (where status = 'committed'), 0),
        'last_upload', max(committed_at))
      from public.import_batches),
    'totals', (select jsonb_build_object(
        'trips', count(*) filter (where r.status <> 'cancelled'),
        'spend', coalesce(sum(r.amount) filter (where r.status <> 'cancelled'), 0),
        'cancelled_trips', count(*) filter (where r.status = 'cancelled'),
        'cancelled_value', coalesce(sum(r.amount) filter (where r.status = 'cancelled'), 0),
        'from_uploads', coalesce(sum(r.amount) filter (where r.status <> 'cancelled' and r.source = 'import'), 0),
        'without_cost', count(*) filter (where r.status <> 'cancelled' and r.amount is null))
      from public.travel_records r where r.departure_date between v_from and v_to),
    'by_mode', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'trips', n, 'spend', spend) order by spend desc)
        from (select r.booking_type::text mode, count(*) n, coalesce(sum(r.amount), 0) spend
                from public.travel_records r
               where r.departure_date between v_from and v_to and r.status <> 'cancelled'
               group by 1) s), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.total desc, x.full_name)
        from (
          select p.id as employee_id, p.employee_id as employee_code, p.full_name, p.department, p.designation, p.active,
                 (p.user_id is not null) as has_login,
                 coalesce(t.trips, 0) as trips, coalesce(t.spend, 0) as travel,
                 coalesce(t.cancelled_value, 0) as cancelled_value,
                 coalesce(c.claims, 0) as claims, coalesce(c.amount, 0) as claimed,
                 coalesce(t.spend, 0) + coalesce(c.amount, 0) as total,
                 t.first_trip, t.last_trip, t.top_destination, t.modes, t.projects
            from public.profiles p
            left join lateral (
              select count(*) filter (where r.status <> 'cancelled') trips,
                     coalesce(sum(r.amount) filter (where r.status <> 'cancelled'), 0) spend,
                     coalesce(sum(r.amount) filter (where r.status = 'cancelled'), 0) cancelled_value,
                     min(r.departure_date) first_trip, max(r.departure_date) last_trip,
                     mode() within group (order by upper(btrim(r.destination))) top_destination,
                     array_to_string(array_agg(distinct r.booking_type::text), ', ') modes,
                     left(array_to_string(array_agg(distinct coalesce(pj.name, r.project_raw)) filter (where coalesce(pj.name, r.project_raw) is not null), ', '), 200) projects
                from public.travel_records r
                left join public.projects pj on pj.id = r.project_id
               where r.employee_id = p.id and r.departure_date between v_from and v_to
            ) t on true
            left join lateral (
              select count(*) claims, coalesce(sum(e.amount) filter (where e.status in ('submitted', 'approved', 'reimbursed')), 0) amount
                from public.expenses e
               where e.employee_id = p.id and e.expense_date between v_from and v_to and e.status <> 'withdrawn'
            ) c on true
           where coalesce(t.trips, 0) + coalesce(c.claims, 0) > 0 or p.active
           limit 2000
        ) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.people_spend_overview(date, date) from public, anon;
grant execute on function public.people_spend_overview(date, date) to authenticated;
