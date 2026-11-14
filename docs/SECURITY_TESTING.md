# Security testing

Three layers of automatic checks guard the app. All of them are read-only for
real data.

| Check | Where it runs | What it proves |
|---|---|---|
| **Database security sweep** (`supabase/tests/security_sweep_test.sql`) | Every pull request (Checks > Database security) | Reads the database catalogue, so new tables and functions are covered automatically: RLS on every table, views run as the caller, logged-out visitors get nothing, an employee sees no other employee's rows in any table, every Travel Desk / Director function refuses an employee, no self-promotion, no TRUNCATE. |
| **App security tests** (`client/src/__tests__/prelaunch_security.test.ts`) | Every pull request (Checks > App) | AI answers cannot run HTML or load pictures; every Edge Function checks the sign-in and role itself; CORS never allows `*`; no keys or tokens in any committed file; strict security headers; CSV formula neutralising; password-reset screen present. Plus `pnpm audit` fails the build on any critical package flaw. |
| **Live security check** (`scripts/security/live-check.mjs`) | GitHub Actions > *Live security check*: every Monday, after each functions deploy, or by hand | Looks at the public site as an outsider: HTTPS and headers, secrets in the downloaded JavaScript, every table and bucket through the public API, public sign-up settings, and each function with no token, the public key and a forged Director token, plus CORS from a hostile website. |

Run the live check by hand: GitHub > **Actions** > **Live security check** >
**Run workflow**. The table on the run's **Summary** page lists every check; a
red run means something failed and says what to change.

Locally: `pnpm test`, `pnpm test:rls` (needs PostgreSQL, run as a non-root
user) and `node scripts/security/live-check.mjs https://your-site`.

## Settings that live outside the code

The live check reads the first two from Supabase's public settings and fails if
they are wrong.

1. **Supabase > Authentication > Sign In / Providers**: turn **off** "Allow new
   users to sign up". The page hides the form, but with sign-ups on anyone can
   create an account through the API using the public key.
2. Same page, Email provider: **Confirm email** must stay **on**; minimum
   password length 12 with upper case, lower case and digits.
3. **Authentication > URL Configuration**: Site URL = the live site; Redirect URLs
   = only `https://<live site>/login` (no wildcards, no old sites).
4. Function secrets are set by the *Deploy Supabase functions* workflow:
   `ALLOWED_ORIGINS` is only the live site unless the `ALLOWED_ORIGINS` repository
   variable says otherwise; `INVITE_REDIRECT_URL` points invites at `/login`.
5. GitHub: branch protection on `main` as in `docs/BRANCH_PROTECTION.md`, and only
   trusted people with write access.

## Roles

The Travel Desk role (`company_admin`) has every Director power by design,
including changing roles and resetting anyone's password. Give it to as few
people as possible.
