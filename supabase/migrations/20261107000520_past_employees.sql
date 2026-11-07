-- =============================================================================
-- Past employees from Excel uploads
--
-- An Admin or the CEO can upload the travel sheet of people who have already
-- left. The upload adds them as employees with no login (as before); this
-- function then marks the people that upload added as past employees
-- (active = false). Their trips and spend stay in every report and search.
--
-- Safe to re-run.
-- =============================================================================

create or replace function public.import_mark_new_people_left(p_batch uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_b public.import_batches;
  v_count integer;
begin
  if not private.is_manager() then
    raise exception 'Only an Admin or the CEO can mark people as past employees' using errcode = '42501';
  end if;
  select * into v_b from public.import_batches where id = p_batch;
  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;
  if v_b.status <> 'committed' then
    raise exception 'Finish the upload first' using errcode = '22023';
  end if;

  -- Only people this upload created: no login, plain employee role, and
  -- added after the upload started. Anyone who already existed is untouched.
  with added as (
    select r.profile_id as id from public.import_rows r
     where r.batch_id = p_batch and r.new_employee and r.profile_id is not null
    union
    select n.profile_id from public.name_match_reviews n
     where n.batch_id = p_batch and n.decision = 'create' and n.profile_id is not null
  )
  update public.profiles p
     set active = false
    from added a
   where p.id = a.id
     and p.user_id is null
     and p.role = 'employee'
     and p.active
     and p.created_at >= v_b.created_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.import_mark_new_people_left(uuid) from public, anon;
grant execute on function public.import_mark_new_people_left(uuid) to authenticated;
