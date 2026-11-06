-- =============================================================================
-- Separate Employee and CEO portals
--
-- The CEO is the existing 'admin' role (the UI calls it "CEO").
--
--  * expenses: employees file their own expense claims (meals, cabs, hotels…).
--    They see and edit only their own claims, and only while still submitted.
--    The CEO sees every claim and approves, rejects or marks it reimbursed
--    through decide_expense(), which is checked and audited.
--  * ceo_dashboard(): company-wide numbers for the CEO only.
--  * admin_create_login() / admin_reset_password(): with self sign-up switched
--    off, the CEO creates an employee's login (email + temporary password)
--    straight from the app. No invite email or SMTP is needed.
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.profiles (id) on delete restrict,
  travel_record_id     uuid references public.travel_records (id) on delete set null,
  expense_date         date not null,
  category             text not null check (category in (
                         'airfare', 'train', 'bus', 'cab', 'hotel', 'meals',
                         'local_transport', 'visa', 'communication', 'other')),
  description          text not null check (char_length(btrim(description)) between 1 and 500),
  amount               numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency             char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  payment_method       text not null default 'personal'
                       check (payment_method in ('personal', 'company_card', 'cash', 'upi', 'other')),
  receipt_document_id  uuid references public.documents (id) on delete set null,
  status               text not null default 'submitted'
                       check (status in ('submitted', 'approved', 'rejected', 'reimbursed', 'withdrawn')),
  review_note          text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  reimbursed_at        timestamptz,
  created_by           uuid references auth.users (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint expenses_date_sane check (expense_date between date '2000-01-01' and date '2100-12-31')
);

create index if not exists expenses_employee_idx on public.expenses (employee_id, expense_date desc);
create index if not exists expenses_status_idx   on public.expenses (status, expense_date desc);
create index if not exists expenses_date_idx     on public.expenses (expense_date);

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses
  after insert or update or delete on public.expenses
  for each row execute function private.audit_row_change();

-- Column rules RLS cannot express. Only applies to requests from the browser;
-- decide_expense() runs as its owner and has done its own checks.
create or replace function private.guard_expenses()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := private.current_profile_id();
  v_ceo boolean := private.has_role('admin');
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not v_ceo then
      new.employee_id := v_me;   -- employees only ever claim for themselves
    end if;
    new.status        := 'submitted';
    new.review_note   := null;
    new.reviewed_by   := null;
    new.reviewed_at   := null;
    new.reimbursed_at := null;
  else
    new.employee_id   := old.employee_id;
    new.created_by    := old.created_by;
    new.created_at    := old.created_at;
    new.review_note   := old.review_note;
    new.reviewed_by   := old.reviewed_by;
    new.reviewed_at   := old.reviewed_at;
    new.reimbursed_at := old.reimbursed_at;

    if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'reimbursed') then
      raise exception 'Use decide_expense() to approve, reject or reimburse' using errcode = '42501';
    end if;
    if old.employee_id is distinct from v_me and not v_ceo then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if old.status <> 'submitted' then
      raise exception 'Only submitted expenses can be changed' using errcode = '22023';
    end if;
    if new.status not in ('submitted', 'withdrawn') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  -- A receipt or trip must belong to the same employee as the claim.
  if new.receipt_document_id is not null and not exists (
       select 1 from public.documents d
        where d.id = new.receipt_document_id and d.employee_id = new.employee_id) then
    raise exception 'The receipt must be one of this employee''s documents' using errcode = '22023';
  end if;
  if new.travel_record_id is not null and not exists (
       select 1 from public.travel_records r
        where r.id = new.travel_record_id and r.employee_id = new.employee_id) then
    raise exception 'The trip must be one of this employee''s trips' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_guard on public.expenses;
create trigger expenses_guard
  before insert or update on public.expenses
  for each row execute function private.guard_expenses();

revoke all on function private.guard_expenses() from public, anon, authenticated;

