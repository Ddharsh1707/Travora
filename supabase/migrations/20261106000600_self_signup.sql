-- =============================================================================
-- Self sign-up from the website's login page.
--
-- Before: invite only. A login was linked to an employee profile that an admin
-- had already created, once the email address was confirmed.
--
-- Now: people can also create their own account. Rules:
--   * Nothing happens until the email address is CONFIRMED (the link in the
--     confirmation email). Keep "Confirm email" switched ON in Supabase.
--   * If an admin already created a profile with that email, the login is
--     linked to it exactly as before (the admin-chosen role is kept).
--   * Otherwise a NEW profile is created with the lowest role, 'employee'.
--     The role is never read from sign-up data, so nobody can sign up as an
--     admin, approver or travel desk user. Admins promote people afterwards.
--   * Optional: list company email domains in private.signup_allowed_domains
--     to only accept sign-ups from those domains. Empty list = any domain.
-- =============================================================================

create table if not exists private.signup_allowed_domains (
  domain     extensions.citext primary key
             check (domain ~* '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);
alter table private.signup_allowed_domains enable row level security;
revoke all on private.signup_allowed_domains from public, anon, authenticated;

-- Comparisons use lower() because search_path is empty here, so citext's
-- case-insensitive operator would not be picked up.

-- Cleans the display name typed on the sign-up form (user-controlled input).
create or replace function private.clean_signup_name(p_name text, p_email text)
returns text
language sql immutable
set search_path = ''
as $$
  select coalesce(
    nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]<>]', '', 'g')), 200), ''),
    left(split_part(coalesce(p_email, ''), '@', 1), 200),
    'New employee'
  )
$$;

create or replace function private.signup_domain_allowed(p_email text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not exists (select 1 from private.signup_allowed_domains)
      or exists (select 1 from private.signup_allowed_domains d
                  where lower(d.domain::text) = lower(split_part(p_email, '@', 2)))
$$;

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

  -- 1. An admin-created profile with this email: link it (unchanged behaviour).
  update public.profiles
     set user_id = new.id
   where user_id is null
     and lower(email::text) = lower(new.email);
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
    insert into public.profiles (user_id, employee_id, full_name, email, role)
    values (
      new.id,
      'SELF-' || upper(right(replace(new.id::text, '-', ''), 12)),
      private.clean_signup_name(v_meta ->> 'full_name', new.email),
      lower(new.email),
      'employee'                      -- always the lowest role
    )
    returning id into v_profile_id;
    perform private.write_audit('self_signup', 'profiles', v_profile_id::text,
                                jsonb_build_object('source', 'signup', 'role', 'employee'));
  end if;
  return new;
end;
$$;

revoke all on function private.link_profile_on_confirm() from public, anon, authenticated;
revoke all on function private.clean_signup_name(text, text) from public, anon, authenticated;
revoke all on function private.signup_domain_allowed(text) from public, anon, authenticated;
