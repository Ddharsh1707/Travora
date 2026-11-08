-- =============================================================================
-- Travel Desk (company_admin) gets every permission the Director (admin) has
--
-- The screens now call the roles:
--   admin          "Director"     (was "CEO")
--   company_admin  "Travel Desk"  (was "Admin")
-- The database role values do not change.
--
-- has_role('admin') now also matches company_admin, so every rule that was
-- Director-only (roles, reset data, overruling claims, project details,
-- managing other leaders, the import-files bucket, and so on) covers the
-- Travel Desk too. can_manage_person() follows, because it starts with
-- has_role('admin').
--
-- What stays: nobody deletes their own account, the Director account cannot
-- be deleted, and admin_set_role() still refuses to remove the last Director.
--
-- Nothing is deleted and no row changes. Safe to run more than once.
-- =============================================================================

create or replace function private.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    private.current_app_role() = any (roles)
    -- The Travel Desk (company_admin) can do everything the old travel desk
    -- role and the Director (admin) can.
    or (private.current_app_role()::text = 'company_admin'
        and ('travel_desk'::public.app_role = any (roles) or 'admin'::public.app_role = any (roles))),
    false)
$$;

-- With two roles that can switch people off, keep at least one active
-- Director so the company always has its top login.
create or replace function public.admin_set_active(p_profile_id uuid, p_active boolean)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not private.is_manager() or not private.can_manage_person(p_profile_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_profile_id = private.current_profile_id() and not p_active then
    raise exception 'You cannot deactivate your own account' using errcode = '22023';
  end if;
  if not p_active
     and exists (select 1 from public.profiles p where p.id = p_profile_id and p.role = 'admin' and p.active)
     and (select count(*) from public.profiles p where p.role = 'admin' and p.active) <= 1 then
    raise exception 'The only Director cannot be deactivated' using errcode = '42501';
  end if;
  update public.profiles set active = p_active where id = p_profile_id returning * into v_profile;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  return v_profile;
end;
$$;
revoke all on function public.admin_set_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
