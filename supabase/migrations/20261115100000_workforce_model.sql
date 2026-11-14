-- =============================================================================
-- Temporary workforce, part 1: the data model
--
-- Uploaded travel sheets often name people who are not permanent employees:
-- temporary labourers, contract workers, outsourced staff. Until now an
-- unmatched name could only become an "employee" profile (code NEW-xxxxxxxx).
-- This adds what is needed to tell these people apart, without a second
-- person table: every trip, expense and document keeps pointing at profiles.
--
-- What this adds (nothing is dropped, no trip or cost is changed):
--  * profiles.workforce_type: permanent_employee, temporary_worker,
--    contract_worker, outsourced_worker or unknown.
--  * profiles.verification_status: imported_unverified, verified,
--    possible_duplicate or merged. "Inactive" stays the existing active flag.
--  * profiles.source (manual, import, signup), contractor_id,
--    primary_project_id, work_location, contact_phone and merged_into.
--    All optional; nothing is guessed.
--  * contractors: labour suppliers, one row per company and name.
--  * person_aliases: name spellings that belong to a person, remembered
--    across uploads.
--  * identity_merges: the record of every merge, with exactly what moved,
--    so a merge can be checked and undone.
--
-- Existing people: profiles an upload created (code NEW-..., no login) are
-- marked unknown + imported_unverified. Everyone else is marked
-- permanent_employee + verified. Run once; re-running changes nothing.
--
-- Who can do what:
--  * Reading contractors, aliases and merges: the travel desk, the Travel
--    Desk (company_admin) and the Director. Approvers and employees cannot.
--  * Changing them: only through checked functions (added in later parts).
--  * Logins: only permanent employees who are not merged can be given one.
--    Imported workers never get a login automatically.
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Who may look after the workforce
-- ---------------------------------------------------------------------------
create or replace function private.can_view_workforce()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_staff()
$$;

create or replace function private.can_manage_workforce()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_manager()
$$;

revoke all on function private.can_view_workforce() from public, anon;
revoke all on function private.can_manage_workforce() from public, anon;
grant execute on function private.can_view_workforce() to authenticated, service_role;
grant execute on function private.can_manage_workforce() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Contractors (labour suppliers). Not the travel agent: that stays
-- travel_records.airline_or_provider / consultant.
-- ---------------------------------------------------------------------------
create table if not exists public.contractors (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  name_key    text generated always as (private.alias_key(name)) stored,
  notes       text check (notes is null or char_length(notes) <= 1000),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint contractors_name_key_present check (name_key is not null),
  constraint contractors_company_name_key unique (company_id, name_key)
);

drop trigger if exists contractors_set_updated_at on public.contractors;
create trigger contractors_set_updated_at
  before update on public.contractors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New facts on a person
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists workforce_type      text,
  add column if not exists verification_status text,
  add column if not exists source              text,
  add column if not exists contractor_id       uuid references public.contractors (id) on delete set null,
  add column if not exists primary_project_id  uuid references public.projects (id) on delete set null,
  add column if not exists work_location       text check (work_location is null or char_length(btrim(work_location)) between 1 and 120),
  add column if not exists contact_phone       text check (contact_phone is null or contact_phone ~ '^[0-9+() -]{6,20}$'),
  add column if not exists merged_into         uuid references public.profiles (id) on delete set null;

-- Existing people, from facts the database already has. Only rows that were
-- never classified are touched, so running this file again changes nothing.
update public.profiles p
   set workforce_type      = case when p.employee_id like 'NEW-%' and p.user_id is null
                                  then 'unknown' else 'permanent_employee' end,
       verification_status = case when p.employee_id like 'NEW-%' and p.user_id is null
                                  then 'imported_unverified' else 'verified' end,
       source              = case when p.employee_id like 'NEW-%' and p.user_id is null then 'import'
                                  when p.employee_id like 'SELF-%' then 'signup'
                                  else 'manual' end
 where p.workforce_type is null;

alter table public.profiles
  alter column workforce_type      set default 'permanent_employee',
  alter column workforce_type      set not null,
  alter column verification_status set default 'verified',
  alter column verification_status set not null,
  alter column source              set default 'manual',
  alter column source              set not null;

alter table public.profiles drop constraint if exists profiles_workforce_type_check;
alter table public.profiles add constraint profiles_workforce_type_check
  check (workforce_type in ('permanent_employee', 'temporary_worker', 'contract_worker', 'outsourced_worker', 'unknown'));
alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('imported_unverified', 'verified', 'possible_duplicate', 'merged'));
alter table public.profiles drop constraint if exists profiles_source_check;
alter table public.profiles add constraint profiles_source_check
  check (source in ('manual', 'import', 'signup'));
alter table public.profiles drop constraint if exists profiles_merge_state;
alter table public.profiles add constraint profiles_merge_state
  check ((verification_status = 'merged') = (merged_into is not null) and (merged_into is null or merged_into <> id));

create index if not exists profiles_workforce_type_idx on public.profiles (workforce_type);
create index if not exists profiles_verification_idx  on public.profiles (verification_status);
create index if not exists profiles_contractor_idx    on public.profiles (contractor_id) where contractor_id is not null;
create index if not exists profiles_primary_project_idx on public.profiles (primary_project_id) where primary_project_id is not null;
create index if not exists profiles_merged_into_idx   on public.profiles (merged_into) where merged_into is not null;

-- ---------------------------------------------------------------------------
-- Name spellings that belong to a person ("R. Kumar" -> Ravi Kumar).
-- Matching uses the same key as uploads (private.person_name_key).
-- ---------------------------------------------------------------------------
create table if not exists public.person_aliases (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  alias            text not null check (char_length(btrim(alias)) between 1 and 200),
  alias_key        text generated always as (private.person_name_key(alias)) stored,
  source           text not null default 'manual' check (source in ('manual', 'import_link', 'merge')),
  import_batch_id  uuid references public.import_batches (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint person_aliases_key_present check (alias_key is not null),
  constraint person_aliases_company_key unique (company_id, alias_key)
);

create index if not exists person_aliases_profile_idx on public.person_aliases (profile_id);

-- ---------------------------------------------------------------------------
-- Merge history. "moved" lists the exact ids that were moved, for example
-- {"travel_records": [...], "expenses": [...], "documents": [...], "aliases": [...]},
-- so a merge can be reviewed and reversed. Trips and costs are never deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.identity_merges (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default private.default_company_id() references public.companies (id) on delete restrict,
  from_profile  uuid not null references public.profiles (id) on delete cascade,
  into_profile  uuid not null references public.profiles (id) on delete cascade,
  moved         jsonb not null default '{}'::jsonb check (jsonb_typeof(moved) = 'object'),
  evidence      text not null check (char_length(btrim(evidence)) between 3 and 2000),
  merged_by     uuid references auth.users (id) on delete set null default auth.uid(),
  merged_at     timestamptz not null default now(),
  reversed_by   uuid references auth.users (id) on delete set null,
  reversed_at   timestamptz,
  constraint identity_merges_two_people check (from_profile <> into_profile),
  constraint identity_merges_reversal check ((reversed_at is null) = (reversed_by is null))
);

create index if not exists identity_merges_from_idx on public.identity_merges (from_profile, merged_at desc);
create index if not exists identity_merges_into_idx on public.identity_merges (into_profile, merged_at desc);

-- ---------------------------------------------------------------------------
-- Access: read-only for the travel desk, Travel Desk and Director.
-- Every change goes through checked functions (later parts).
-- ---------------------------------------------------------------------------
alter table public.contractors     enable row level security;
alter table public.person_aliases  enable row level security;
alter table public.identity_merges enable row level security;

revoke all on public.contractors, public.person_aliases, public.identity_merges from anon, public;
revoke insert, update, delete, truncate, trigger, references
  on public.contractors, public.person_aliases, public.identity_merges from authenticated;
grant select on public.contractors, public.person_aliases, public.identity_merges to authenticated;

drop policy if exists contractors_select on public.contractors;
create policy contractors_select on public.contractors
  for select to authenticated
  using (company_id = private.default_company_id() and private.can_view_workforce());

drop policy if exists person_aliases_select on public.person_aliases;
create policy person_aliases_select on public.person_aliases
  for select to authenticated
  using (company_id = private.default_company_id() and private.can_view_workforce());

drop policy if exists identity_merges_select on public.identity_merges;
create policy identity_merges_select on public.identity_merges
  for select to authenticated
  using (company_id = private.default_company_id() and private.can_view_workforce());

drop trigger if exists audit_contractors on public.contractors;
create trigger audit_contractors
  after insert or update or delete on public.contractors
  for each row execute function private.audit_row_change();
drop trigger if exists audit_person_aliases on public.person_aliases;
create trigger audit_person_aliases
  after insert or update or delete on public.person_aliases
  for each row execute function private.audit_row_change();
drop trigger if exists audit_identity_merges on public.identity_merges;
create trigger audit_identity_merges
  after insert or update on public.identity_merges
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Guard: who may set the new facts on a person, and who may have a login.
-- ---------------------------------------------------------------------------
create or replace function private.guard_profile_workforce()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      -- Added by hand on the People screen. Only the Travel Desk and the
      -- Director may add someone who is not a permanent employee.
      if new.workforce_type <> 'permanent_employee' and not private.can_manage_workforce() then
        raise exception 'Only the Travel Desk or the Director can add temporary, contract or outsourced workers'
          using errcode = '42501';
      end if;
      new.source              := 'manual';
      new.verification_status := 'verified';
      new.merged_into         := null;
      new.contractor_id       := null;
      new.primary_project_id  := null;
    elsif new.employee_id like 'NEW-%' and new.user_id is null
          and new.source = 'manual' and new.verification_status = 'verified' then
      -- An unmatched name added by an upload function that does not set
      -- these facts itself (they give such people a NEW-xxxxxxxx code).
      new.workforce_type      := 'unknown';
      new.verification_status := 'imported_unverified';
      new.source              := 'import';
    end if;
  elsif current_user = 'authenticated' then
    -- Plain updates from the browser keep these; checked functions change them.
    new.workforce_type      := old.workforce_type;
    new.verification_status := old.verification_status;
    new.source              := old.source;
    new.merged_into         := old.merged_into;
    new.contractor_id       := old.contractor_id;
    new.primary_project_id  := old.primary_project_id;
  end if;

  -- For everyone, including checked functions: only a permanent employee
  -- who has not been merged into someone else can have a login.
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id)
     and (new.workforce_type <> 'permanent_employee' or new.merged_into is not null) then
    raise exception 'Only permanent employees can have a login. Change this person''s type to permanent employee first.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_workforce() from public, anon, authenticated;

