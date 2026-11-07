-- =============================================================================
-- Admin portal, employee expense uploads, stored Excel files, AI assistant data
--
-- Roles after this file:
--   employee       sees and files only their own trips, claims and receipts
--   approver       unchanged (their team)
--   travel_desk    unchanged (all travel, uploads)
--   company_admin  "Admin": every travel desk permission, plus all expense
--                  claims, approving claims, the Admin dashboard and creating
--                  logins for employees. Cannot assign roles, cannot manage
--                  the CEO or other Admins, cannot overrule the CEO.
--   admin          "CEO": everything, and the final say on claims.
--
-- What is added
--   1. Role helpers: has_role() treats company_admin as matching wherever the
--      travel desk is allowed, so every existing travel desk rule (is_staff,
--      Business Intelligence, projects, places) covers the Admin with no other
--      edits. has_role('admin') stays CEO-only.
--   2. Expense claims: project, from/to, upload source; Admin can approve;
--      the CEO can overrule an Admin's decision until it is reimbursed.
--   3. Admin may run the dashboard, list people, create logins and switch
--      employees on or off (never the CEO or other Admins).
--   4. Original Excel/CSV files of every travel desk upload are kept in a
--      private Storage bucket and can be downloaded from the upload history.
--   5. spend_items: one list of employee claims and travel desk trips;
--      spend_summary(): totals by person, project, department, category,
--      week, month or source. Both run with the caller's own permissions.
--
-- Nothing is deleted and no existing row changes. Safe to run more than once.
-- Run 20261107000500_company_admin_role.sql first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------
-- The new role is compared as text so this file also works when pasted in the
-- same SQL Editor run as the file that adds the enum value.
create or replace function private.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    private.current_app_role() = any (roles)
    -- The Admin can do everything the travel desk can.
    or (private.current_app_role()::text = 'company_admin' and 'travel_desk'::public.app_role = any (roles)),
    false)
$$;

-- CEO or Admin.
create or replace function private.is_manager()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role()::text in ('admin', 'company_admin'), false)
$$;

-- True for the CEO and for Admins: the people only the CEO may manage.
create or replace function private.is_leadership_role(p_role public.app_role)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(p_role::text in ('admin', 'company_admin'), false)
$$;

