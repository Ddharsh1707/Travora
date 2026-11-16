-- =============================================================================
-- Keep each company's data separate (multi-tenancy, part 1 of 2)
--
-- Trapple is being prepared to serve more than one company. Until now most
-- tables had no idea which company a row belongs to, and the rules only checked
-- the role, so any company's Travel Desk would have seen every company's data.
--
-- What this does:
--  * Adds company_id to the 12 tables that did not have it. Every existing row
--    gets the one existing company, so nothing changes for today's users.
--  * private.current_company_id(): the signed-in person's company.
--    private.default_company_id() now returns it, or the only company when there
--    is exactly one (it returns null, so inserts fail loudly, once there are more).
--  * One extra "same company only" rule (a RESTRICTIVE policy) on every company
--    table, on the companies list and on uploaded files. Postgres requires it to
--    pass on top of every existing rule, so the existing rules are unchanged.
--  * private.tenant_stamp(): every new or changed row gets its company from the
--    records it points at (person, upload, request, booking …). Links across
--    companies, writing into another company and moving a row to another
--    company are refused.
--  * can_view_employee / can_view_request / can_view_bulk_booking also require
--    the same company, which protects the functions that use them as checks.
--  * Audit log entries record the company (left empty for platform events).
--  * Employee codes ("EMP001") are unique per company instead of everywhere.
--
-- Who can do what: unchanged inside a company. Nobody can see or change another
-- company's rows through the API. Part 2 adds the company filter inside the
-- security-definer functions; no second company can exist before then.
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. company_id on every company table. A constant default fills existing
--    rows without rewriting them or firing update triggers (the audit log
--    refuses updates), then the default becomes "the caller's company".
-- ---------------------------------------------------------------------------
do $$
declare
  v_company uuid := (select c.id from public.companies c order by c.created_at, c.id limit 1);
  t text;
begin
  if v_company is null then
    raise exception 'No company row found';
  end if;
  foreach t in array array[
    'profiles', 'travel_requests', 'travel_records', 'documents', 'expenses', 'approvals',
    'bulk_bookings', 'bulk_booking_members', 'import_batches', 'import_rows',
    'name_match_reviews', 'audit_logs'
  ] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'company_id') then
      execute format(
        'alter table public.%I add column company_id uuid not null default %L references public.companies (id) on delete restrict',
        t, v_company);
    end if;
    execute format('alter table public.%I alter column company_id set default private.default_company_id()', t);
    execute format('create index if not exists %I on public.%I (company_id)', t || '_company_idx', t);
  end loop;
  -- Platform events (no company) may be logged; nobody but the service role sees them.
  alter table public.audit_logs alter column company_id drop not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The caller's company
-- ---------------------------------------------------------------------------
create or replace function private.current_company_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.company_id from public.profiles p
  where p.user_id = auth.uid() and p.active
$$;

create or replace function private.default_company_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    private.current_company_id(),
    -- No signed-in person (imports from the service role, sign-up triggers, migrations):
    -- only safe while there is exactly one company.
    (select c.id from public.companies c where (select count(*) from public.companies) = 1)
  )
$$;

revoke all on function private.current_company_id() from public, anon;
grant execute on function private.current_company_id() to authenticated, service_role;
revoke all on function private.default_company_id() from public, anon;
grant execute on function private.default_company_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The permission helpers also require the same company
-- ---------------------------------------------------------------------------
create or replace function private.can_view_employee(target_employee uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select target_employee is not null
     and private.current_app_role() is not null
     and exists (select 1 from public.profiles t
                  where t.id = target_employee and t.company_id = private.current_company_id())
     and (
       target_employee = private.current_profile_id()
       or private.is_staff()
       or private.approver_scope_includes(target_employee)
     )
$$;

create or replace function private.can_view_request(target_request uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.travel_requests r
    where r.id = target_request
      and r.company_id = private.current_company_id()
      and (private.can_view_employee(r.employee_id)
           or r.approver_id = private.current_profile_id())
  )
$$;

create or replace function private.can_view_bulk_booking(target uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.current_app_role() is not null
     and exists (select 1 from public.bulk_bookings b
                  where b.id = target and b.company_id = private.current_company_id())
     and (
       private.is_staff()
       or exists (select 1 from public.bulk_booking_members m
                   where m.bulk_booking_id = target and private.can_view_employee(m.employee_id))
     )
$$;

-- ---------------------------------------------------------------------------
-- 4. Audit entries carry the company
-- ---------------------------------------------------------------------------
create or replace function private.write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata, company_id)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb),
          private.default_company_id());
$$;

