-- =============================================================================
-- Self sign-up only gives access to allowed company email domains
--
-- Until now an EMPTY private.signup_allowed_domains list meant "any domain":
-- if self sign-up was switched on in Supabase Auth, anyone who confirmed an
-- email address got an employee profile. The list is empty on the live
-- project, so a stranger could get an employee login.
--
-- After this migration an empty list means "no domain": a self sign-up only
-- gets an employee profile when its email domain is listed. Add your domain
-- with the SQL in docs/SIGNUP.md if people should be able to sign themselves up.
--
-- Unchanged:
--  * Logins made by the Director or Travel Desk (admin_create_login) and
--    invites still link to the employee profile an admin created, whatever
--    the domain (step 1 of private.link_profile_on_confirm()).
--  * Existing accounts and profiles are not touched.
--  * Only the database can read or change the allowlist.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function private.signup_domain_allowed(p_email text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from private.signup_allowed_domains d
                  where lower(d.domain::text) = lower(split_part(p_email, '@', 2)))
$$;

revoke all on function private.signup_domain_allowed(text) from public, anon, authenticated;