drop trigger if exists profiles_workforce_guard on public.profiles;
create trigger profiles_workforce_guard
  before insert or update on public.profiles
  for each row execute function private.guard_profile_workforce();

-- ---------------------------------------------------------------------------
-- Email confirmation: link a login only to a permanent employee's profile.
-- (Same as 20261106000600_self_signup.sql, plus the workforce checks. A
-- confirmation never fails: a non-permanent profile is simply not linked.)
-- ---------------------------------------------------------------------------
create or replace function private.link_profile_on_confirm()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(to_jsonb(new) -> 'raw_user_meta_data', '{}'::jsonb);
  v_profile_id uuid;
begin
  if new.email_confirmed_at is null
     or not (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    return new;
  end if;

  -- 1. An admin-created permanent employee with this email: link it.
  update public.profiles
     set user_id = new.id
   where user_id is null
     and lower(email::text) = lower(new.email)
     and workforce_type = 'permanent_employee'
     and merged_into is null;
  if found then
    perform private.write_audit('link_login', 'profiles', new.id::text,
                                jsonb_build_object('source', 'auth'));
    return new;
  end if;

  -- 2. A self sign-up with no matching profile: create a basic employee one.
  if v_meta ->> 'signup_source' = 'self'
     and new.email is not null
     and private.signup_domain_allowed(new.email)
     and not exists (select 1 from public.profiles p
                      where p.user_id = new.id
                         or lower(p.email::text) = lower(new.email)) then
    insert into public.profiles (user_id, employee_id, full_name, email, role,
                                 workforce_type, verification_status, source)
    values (
      new.id,
      'SELF-' || upper(right(replace(new.id::text, '-', ''), 12)),
      private.clean_signup_name(v_meta ->> 'full_name', new.email),
      lower(new.email),
      'employee',                     -- always the lowest role
      'permanent_employee', 'verified', 'signup'
    )
    returning id into v_profile_id;
    perform private.write_audit('self_signup', 'profiles', v_profile_id::text,
                                jsonb_build_object('source', 'signup', 'role', 'employee'));
  end if;
  return new;
end;
$$;

revoke all on function private.link_profile_on_confirm() from public, anon, authenticated;
