-- =============================================================================
-- Keep each company's data separate (multi-tenancy, part 2 of 2): functions
--
-- Part 1 (20261116100000_tenant_isolation.sql) labelled every row with its
-- company and added a "same company only" rule. But functions marked SECURITY
-- DEFINER run as the database owner, and the owner skips every rule. So a
-- function like the people list or the Director dashboard would still read all
-- companies.
--
-- What this does:
--  * A new restricted database role, trapple_definer. It cannot log in and does
--    not skip the rules. It joins "authenticated" (for auth.uid()) and gets full
--    table rights plus one "allow" rule per table, so the functions keep working
--    exactly as before; the "same company only" rule then limits them to the
--    caller's company.
--  * The business functions (about 60: uploads, group bookings, dashboards,
--    people, workforce, projects, decisions …) are handed over to that role.
--  * A short list stays with the owner because the rules themselves depend on
--    them, or because they touch the sign-in tables: the permission helpers,
--    the audit and company-stamp triggers, sign-up linking, rate limits, the
--    assistant's message saving, creating a login, resetting a password,
--    deleting people and attaching an upload file. The last four get an
--    explicit company check here.
--  * Work done with no signed-in person (the service role, sign-up triggers)
--    is unchanged: the "same company only" rule lets the restricted role
--    through when there is no signed-in person.
--  * Upload duplicate detection (cost line fingerprints) is per company, so two
--    customers uploading similar sheets never clash.
--
-- New SECURITY DEFINER functions must be given to trapple_definer
-- (alter function … owner to trapple_definer); the test
-- supabase/tests/tenant_functions_test.sql fails otherwise.
--
-- Who can do what: unchanged inside a company.
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The restricted role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'trapple_definer') then
    create role trapple_definer nologin nobypassrls;
  end if;
end;
$$;

grant authenticated to trapple_definer;  -- auth.uid() and the signed-in user's grants
grant trapple_definer to postgres;       -- so the owner can hand functions over and replace them

grant usage on schema public, private, extensions to trapple_definer;
grant select, insert, update, delete on all tables in schema public to trapple_definer;
grant usage, select on all sequences in schema public to trapple_definer;
grant execute on all functions in schema public to trapple_definer;
grant execute on all functions in schema private to trapple_definer;
alter default privileges in schema public grant select, insert, update, delete on tables to trapple_definer;
alter default privileges in schema public grant usage, select on sequences to trapple_definer;

-- ---------------------------------------------------------------------------
-- 2. Rules for the restricted role: everything is allowed, then "same company
--    only" limits it (unless there is no signed-in person, e.g. the service role).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists definer_access on public.%I', t);
    execute format(
      'create policy definer_access on public.%I for all to trapple_definer using (true) with check (true)', t);
  end loop;

  foreach t in array array[
    'profiles', 'travel_requests', 'travel_records', 'documents', 'expenses', 'approvals',
    'bulk_bookings', 'bulk_booking_members', 'import_batches', 'import_rows', 'name_match_reviews',
    'audit_logs', 'contractors', 'cost_lines', 'identity_merges', 'location_aliases',
    'person_aliases', 'project_aliases', 'projects'
  ] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I as restrictive for all to authenticated
         using (company_id = (select private.current_company_id())
                or ((select auth.uid()) is null and current_user = ''trapple_definer''))
         with check (company_id = (select private.current_company_id())
                or ((select auth.uid()) is null and current_user = ''trapple_definer''))', t);
  end loop;
end;
$$;

drop policy if exists tenant_isolation on public.companies;
create policy tenant_isolation on public.companies as restrictive for all to authenticated
  using (id = (select private.current_company_id())
         or ((select auth.uid()) is null and current_user = 'trapple_definer'))
  with check (id = (select private.current_company_id())
         or ((select auth.uid()) is null and current_user = 'trapple_definer'));

-- Assistant chats belong to a person, not a company: keep them inside the
-- person's company too (otherwise "reset all data" would clear every company's chats).
create or replace function private.user_in_my_company(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                  where p.user_id = p_user and p.company_id = private.current_company_id())
$$;
revoke all on function private.user_in_my_company(uuid) from public, anon;
grant execute on function private.user_in_my_company(uuid) to authenticated, trapple_definer, service_role;

drop policy if exists tenant_isolation on public.ai_conversations;
create policy tenant_isolation on public.ai_conversations as restrictive for all to authenticated
  using (private.user_in_my_company(user_id)
         or ((select auth.uid()) is null and current_user = 'trapple_definer'))
  with check (private.user_in_my_company(user_id)
         or ((select auth.uid()) is null and current_user = 'trapple_definer'));