alter table public.expenses enable row level security;
revoke all on public.expenses from anon;
revoke delete, truncate on public.expenses from authenticated;  -- withdraw instead of delete

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (private.can_view_employee(employee_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    private.has_role('admin')
    or (employee_id = private.current_profile_id() and private.current_app_role() is not null)
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (private.has_role('admin') or employee_id = private.current_profile_id())
  with check (private.has_role('admin') or employee_id = private.current_profile_id());

-- ---------------------------------------------------------------------------
-- CEO decision on a claim
-- ---------------------------------------------------------------------------
create or replace function public.decide_expense(p_expense uuid, p_decision text, p_note text default null)
returns public.expenses
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me  uuid := private.current_profile_id();
  v_row public.expenses;
begin
  if v_me is null or not private.has_role('admin') then
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
  if p_decision in ('approved', 'rejected') and v_row.status <> 'submitted' then
    raise exception 'Only submitted expenses can be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'reimbursed' and v_row.status <> 'approved' then
    raise exception 'Only approved expenses can be marked reimbursed' using errcode = '22023';
  end if;

  update public.expenses
     set status        = p_decision,
         review_note   = coalesce(nullif(btrim(p_note), ''), review_note),
         reviewed_by   = v_me,
         reviewed_at   = case when p_decision = 'reimbursed' then coalesce(reviewed_at, now()) else now() end,
         reimbursed_at = case when p_decision = 'reimbursed' then now() else reimbursed_at end
   where id = p_expense
  returning * into v_row;
  return v_row;  -- the audit trigger records status_from / status_to
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO dashboard: one call, company-wide numbers
-- ---------------------------------------------------------------------------
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
  if not private.has_role('admin') then
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

-- ---------------------------------------------------------------------------
-- Logins for employees (sign-up is off, so the CEO creates them)
-- ---------------------------------------------------------------------------
create or replace function private.password_ok(p_password text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_password is not null
     and char_length(p_password) between 12 and 72
     and p_password ~ '[a-z]' and p_password ~ '[A-Z]' and p_password ~ '[0-9]'
$$;
revoke all on function private.password_ok(text) from public, anon, authenticated;

-- Creates a confirmed email/password login for an employee profile and links
-- it. The employee signs in with their email and this temporary password.
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
  if not private.has_role('admin') then
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
    -- A login with this email already exists (e.g. made in the dashboard): set
    -- the password, confirm it and link it.
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
      jsonb_build_object('full_name', v_profile.full_name, 'created_by', 'ceo'),
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

-- Sets a new temporary password for an employee who forgot theirs.
create or replace function public.admin_reset_password(p_profile_id uuid, p_password text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not private.has_role('admin') then
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

revoke all on function public.decide_expense(uuid, text, text) from public, anon;
revoke all on function public.ceo_dashboard(date, date) from public, anon;
revoke all on function public.admin_create_login(uuid, text) from public, anon;
revoke all on function public.admin_reset_password(uuid, text) from public, anon;
grant execute on function public.decide_expense(uuid, text, text) to authenticated;
grant execute on function public.ceo_dashboard(date, date) to authenticated;
grant execute on function public.admin_create_login(uuid, text) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;

-- CEO's people list: every employee, their manager's name and whether they
-- can sign in yet.
create or replace function public.admin_list_people()
returns table (
  id uuid, employee_id text, full_name text, email text, department text, designation text,
  role public.app_role, manager_id uuid, manager_name text, active boolean, has_login boolean,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.has_role('admin') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, p.employee_id, p.full_name, p.email::text, p.department, p.designation,
           p.role, p.manager_id, m.full_name, p.active, p.user_id is not null, p.created_at
      from public.profiles p
      left join public.profiles m on m.id = p.manager_id
     order by p.active desc, lower(p.full_name);
end;
$$;
revoke all on function public.admin_list_people() from public, anon;
grant execute on function public.admin_list_people() to authenticated;

-- Live updates for the expense screens (Realtime still applies RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses') then
    alter publication supabase_realtime add table public.expenses;
  end if;
end;
$$;