-- Can the caller manage this person's login, status or claims decisions?
-- CEO: anyone. Admin: anyone except the CEO and other Admins.
create or replace function private.can_manage_person(p_profile uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when private.has_role('admin') then true
    when private.current_app_role()::text = 'company_admin' then
      exists (select 1 from public.profiles p where p.id = p_profile and not private.is_leadership_role(p.role))
    else false
  end
$$;

revoke all on function private.is_manager() from public, anon;
revoke all on function private.is_leadership_role(public.app_role) from public, anon;
revoke all on function private.can_manage_person(uuid) from public, anon;
grant execute on function private.is_manager() to authenticated, service_role;
grant execute on function private.is_leadership_role(public.app_role) to authenticated, service_role;
grant execute on function private.can_manage_person(uuid) to authenticated, service_role;

-- Profiles: the travel desk rules already stop Admins changing roles, logins or
-- account status. Also stop anyone below the CEO editing the CEO's or an
-- Admin's details (except their own).
create or replace function private.guard_profiles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if private.has_role('admin') then
    return new;
  end if;

  -- Travel Desk and Admins may maintain employee details but never roles or logins.
  if tg_op = 'INSERT' then
    if new.role <> 'employee' or new.user_id is not null then
      raise exception 'Only administrators can assign roles or link logins' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.user_id is distinct from old.user_id
       or new.active is distinct from old.active then
      raise exception 'Only administrators can change roles, logins or account status' using errcode = '42501';
    end if;
    if private.is_leadership_role(old.role) and old.id is distinct from private.current_profile_id() then
      raise exception 'Only the CEO can change the CEO''s or an Admin''s details' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Expense claims
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists project_id          uuid references public.projects (id) on delete set null,
  add column if not exists origin              text check (origin is null or char_length(btrim(origin)) between 1 and 120),
  add column if not exists destination         text check (destination is null or char_length(btrim(destination)) between 1 and 120),
  add column if not exists source              text not null default 'manual' check (source in ('manual', 'upload')),
  add column if not exists upload_document_id  uuid references public.documents (id) on delete set null,
  add column if not exists reviewed_by_role    text check (reviewed_by_role is null or reviewed_by_role in ('admin', 'company_admin'));
create index if not exists expenses_project_idx on public.expenses (project_id) where project_id is not null;
create index if not exists expenses_upload_idx  on public.expenses (upload_document_id) where upload_document_id is not null;

create or replace function private.project_exists(p_project uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.projects p where p.id = p_project)
$$;
revoke all on function private.project_exists(uuid) from public, anon;
grant execute on function private.project_exists(uuid) to authenticated, service_role;

create or replace function private.guard_expenses()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.current_profile_id();
  v_manager boolean := private.is_manager();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not v_manager then
      new.employee_id := v_me;   -- employees only ever claim for themselves
    elsif new.employee_id is distinct from v_me and not private.can_manage_person(new.employee_id) then
      raise exception 'Only the CEO can file claims for the CEO or an Admin' using errcode = '42501';
    end if;
    new.status           := 'submitted';
    new.review_note      := null;
    new.reviewed_by      := null;
    new.reviewed_by_role := null;
    new.reviewed_at      := null;
    new.reimbursed_at    := null;
  else
    new.employee_id      := old.employee_id;
    new.created_by       := old.created_by;
    new.created_at       := old.created_at;
    new.source           := old.source;
    new.upload_document_id := old.upload_document_id;
    new.review_note      := old.review_note;
    new.reviewed_by      := old.reviewed_by;
    new.reviewed_by_role := old.reviewed_by_role;
    new.reviewed_at      := old.reviewed_at;
    new.reimbursed_at    := old.reimbursed_at;

    if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'reimbursed') then
      raise exception 'Use decide_expense() to approve, reject or reimburse' using errcode = '42501';
    end if;
    if old.employee_id is distinct from v_me
       and not (v_manager and private.can_manage_person(old.employee_id)) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if old.status <> 'submitted' then
      raise exception 'Only submitted expenses can be changed' using errcode = '22023';
    end if;
    if new.status not in ('submitted', 'withdrawn') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  new.origin      := nullif(btrim(new.origin), '');
  new.destination := nullif(btrim(new.destination), '');

  -- A receipt, upload file or trip must belong to the same employee as the claim.
  if new.receipt_document_id is not null and not exists (
       select 1 from public.documents d
        where d.id = new.receipt_document_id and d.employee_id = new.employee_id) then
    raise exception 'The receipt must be one of this employee''s documents' using errcode = '22023';
  end if;
  if new.upload_document_id is not null and not exists (
       select 1 from public.documents d
        where d.id = new.upload_document_id and d.employee_id = new.employee_id) then
    raise exception 'The uploaded file must be one of this employee''s documents' using errcode = '22023';
  end if;
  if new.travel_record_id is not null and not exists (
       select 1 from public.travel_records r
        where r.id = new.travel_record_id and r.employee_id = new.employee_id) then
    raise exception 'The trip must be one of this employee''s trips' using errcode = '22023';
  end if;
  -- Employees cannot read the projects table, so check the project exists here.
  if new.project_id is not null and not private.project_exists(new.project_id) then
    raise exception 'Unknown project' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_expenses() from public, anon, authenticated;

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    (private.is_manager() and private.can_view_employee(employee_id))
    or (employee_id = private.current_profile_id() and private.current_app_role() is not null)
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (private.is_manager() or employee_id = private.current_profile_id())
  with check (private.is_manager() or employee_id = private.current_profile_id());