-- ---------------------------------------------------------------------------
-- 3. Company checks in the functions that stay with the owner
-- ---------------------------------------------------------------------------
create or replace function private.can_manage_person(p_profile uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                  where p.id = p_profile and p.company_id = private.current_company_id())
     and case
       when private.has_role('admin') then true
       when private.current_app_role()::text = 'company_admin' then
         exists (select 1 from public.profiles p where p.id = p_profile and not private.is_leadership_role(p.role))
       else false
     end
$$;

create or replace function private.remove_people(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_docs text[];
  v_users uuid[];
  v_count integer;
begin
  -- A signed-in person can only ever remove people of their own company.
  if auth.uid() is not null then
    p_ids := array(select p.id from public.profiles p
                    where p.id = any (p_ids) and p.company_id = private.current_company_id());
  end if;

  select coalesce(array_agg(d.storage_path), '{}') into v_docs
    from public.documents d where d.employee_id = any (p_ids);
  select coalesce(array_agg(p.user_id), '{}') into v_users
    from public.profiles p where p.id = any (p_ids) and p.user_id is not null;

  delete from public.approvals where approver_id = any (p_ids);
  delete from public.bulk_booking_members where employee_id = any (p_ids);
  delete from public.expenses where employee_id = any (p_ids);
  delete from public.documents where employee_id = any (p_ids);
  delete from public.travel_records where employee_id = any (p_ids);
  delete from public.travel_requests where employee_id = any (p_ids);
  delete from public.profiles where id = any (p_ids);
  get diagnostics v_count = row_count;
  -- Their sign-in goes too (identities and assistant chats cascade).
  delete from auth.users where id = any (v_users);

  return jsonb_build_object('deleted', v_count, 'documents', to_jsonb(v_docs));
end;
$$;

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
   where id = p_batch and file_path is null
     and company_id = private.current_company_id();
  if not found then
    raise exception 'This upload already has its file, or does not exist' using errcode = '22023';
  end if;
  perform private.write_audit('store_import_file', 'import_batches', p_batch::text,
                              jsonb_build_object('size', p_size));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Upload duplicate detection per company
-- ---------------------------------------------------------------------------
create unique index if not exists cost_lines_company_fingerprint_key on public.cost_lines (company_id, fingerprint);

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.import_commit_v2(uuid, boolean)'::regprocedure);
  if position('on conflict (fingerprint) do nothing' in v_def) > 0 then
    v_def := replace(v_def, 'on conflict (fingerprint) do nothing', 'on conflict (company_id, fingerprint) do nothing');
    if position('on conflict (company_id, fingerprint) do nothing' in v_def) = 0 then
      raise exception 'Could not update import_commit_v2';
    end if;
    execute v_def;
  end if;
end;
$$;

alter table public.cost_lines drop constraint if exists cost_lines_fingerprint_key;

-- ---------------------------------------------------------------------------
-- 5. Hand the business functions to the restricted role
-- ---------------------------------------------------------------------------
create or replace function private.owner_kept_functions()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    -- the rules depend on these, or they are the company stamp / audit itself
    'private.current_app_role', 'private.current_profile_id', 'private.current_company_id',
    'private.default_company_id', 'private.has_role', 'private.is_staff', 'private.is_manager',
    'private.my_manager_id', 'private.can_view_employee', 'private.can_view_request',
    'private.can_view_bulk_booking', 'private.can_view_workforce', 'private.can_manage_person',
    'private.can_manage_workforce', 'private.approver_scope_includes',
    'private.storage_object_in_my_company', 'private.user_in_my_company',
    'private.tenant_stamp', 'private.write_audit',
    'private.audit_row_change', 'private.base_currency',
    -- sign-up, rate limits and the assistant's message saving (no company data)
    'private.link_profile_on_confirm', 'private.signup_domain_allowed',
    'public.consume_rate_limit', 'public.ai_record_exchange', 'public.get_my_profile', 'public.rls_auto_enable',
    -- touch sign-in or file storage; each checks the company itself
    'public.admin_create_login', 'public.admin_reset_password', 'private.remove_people',
    'public.import_attach_file'
  ]
$$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prosecdef
       and pg_get_userbyid(p.proowner) <> 'trapple_definer'
       and (n.nspname || '.' || p.proname) <> all (private.owner_kept_functions())
  loop
    execute format('alter function %s owner to trapple_definer', r.fn);
  end loop;
end;
$$;