-- ---------------------------------------------------------------------------
-- 5. Every row gets its company from what it points at; no mixing companies
-- ---------------------------------------------------------------------------
create or replace function private.tenant_stamp()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  -- [column, table it points at] for every link to another company table
  v_links jsonb := case tg_table_name
    when 'profiles'             then '[["contractor_id","contractors"],["manager_id","profiles"],["merged_into","profiles"],["primary_project_id","projects"]]'
    when 'travel_requests'      then '[["employee_id","profiles"],["approver_id","profiles"],["decided_by","profiles"]]'
    when 'travel_records'       then '[["employee_id","profiles"],["request_id","travel_requests"],["import_batch_id","import_batches"],["project_id","projects"]]'
    when 'documents'            then '[["employee_id","profiles"],["travel_record_id","travel_records"],["travel_request_id","travel_requests"]]'
    when 'expenses'             then '[["employee_id","profiles"],["travel_record_id","travel_records"],["project_id","projects"],["receipt_document_id","documents"],["upload_document_id","documents"],["reviewed_by","profiles"]]'
    when 'approvals'            then '[["request_id","travel_requests"],["approver_id","profiles"]]'
    when 'bulk_bookings'        then '[["reviewed_by","profiles"]]'
    when 'bulk_booking_members' then '[["bulk_booking_id","bulk_bookings"],["employee_id","profiles"],["travel_record_id","travel_records"]]'
    when 'import_rows'          then '[["batch_id","import_batches"],["profile_id","profiles"],["travel_record_id","travel_records"]]'
    when 'name_match_reviews'   then '[["batch_id","import_batches"],["profile_id","profiles"],["suggested_profile_id","profiles"]]'
    when 'cost_lines'           then '[["travel_record_id","travel_records"],["import_batch_id","import_batches"]]'
    when 'identity_merges'      then '[["from_profile","profiles"],["into_profile","profiles"]]'
    when 'person_aliases'       then '[["profile_id","profiles"],["import_batch_id","import_batches"]]'
    when 'project_aliases'      then '[["project_id","projects"]]'
    else '[]'
  end::jsonb;
  v_link jsonb;
  v_target uuid;
  v_target_company uuid;
  v_company uuid;
  v_caller uuid := private.current_company_id();
begin
  for v_link in select value from jsonb_array_elements(v_links) loop
    v_target := private.try_uuid(v_row ->> (v_link ->> 0));
    continue when v_target is null;
    execute format('select company_id from public.%I where id = $1', v_link ->> 1)
       into v_target_company using v_target;
    continue when v_target_company is null; -- a missing target is the foreign key's job
    if v_company is null then
      v_company := v_target_company;
    elsif v_company <> v_target_company then
      raise exception 'Records from different companies cannot be linked' using errcode = '42501';
    end if;
  end loop;

  v_company := coalesce(v_company, v_caller, private.try_uuid(v_row ->> 'company_id'));
  if v_caller is not null and v_company is distinct from v_caller then
    raise exception 'This record belongs to another company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (v_company is distinct from old.company_id
                           or new.company_id is distinct from old.company_id) then
    raise exception 'A record cannot move to another company' using errcode = '42501';
  end if;

  new := jsonb_populate_record(new, jsonb_build_object('company_id', v_company));
  return new;
end;
$$;

revoke all on function private.tenant_stamp() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'travel_requests', 'travel_records', 'documents', 'expenses', 'approvals',
    'bulk_bookings', 'bulk_booking_members', 'import_batches', 'import_rows', 'name_match_reviews',
    'contractors', 'cost_lines', 'identity_merges', 'location_aliases', 'person_aliases',
    'project_aliases', 'projects'
  ] loop
    execute format('drop trigger if exists tenant_stamp on public.%I', t);
    execute format(
      'create trigger tenant_stamp before insert or update on public.%I for each row execute function private.tenant_stamp()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. "Same company only" on top of every existing rule
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'travel_requests', 'travel_records', 'documents', 'expenses', 'approvals',
    'bulk_bookings', 'bulk_booking_members', 'import_batches', 'import_rows', 'name_match_reviews',
    'audit_logs', 'contractors', 'cost_lines', 'identity_merges', 'location_aliases',
    'person_aliases', 'project_aliases', 'projects'
  ] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I as restrictive for all to authenticated
         using (company_id = (select private.current_company_id()))
         with check (company_id = (select private.current_company_id()))', t);
  end loop;
end;
$$;

drop policy if exists tenant_isolation on public.companies;
create policy tenant_isolation on public.companies as restrictive for all to authenticated
  using (id = (select private.current_company_id()))
  with check (id = (select private.current_company_id()));

-- Uploaded files: tickets are filed under the person's id, import files under the upload's id.
create or replace function private.storage_object_in_my_company(p_bucket text, p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case p_bucket
    when 'travel-documents' then exists (
      select 1 from public.profiles p
       where p.id = private.try_uuid((storage.foldername(p_name))[1])
         and p.company_id = private.current_company_id())
    when 'import-files' then exists (
      select 1 from public.import_batches b
       where b.id = private.try_uuid((storage.foldername(p_name))[1])
         and b.company_id = private.current_company_id())
    else true
  end
$$;

revoke all on function private.storage_object_in_my_company(text, text) from public, anon;
grant execute on function private.storage_object_in_my_company(text, text) to authenticated, service_role;

drop policy if exists tenant_isolation on storage.objects;
create policy tenant_isolation on storage.objects as restrictive for all to authenticated
  using (private.storage_object_in_my_company(bucket_id, name))
  with check (private.storage_object_in_my_company(bucket_id, name));

-- ---------------------------------------------------------------------------
-- 7. Employee codes are unique inside a company
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_employee_id_key;
create unique index if not exists profiles_company_employee_id_key on public.profiles (company_id, employee_id);