-- Approve, reject or reimburse a claim.
--  * Admin or CEO; never your own claim.
--  * An Admin cannot decide the CEO's or another Admin's claim.
--  * The CEO has the final say: they can overrule an approval or rejection
--    (their own or an Admin's) until the claim is reimbursed. An Admin cannot
--    change a decision the CEO made.
create or replace function public.decide_expense(p_expense uuid, p_decision text, p_note text default null)
returns public.expenses
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me   uuid := private.current_profile_id();
  v_ceo  boolean := private.has_role('admin');
  v_role text := private.current_app_role()::text;
  v_row  public.expenses;
begin
  if v_me is null or not private.is_manager() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected', 'reimbursed') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Note too long' using errcode = '22001';
  end if;

  select * into v_row from public.expenses where id = p_expense for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if v_row.employee_id = v_me then
    raise exception 'You cannot decide your own expense' using errcode = '42501';
  end if;
  if not private.can_manage_person(v_row.employee_id) then
    raise exception 'Only the CEO can decide claims from the CEO or an Admin' using errcode = '42501';
  end if;

  if p_decision in ('approved', 'rejected') then
    if v_row.status = 'submitted' then
      null;  -- first decision
    elsif v_ceo and v_row.status in ('approved', 'rejected') and v_row.status <> p_decision then
      null;  -- the CEO overrules an earlier decision
    elsif v_row.status in ('approved', 'rejected') and v_row.reviewed_by_role = 'admin' then
      raise exception 'The CEO has already decided this claim' using errcode = '42501';
    else
      raise exception 'Only submitted expenses can be approved or rejected' using errcode = '22023';
    end if;
  end if;
  if p_decision = 'reimbursed' and v_row.status <> 'approved' then
    raise exception 'Only approved expenses can be marked reimbursed' using errcode = '22023';
  end if;

  update public.expenses
     set status           = p_decision,
         review_note      = coalesce(nullif(btrim(p_note), ''), review_note),
         reviewed_by      = case when p_decision = 'reimbursed' then coalesce(reviewed_by, v_me) else v_me end,
         reviewed_by_role = case when p_decision = 'reimbursed' then coalesce(reviewed_by_role, v_role) else v_role end,
         reviewed_at      = case when p_decision = 'reimbursed' then coalesce(reviewed_at, now()) else now() end,
         reimbursed_at    = case when p_decision = 'reimbursed' then now() else reimbursed_at end
   where id = p_expense
  returning * into v_row;
  return v_row;  -- the audit trigger records status_from / status_to
end;
$$;

-- Active projects for the claim form. Employees cannot read the projects
-- table itself; this gives them only the names to pick from.
create or replace function public.project_choices()
returns table (id uuid, name text, code text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.name, p.code
    from public.projects p
   where private.current_app_role() is not null
     and p.status in ('active', 'unknown')
   order by lower(p.name)
   limit 2000
$$;
revoke all on function public.project_choices() from public, anon;
grant execute on function public.project_choices() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Dashboard and people management for the Admin
-- ---------------------------------------------------------------------------
-- Same numbers as before; now the Admin may open it too.
create or replace function public.ceo_dashboard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_from date := coalesce(p_from, (date_trunc('month', current_date) - interval '11 months')::date);
  v_to   date := coalesce(p_to, current_date + 365);
  v_result jsonb;
begin
  if not private.is_manager() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_to < v_from or v_to - v_from > 3660 then
    raise exception 'Choose a date range of up to 10 years' using errcode = '22023';
  end if;

  with
  e as (select * from public.expenses where expense_date between v_from and v_to and status <> 'withdrawn'),
  r as (select * from public.travel_records where departure_date between v_from and v_to and status <> 'cancelled')
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'people', (select jsonb_build_object(
        'total',         count(*),
        'active',        count(*) filter (where active),
        'inactive',      count(*) filter (where not active),
        'with_login',    count(*) filter (where active and user_id is not null),
        'without_login', count(*) filter (where active and user_id is null))
      from public.profiles),
    'expenses', (select jsonb_build_object(
        'claims',            count(*),
        'total',             coalesce(sum(amount), 0),
        'submitted_count',   count(*) filter (where status = 'submitted'),
        'submitted_amount',  coalesce(sum(amount) filter (where status = 'submitted'), 0),
        'approved_amount',   coalesce(sum(amount) filter (where status = 'approved'), 0),
        'reimbursed_amount', coalesce(sum(amount) filter (where status = 'reimbursed'), 0),
        'rejected_amount',   coalesce(sum(amount) filter (where status = 'rejected'), 0))
      from e),
    'travel', (select jsonb_build_object(
        'trips',      count(*),
        'spend',      coalesce(sum(amount), 0),
        'travellers', count(distinct employee_id),
        'upcoming',   count(*) filter (where departure_date >= current_date))
      from r),
    'pending_travel_requests', (select count(*) from public.travel_requests where status = 'pending'),
    'by_month', coalesce((
      select jsonb_agg(m order by m ->> 'month') from (
        select jsonb_build_object(
          'month', to_char(month, 'YYYY-MM'),
          'expenses', coalesce(sum(exp_amount), 0),
          'travel', coalesce(sum(trip_amount), 0)) as m
        from (
          select date_trunc('month', expense_date)::date as month, amount as exp_amount, null::numeric as trip_amount from e
          union all
          select date_trunc('month', departure_date)::date, null, coalesce(amount, 0) from r
        ) u group by month
      ) s), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'claims', n, 'amount', total) order by total desc)
        from (select category, count(*) n, sum(amount) total from e group by category) s), '[]'::jsonb),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('department', department, 'expenses', exp_total, 'travel', trip_total,
                                          'people', people) order by exp_total + trip_total desc)
        from (
          select coalesce(p.department, 'Unassigned') department,
                 count(distinct p.id) filter (where p.active) people,
                 coalesce(sum(u.exp_amount), 0) exp_total,
                 coalesce(sum(u.trip_amount), 0) trip_total
            from public.profiles p
            left join (
              select employee_id, amount exp_amount, null::numeric trip_amount from e
              union all
              select employee_id, null, coalesce(amount, 0) from r
            ) u on u.employee_id = p.id
           group by coalesce(p.department, 'Unassigned')
          having count(*) filter (where p.active) > 0 or coalesce(sum(u.exp_amount), 0) + coalesce(sum(u.trip_amount), 0) > 0
        ) s), '[]'::jsonb),
    'top_spenders', coalesce((
      select jsonb_agg(t order by (t ->> 'total')::numeric desc) from (
        select jsonb_build_object(
          'employee_id', p.id, 'employee_code', p.employee_id, 'full_name', p.full_name,
          'department', p.department,
          'expenses', coalesce(ex.total, 0), 'travel', coalesce(tr.total, 0),
          'total', coalesce(ex.total, 0) + coalesce(tr.total, 0)) t
        from public.profiles p
        left join (select employee_id, sum(amount) total from e group by employee_id) ex on ex.employee_id = p.id
        left join (select employee_id, sum(coalesce(amount, 0)) total from r group by employee_id) tr on tr.employee_id = p.id
        where coalesce(ex.total, 0) + coalesce(tr.total, 0) > 0
        order by coalesce(ex.total, 0) + coalesce(tr.total, 0) desc
        limit 8
      ) s), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- People list for the CEO and the Admin. can_manage says whether the caller
-- may create a login, reset a password or switch the person on or off.
-- The return type gains a column, so the old version has to go first.
drop function if exists public.admin_list_people();
create or replace function public.admin_list_people()
returns table (
  id uuid, employee_id text, full_name text, email text, department text, designation text,
  role public.app_role, manager_id uuid, manager_name text, active boolean, has_login boolean,
  created_at timestamptz, can_manage boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ceo boolean := private.has_role('admin');
begin
  if not private.is_manager() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, p.employee_id, p.full_name, p.email::text, p.department, p.designation,
           p.role, p.manager_id, m.full_name, p.active, p.user_id is not null, p.created_at,
           (v_ceo or not private.is_leadership_role(p.role)) and p.id <> private.current_profile_id()
      from public.profiles p
      left join public.profiles m on m.id = p.manager_id
     order by p.active desc, lower(p.full_name);
end;
$$;
revoke all on function public.admin_list_people() from public, anon;
grant execute on function public.admin_list_people() to authenticated;

create or replace function public.admin_create_login(p_profile_id uuid, p_password text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_email   text;
  v_user    uuid;
begin
  if not private.is_manager() or not private.can_manage_person(p_profile_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.password_ok(p_password) then
    raise exception 'Password needs 12+ characters with upper case, lower case and a number' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if not v_profile.active then
    raise exception 'Activate this employee first' using errcode = '22023';
  end if;
  if v_profile.user_id is not null then
    raise exception 'This employee already has a login. Use Reset password instead.' using errcode = '22023';
  end if;
  if v_profile.email is null then
    raise exception 'Add an email address for this employee first' using errcode = '22023';
  end if;
  v_email := lower(v_profile.email::text);

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is not null then
    if exists (select 1 from public.profiles p where p.user_id = v_user) then
      raise exception 'That email''s login is already linked to another employee' using errcode = '22023';
    end if;
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user;
  else
    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_profile.full_name,
                         'created_by', case when private.has_role('admin') then 'ceo' else 'admin' end),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_user::text, v_user,
            jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  end if;

  update public.profiles set user_id = v_user where id = p_profile_id and user_id is null;
  perform private.write_audit('create_login', 'profiles', p_profile_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_reset_password(p_profile_id uuid, p_password text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not private.is_manager() or not private.can_manage_person(p_profile_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.password_ok(p_password) then
    raise exception 'Password needs 12+ characters with upper case, lower case and a number' using errcode = '22023';
  end if;
  select user_id into v_user from public.profiles where id = p_profile_id;
  if v_user is null then
    raise exception 'This employee has no login yet' using errcode = '22023';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_user;
  perform private.write_audit('reset_password', 'profiles', p_profile_id::text, '{}'::jsonb);
end;
$$;

-- Activate / deactivate. CEO: anyone. Admin: employees, approvers and the
-- travel desk. Nobody can lock themselves out.
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
  update public.profiles set active = p_active where id = p_profile_id returning * into v_profile;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  return v_profile;
end;
$$;

revoke all on function public.decide_expense(uuid, text, text) from public, anon;
revoke all on function public.ceo_dashboard(date, date) from public, anon;
revoke all on function public.admin_create_login(uuid, text) from public, anon;
revoke all on function public.admin_reset_password(uuid, text) from public, anon;
revoke all on function public.admin_set_active(uuid, boolean) from public, anon;
grant execute on function public.decide_expense(uuid, text, text) to authenticated;
grant execute on function public.ceo_dashboard(date, date) to authenticated;
grant execute on function public.admin_create_login(uuid, text) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Keep the original file of every travel desk upload
-- ---------------------------------------------------------------------------
-- Private bucket. Path: <upload batch id>/<random uuid>.<xlsx|xls|csv>
-- Only staff (travel desk, Admin, CEO) can read it, through short-lived
-- signed links. Files are never changed or deleted from the app, so the
-- upload history always has the exact file the figures came from.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-files',
  'import-files',
  false,
  26214400, -- 25 MB
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.import_batches
  add column if not exists file_path         text unique
                           check (file_path is null or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv)$'),
  add column if not exists file_size         bigint check (file_size is null or file_size between 1 and 26214400),
  add column if not exists file_sha256       text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists file_stored_at    timestamptz;

drop policy if exists import_files_select on storage.objects;
create policy import_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'import-files' and private.is_staff());

-- A file can only go into the folder of an upload that has no file yet.
drop policy if exists import_files_insert on storage.objects;
create policy import_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'import-files'
    and private.is_staff()
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv)$'
    and exists (select 1 from public.import_batches b
                 where b.id = private.try_uuid((storage.foldername(name))[1])
                   and b.file_path is null)
  );
-- No UPDATE or DELETE policy: kept files cannot be replaced or removed.

-- Records the stored file on its upload, once.
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
     or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv)$' then
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

-- Upload history with who uploaded each file.
create or replace function public.import_history(p_limit integer default 200, p_offset integer default 0)
returns table (
  id uuid, original_filename text, file_kind text, status text, format_version integer,
  total_rows integer, valid_rows integer, warning_rows integer, error_rows integer,
  duplicate_rows integer, imported_rows integer, created_at timestamptz, committed_at timestamptz,
  uploaded_by text, file_path text, file_size bigint, file_stored_at timestamptz,
  trips bigint, spend numeric
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select b.id, b.original_filename, b.file_kind, b.status, b.format_version,
           b.total_rows, b.valid_rows, b.warning_rows, b.error_rows, b.duplicate_rows, b.imported_rows,
           b.created_at, b.committed_at,
           coalesce(p.full_name, 'Unknown'), b.file_path, b.file_size, b.file_stored_at,
           coalesce(t.trips, 0), coalesce(t.spend, 0)
      from public.import_batches b
      left join public.profiles p on p.user_id = b.created_by
      left join lateral (
        select count(*) trips, sum(r.amount) filter (where r.status <> 'cancelled') spend
          from public.travel_records r where r.import_batch_id = b.id
      ) t on true
     order by b.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.import_history(integer, integer) from public, anon;
grant execute on function public.import_history(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One list of all spend: employee claims + travel desk trips
-- ---------------------------------------------------------------------------
-- security_invoker: each row is filtered by the caller's own access to
-- expenses / travel_records / profiles, so employees still see only their own.
-- counted = the amount that goes into totals (withdrawn and rejected claims
-- and cancelled trips count as 0; their amount stays visible).
create or replace view public.spend_items
with (security_invoker = true)
as
  select 'claim'::text                     as source,
         e.id,
         e.employee_id,
         p.full_name                       as employee_name,
         p.employee_id                     as employee_code,
         coalesce(nullif(btrim(p.department), ''), 'Not recorded') as department,
         e.expense_date                    as spend_date,
         e.category,
         e.description,
         e.project_id,
         pj.name                           as project_name,
         e.origin,
         e.destination,
         e.amount,
         e.currency::text                  as currency,
         e.status,
         case when e.status in ('submitted', 'approved', 'reimbursed') then e.amount else 0 end as counted,
         null::text                        as provider,
         null::text                        as booking_reference,
         case when e.source = 'upload' then 'Employee upload' else 'Employee entry' end as entered_by,
         e.receipt_document_id is not null as has_receipt,
         null::uuid                        as import_batch_id,
         e.created_at
    from public.expenses e
    join public.profiles p on p.id = e.employee_id
    left join public.projects pj on pj.id = e.project_id
  union all
  select 'trip'::text,
         r.id,
         r.employee_id,
         p.full_name,
         p.employee_id,
         coalesce(nullif(btrim(p.department), ''), 'Not recorded'),
         r.departure_date,
         case r.booking_type::text when 'flight' then 'airfare' else r.booking_type::text end,
         concat_ws(' ', nullif(btrim(r.airline_or_provider), ''),
                   case when r.origin is not null or r.destination is not null
                        then concat_ws(' to ', r.origin, r.destination) end),
         r.project_id,
         coalesce(pj.name, nullif(btrim(r.project_raw), '')),
         r.origin,
         r.destination,
         r.amount,
         r.currency::text,
         r.status,
         case when r.status = 'cancelled' then 0 else coalesce(r.amount, 0) end,
         nullif(btrim(r.airline_or_provider), ''),
         r.booking_reference,
         case r.source when 'import' then 'Excel upload' when 'document' then 'Scanned ticket'
                       when 'bulk_booking' then 'Group booking' else 'Travel desk' end,
         false,
         r.import_batch_id,
         r.created_at
    from public.travel_records r
    join public.profiles p on p.id = r.employee_id
    left join public.projects pj on pj.id = r.project_id;

revoke all on public.spend_items from anon, public;
grant select on public.spend_items to authenticated;

-- Lenient date parser for the summary filters.
create or replace function private.try_date(value text)
returns date
language plpgsql immutable
set search_path = ''
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return value::date;
exception when others then
  return null;
end;
$$;
revoke all on function private.try_date(text) from public, anon;
grant execute on function private.try_date(text) to authenticated, service_role;

-- Totals over spend_items, grouped one way. Runs as the caller, so the totals
-- cover exactly the rows the caller may see.
--   p: { from, to, group_by, employee, project, department, category, source, status }
--   group_by: employee | project | department | category | month | week | source | status | none
create or replace function public.spend_summary(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_from date := private.try_date(p ->> 'from');
  v_to   date := private.try_date(p ->> 'to');
  v_group text := coalesce(nullif(p ->> 'group_by', ''), 'none');
  v_result jsonb;
begin
  if private.current_app_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_group not in ('employee', 'project', 'department', 'category', 'month', 'week', 'source', 'status', 'none') then
    raise exception 'Unknown grouping' using errcode = '22023';
  end if;
  if v_from is not null and v_to is not null and v_to < v_from then
    raise exception 'The end date is before the start date' using errcode = '22023';
  end if;

  with s as (
    select i.*,
           case v_group
             when 'employee'   then i.employee_name || ' (' || i.employee_code || ')'
             when 'project'    then coalesce(i.project_name, 'No project')
             when 'department' then i.department
             when 'category'   then i.category
             when 'month'      then to_char(i.spend_date, 'YYYY-MM')
             when 'week'       then to_char(date_trunc('week', i.spend_date), 'YYYY-MM-DD')
             when 'source'     then case i.source when 'claim' then 'Employee claims' else 'Travel desk trips' end
             when 'status'     then i.status
             else 'All'
           end as grp
      from public.spend_items i
     where (v_from is null or i.spend_date >= v_from)
       and (v_to is null or i.spend_date <= v_to)
       and (private.try_uuid(p ->> 'employee') is null or i.employee_id = private.try_uuid(p ->> 'employee'))
       and (coalesce(p ->> 'project', '') = ''
            or (p ->> 'project' = 'none' and i.project_id is null)
            or i.project_id = private.try_uuid(p ->> 'project'))
       and (coalesce(p ->> 'department', '') = '' or i.department = p ->> 'department')
       and (coalesce(p ->> 'category', '') = '' or i.category = p ->> 'category')
       and (coalesce(p ->> 'source', '') = '' or i.source = p ->> 'source')
       and (coalesce(p ->> 'status', '') = '' or i.status = p ->> 'status')
  )
  select jsonb_build_object(
    'filters', jsonb_build_object('from', v_from, 'to', v_to, 'group_by', v_group),
    'totals', (select jsonb_build_object(
        'records', count(*),
        'counted_amount', coalesce(sum(counted), 0),
        'claims', count(*) filter (where source = 'claim'),
        'claims_amount', coalesce(sum(counted) filter (where source = 'claim'), 0),
        'trips', count(*) filter (where source = 'trip'),
        'trips_amount', coalesce(sum(counted) filter (where source = 'trip'), 0),
        'not_counted_amount', coalesce(sum(amount) filter (where counted = 0 and amount is not null), 0),
        'missing_amount_records', count(*) filter (where amount is null),
        'people', count(distinct employee_id),
        'first_date', min(spend_date),
        'last_date', max(spend_date),
        'currencies', coalesce((select jsonb_agg(distinct c.currency) from s c), '[]'::jsonb))
      from s),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group', grp, 'records', n, 'counted_amount', total,
               'claims', claims, 'trips', trips, 'people', people)
             order by case when v_group in ('month', 'week') then null else total end desc nulls last, grp)
        from (select grp, count(*) n, coalesce(sum(counted), 0) total,
                     count(*) filter (where source = 'claim') claims,
                     count(*) filter (where source = 'trip') trips,
                     count(distinct employee_id) people
                from s group by grp
               order by 3 desc
               limit 200) g), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.spend_summary(jsonb) from public, anon;
grant execute on function public.spend_summary(jsonb) to authenticated;
