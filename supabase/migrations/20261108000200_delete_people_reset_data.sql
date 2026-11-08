-- =============================================================================
-- Delete employees (one or many) and reset company data
--
--  * admin_delete_people(ids): the CEO or an Admin removes employees for good,
--    with their trips, requests, claims, documents and login. An Admin cannot
--    remove the CEO or other Admins, nobody can remove themselves, and the CEO
--    account can never be removed (so the company is never locked out).
--  * admin_reset_data(scope, confirm): the CEO only. Clears every trip,
--    request, claim, upload, document, project and assistant chat. With scope
--    'everything' it also removes every employee except the CEO and Admins.
--    The caller must pass the word RESET.
--
-- Both return the stored file paths of what was removed, so the app can delete
-- the files from Storage (Supabase does not allow deleting them from SQL).
-- The audit log is append-only and is kept.
--
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared: remove a set of people and everything that belongs to them
-- ---------------------------------------------------------------------------
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
revoke all on function private.remove_people(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delete one or many employees
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_people(p_ids uuid[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_me uuid := private.current_profile_id();
  v_bad text;
  v_result jsonb;
begin
  if not private.is_manager() then
    raise exception 'Only an Admin or the CEO can delete employees' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if cardinality(v_ids) = 0 then
    raise exception 'Choose at least one employee' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 5000 then
    raise exception 'Delete at most 5000 employees at a time' using errcode = '22023';
  end if;
  if v_me = any (v_ids) then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;
  select p.full_name into v_bad from public.profiles p
   where p.id = any (v_ids) and p.role = 'admin' limit 1;
  if found then
    raise exception 'The CEO account (%) cannot be deleted', v_bad using errcode = '42501';
  end if;
  select p.full_name into v_bad from public.profiles p
   where p.id = any (v_ids) and not private.can_manage_person(p.id) limit 1;
  if found then
    raise exception 'You are not allowed to delete %', v_bad using errcode = '42501';
  end if;

  v_result := private.remove_people(v_ids);
  perform private.write_audit('delete_people', 'profiles', null,
                              jsonb_build_object('count', v_result -> 'deleted'));
  return v_result;
end;
$$;
revoke all on function public.admin_delete_people(uuid[]) from public, anon;
grant execute on function public.admin_delete_people(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Reset all data (CEO only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_data(p_scope text, p_confirm text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_docs text[];
  v_files text[];
  v_people jsonb := jsonb_build_object('deleted', 0);
  v_ids uuid[];
  v_trips integer;
begin
  if not private.has_role('admin') then
    raise exception 'Only the CEO can reset all data' using errcode = '42501';
  end if;
  if p_confirm is distinct from 'RESET' then
    raise exception 'Type RESET to confirm' using errcode = '22023';
  end if;
  if p_scope not in ('data', 'everything') then
    raise exception 'Choose what to reset' using errcode = '22023';
  end if;

  select coalesce(array_agg(d.storage_path), '{}') into v_docs from public.documents d;
  select coalesce(array_agg(b.file_path), '{}') into v_files from public.import_batches b where b.file_path is not null;

  delete from public.approvals where true;
  delete from public.bulk_booking_members where true;
  delete from public.bulk_bookings where true;
  delete from public.expenses where true;
  delete from public.documents where true;
  delete from public.travel_records where true;
  get diagnostics v_trips = row_count;
  delete from public.travel_requests where true;
  delete from public.import_batches where true;   -- rows and name reviews cascade
  delete from public.projects where true;         -- aliases cascade
  delete from public.ai_conversations where true; -- messages cascade

  if p_scope = 'everything' then
    select coalesce(array_agg(p.id), '{}') into v_ids
      from public.profiles p where not private.is_leadership_role(p.role);
    v_people := private.remove_people(v_ids);
  end if;

  perform private.write_audit('reset_data', 'company', null,
                              jsonb_build_object('scope', p_scope, 'trips', v_trips, 'people', v_people -> 'deleted'));
  return jsonb_build_object('trips', v_trips, 'people', v_people -> 'deleted',
                            'documents', to_jsonb(v_docs), 'import_files', to_jsonb(v_files));
end;
$$;
revoke all on function public.admin_reset_data(text, text) from public, anon;
grant execute on function public.admin_reset_data(text, text) to authenticated;

-- The CEO may remove kept upload files (used only by a reset).
drop policy if exists import_files_delete on storage.objects;
create policy import_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'import-files' and private.has_role('admin'));
