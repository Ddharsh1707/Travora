-- =============================================================================
-- Phase 1: authorization helpers, Row Level Security, guarded RPCs, auditing
--
-- Rules of thumb used here
--  * Every table has RLS on. No policy = no access.
--  * The anon (logged-out) role gets nothing.
--  * Helpers live in schema `private`, which is NOT exposed through the REST
--    API, so nobody can call them directly over HTTP.
--  * A deactivated profile, or a login with no profile, has no role and
--    therefore no access.
--  * Status changes that matter (approve/reject) and role changes only happen
--    through checked functions, never through a plain UPDATE from the browser.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Identity helpers (security definer so they can read profiles without
-- recursing into profiles' own RLS policies)
-- ---------------------------------------------------------------------------
create or replace function private.current_profile_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.user_id = auth.uid() and p.active
$$;

create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.user_id = auth.uid() and p.active
$$;

create or replace function private.has_role(variadic roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (roles), false)
$$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_role('travel_desk', 'admin')
$$;

-- True when the caller is an approver who is the employee's direct manager,
-- or who is the assigned approver on one of the employee's requests.
create or replace function private.approver_scope_includes(target_employee uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_role('approver')
     and (
       exists (select 1 from public.profiles p
               where p.id = target_employee
                 and p.manager_id = private.current_profile_id())
       or exists (select 1 from public.travel_requests r
                  where r.employee_id = target_employee
                    and r.approver_id = private.current_profile_id())
     )
$$;

create or replace function private.can_view_employee(target_employee uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select target_employee is not null
     and private.current_app_role() is not null
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
      and (private.can_view_employee(r.employee_id)
           or r.approver_id = private.current_profile_id())
  )
$$;

create or replace function private.my_manager_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.manager_id from public.profiles p
  where p.user_id = auth.uid() and p.active
$$;

create or replace function private.try_uuid(value text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit writer. Records WHO did WHAT to WHICH row and WHEN.
-- Stores column NAMES that changed, not their values, so personal data and
-- money amounts are not copied into the log. Status / role transitions are
-- recorded explicitly because they are the facts auditors ask for.
-- ---------------------------------------------------------------------------
create or replace function private.write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed text[];
  v_meta jsonb := '{}'::jsonb;
  v_id text := coalesce(v_new ->> 'id', v_old ->> 'id');
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}')
      into v_changed
      from jsonb_object_keys(v_new) k
     where k <> 'updated_at' and (v_new -> k) is distinct from (v_old -> k);
    if array_length(v_changed, 1) is null then
      return null; -- nothing meaningful changed
    end if;
    v_meta := jsonb_build_object('changed', to_jsonb(v_changed));
    if 'status' = any (v_changed) then
      v_meta := v_meta || jsonb_build_object('status_from', v_old ->> 'status', 'status_to', v_new ->> 'status');
    end if;
    if 'role' = any (v_changed) then
      v_meta := v_meta || jsonb_build_object('role_from', v_old ->> 'role', 'role_to', v_new ->> 'role');
    end if;
  end if;

  if v_new ? 'employee_id' or v_old ? 'employee_id' then
    v_meta := v_meta || jsonb_build_object('employee', coalesce(v_new ->> 'employee_id', v_old ->> 'employee_id'));
  end if;

  perform private.write_audit(lower(tg_op), tg_table_name, v_id, v_meta);
  return null;
end;
$$;

create trigger audit_profiles         after insert or update or delete on public.profiles        for each row execute function private.audit_row_change();
create trigger audit_travel_requests  after insert or update or delete on public.travel_requests for each row execute function private.audit_row_change();
create trigger audit_travel_records   after insert or update or delete on public.travel_records  for each row execute function private.audit_row_change();
create trigger audit_documents        after insert or update or delete on public.documents       for each row execute function private.audit_row_change();
create trigger audit_approvals        after insert on public.approvals                           for each row execute function private.audit_row_change();

-- audit_logs is append-only for everyone, including the service role.
create or replace function private.block_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.block_audit_mutation();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.block_audit_mutation();

-- ---------------------------------------------------------------------------
-- Guard triggers: column-level rules RLS cannot express on its own.
-- They only restrict callers whose database role is `authenticated`, i.e.
-- requests straight from the browser. Checked server functions run as their
-- owner and have already done their own authorization.
-- ---------------------------------------------------------------------------
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

  -- Travel Desk may maintain employee details but never roles or logins.
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
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function private.guard_profiles();

create or replace function private.guard_travel_requests()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.current_profile_id();
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not private.is_staff() then
      -- Employees always start at pending and are routed to their own manager.
      new.status := 'pending';
      select p.manager_id into new.approver_id from public.profiles p where p.id = new.employee_id;
    end if;
    return new;
  end if;

  -- UPDATE
  new.employee_id := old.employee_id;   -- a request never changes owner
  new.created_by  := old.created_by;
  new.created_at  := old.created_at;

  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    raise exception 'Use decide_travel_request() to approve or reject' using errcode = '42501';
  end if;

  if not private.is_staff() then
    -- Owner edits: only while pending; may cancel; may not re-route approval.
    if old.employee_id is distinct from v_me then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if old.status <> 'pending' then
      raise exception 'Only pending requests can be changed' using errcode = '42501';
    end if;
    if new.status not in ('pending', 'cancelled') then
      raise exception 'Employees can only cancel their own requests' using errcode = '42501';
    end if;
    new.approver_id := old.approver_id;
  end if;
  return new;
end;
$$;

create trigger travel_requests_guard
  before insert or update on public.travel_requests
  for each row execute function private.guard_travel_requests();

create or replace function private.guard_owned_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger travel_records_guard
  before insert or update on public.travel_records
  for each row execute function private.guard_owned_rows();

create or replace function private.guard_documents()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.uploaded_by := auth.uid();
    else
      new.uploaded_by  := old.uploaded_by;
      new.storage_path := old.storage_path;
      new.employee_id  := old.employee_id;
      new.created_at   := old.created_at;
    end if;
  end if;
  -- The file must live in the folder of the employee it belongs to.
  if split_part(new.storage_path, '/', 1) <> new.employee_id::text then
    raise exception 'storage_path must start with the employee id' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger documents_guard
  before insert or update on public.documents
  for each row execute function private.guard_documents();

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants table privileges to anon/authenticated by default;
-- tighten that. RLS still decides which rows.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;

revoke all on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;              -- rows: admins only (policy)
revoke insert, update, delete on public.approvals from authenticated;
grant select on public.approvals to authenticated;               -- writes via decide_travel_request()
revoke insert, update, delete on public.ai_messages from authenticated;
grant select on public.ai_messages to authenticated;             -- written by the AI Edge Function
revoke delete on public.profiles, public.travel_requests from authenticated;  -- deactivate / cancel instead

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.travel_requests   enable row level security;
alter table public.travel_records    enable row level security;
alter table public.documents         enable row level security;
alter table public.approvals         enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.ai_conversations  enable row level security;
alter table public.ai_messages       enable row level security;

-- profiles --------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    private.can_view_employee(id)
    -- everyone may see who their own manager is
    or id = private.my_manager_id()
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (private.is_staff());

create policy profiles_update on public.profiles
  for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

-- travel_requests -------------------------------------------------------------
create policy travel_requests_select on public.travel_requests
  for select to authenticated
  using (
    private.can_view_employee(employee_id)
    or approver_id = private.current_profile_id()
  );

create policy travel_requests_insert on public.travel_requests
  for insert to authenticated
  with check (
    private.is_staff()
    or (employee_id = private.current_profile_id() and private.current_app_role() is not null)
  );

create policy travel_requests_update on public.travel_requests
  for update to authenticated
  using (private.is_staff() or employee_id = private.current_profile_id())
  with check (private.is_staff() or employee_id = private.current_profile_id());

-- travel_records --------------------------------------------------------------
create policy travel_records_select on public.travel_records
  for select to authenticated
  using (private.can_view_employee(employee_id));

create policy travel_records_insert on public.travel_records
  for insert to authenticated
  with check (private.is_staff());

create policy travel_records_update on public.travel_records
  for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create policy travel_records_delete on public.travel_records
  for delete to authenticated
  using (private.has_role('admin'));

-- documents -------------------------------------------------------------------
create policy documents_select on public.documents
  for select to authenticated
  using (private.can_view_employee(employee_id));

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    private.is_staff()
    or (employee_id = private.current_profile_id() and private.current_app_role() is not null)
  );

create policy documents_update on public.documents
  for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create policy documents_delete on public.documents
  for delete to authenticated
  using (private.is_staff());

-- approvals -------------------------------------------------------------------
create policy approvals_select on public.approvals
  for select to authenticated
  using (private.can_view_request(request_id));

-- audit_logs ------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (private.has_role('admin'));

-- ai_conversations / ai_messages ---------------------------------------------
create policy ai_conversations_select on public.ai_conversations
  for select to authenticated
  using (user_id = auth.uid());

create policy ai_conversations_insert on public.ai_conversations
  for insert to authenticated
  with check (user_id = auth.uid() and private.current_app_role() is not null);

create policy ai_conversations_delete on public.ai_conversations
  for delete to authenticated
  using (user_id = auth.uid());

create policy ai_messages_select on public.ai_messages
  for select to authenticated
  using (exists (select 1 from public.ai_conversations c
                 where c.id = conversation_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Checked RPCs (callable from the browser via supabase.rpc)
-- ---------------------------------------------------------------------------

-- Approve or reject a request. Authorization is decided here, not in the UI.
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
  v_me   uuid := private.current_profile_id();
  v_role public.app_role := private.current_app_role();
  v_req  public.travel_requests;
begin
  if v_me is null or v_role not in ('approver', 'admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_req from public.travel_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.employee_id = v_me then
    raise exception 'You cannot decide your own request' using errcode = '42501';
  end if;
  if v_role = 'approver'
     and v_req.approver_id is distinct from v_me
     and not exists (select 1 from public.profiles p
                     where p.id = v_req.employee_id and p.manager_id = v_me) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Request is no longer pending' using errcode = '22023';
  end if;
  if p_comments is not null and char_length(p_comments) > 2000 then
    raise exception 'Comment too long' using errcode = '22001';
  end if;

  insert into public.approvals (request_id, approver_id, status, comments)
  values (p_request_id, v_me, p_decision, nullif(btrim(p_comments), ''));

  update public.travel_requests
     set status = p_decision::text::public.request_status,
         approver_id = v_me
   where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

-- Change a user's role. Admins only, and the last admin cannot be removed.
create or replace function public.admin_set_role(p_profile_id uuid, p_role public.app_role)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not private.has_role('admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_profile.role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
    raise exception 'At least one active administrator is required' using errcode = '22023';
  end if;

  update public.profiles set role = p_role where id = p_profile_id returning * into v_profile;
  return v_profile;  -- the audit trigger records role_from / role_to
end;
$$;

-- Activate / deactivate an account. Admins only; cannot lock yourself out.
create or replace function public.admin_set_active(p_profile_id uuid, p_active boolean)
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not private.has_role('admin') then
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

-- What the signed-in user is allowed to be. The UI uses this for navigation;
-- the database does not trust it for anything.
create or replace function public.get_my_profile()
returns table (
  id uuid, employee_id text, full_name text, email text, department text,
  designation text, role public.app_role, manager_id uuid
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.employee_id, p.full_name, p.email::text, p.department,
         p.designation, p.role, p.manager_id
    from public.profiles p
   where p.user_id = auth.uid() and p.active
$$;

revoke all on function public.decide_travel_request(uuid, public.approval_status, text) from public, anon;
revoke all on function public.admin_set_role(uuid, public.app_role) from public, anon;
revoke all on function public.admin_set_active(uuid, boolean) from public, anon;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.decide_travel_request(uuid, public.approval_status, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
-- set_updated_at is a trigger helper, not an API.
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Link a login to its employee profile once the email is confirmed.
-- Sign-ups are disabled (invite only); matching only on CONFIRMED email
-- stops someone claiming an employee's profile with an unverified address.
-- ---------------------------------------------------------------------------
create or replace function private.link_profile_on_confirm()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    update public.profiles
       set user_id = new.id
     where user_id is null
       and email = new.email::extensions.citext;
    if found then
      perform private.write_audit('link_login', 'profiles', new.id::text,
                                  jsonb_build_object('source', 'auth'));
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.link_profile_on_confirm();
