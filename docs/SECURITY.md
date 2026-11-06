# Trapple security guide

How the Supabase version of Trapple keeps travel data safe, how to check it,
and what to set up before going live.

## Where the trust boundaries are

| Layer | Trusted with | Never trusted with |
| --- | --- | --- |
| Browser (React on Vercel) | The user's own session token and the public anon key | Roles, other people's data, any secret key |
| Postgres (Row Level Security) | Every permission decision | Values sent by the browser without checks |
| Edge Functions (Deno) | `ANTHROPIC_API_KEY`, the service-role key (one call only) | Anything the model returns, until checked in code |
| Claude (scanner, assistant) | Reading a document or a question | SQL, keys, direct database access, final decisions |

The rule throughout: **the database decides**. Screens hide what a role cannot
do, but every read and write is checked again by RLS or by a database function.

## Controls

**Accounts and roles**
- Supabase Auth; roles live in `profiles.role` and are never taken from the
  browser or from JWT claims a user can edit.
- Only Admins can change roles, linked logins or account status
  (`guard_profiles`).

**Data access**
- RLS on every table. Employees see their own trips; approvers their team;
  Travel Desk and Admin everyone. Reports, dashboard counts and the assistant
  all run as the caller, so they follow the same rules.
- Every view is `security_invoker`. Every `security definer` function pins
  `search_path`. Signed-out visitors can call nothing and read nothing.
- Helpers that write data (`private.write_audit`, `private.bulk_sync_records`)
  cannot be called by users directly.

**Files**
- Private `travel-documents` bucket, one folder per employee, 10 MB limit,
  PDF / image types only, checked by file signature. Downloads use 60-second
  signed URLs.

**AI features**
- Scanner: the model fills a fixed JSON schema; values are checked against the
  document text; nothing becomes a trip until a person confirms it.
- Assistant: nine fixed read-only tools, validated arguments, results trimmed
  (no emails or ticket numbers) and capped at 50 rows; runs with the user's own
  token. Messages are written only by the server.
- Rate limits per user: 30 scans an hour, 50 questions a day.
- Prompts and documents are never written to logs; the audit log keeps ids,
  tool names and counts only.

**Audit**
- Append-only `audit_logs` (even the database owner cannot delete rows) for
  sign-in-relevant changes, approvals, imports, scans, bulk bookings, report
  downloads and assistant questions.

**Browser**
- Content-Security-Policy: scripts only from the site itself (no inline
  scripts, no `eval`), network only to Supabase and the legacy API, no framing,
  no plugins. Plus HSTS, `nosniff`, `X-Frame-Options: DENY`,
  `Cross-Origin-Opener-Policy`, and a strict `Permissions-Policy`.
- Production builds contain only React and Tailwind: the editor runtime, the
  browser log collector, source-location attributes and the storage proxy run
  in local development only.
- Record values placed into printable HTML are escaped; attachment previews
  only open base64 PDF / image data and build the frame with DOM calls.
- CSV downloads neutralise spreadsheet formulas.

## Tests

| Command | What it covers |
| --- | --- |
| `pnpm test` | Import parsing, ticket checks, bulk booking rules, report ranges, assistant tool validation, HTML escaping, security headers, dev-only build plugins |
| `pnpm test:rls` | 211 database checks: every role against every table and function, storage rules, rate limits, audit immutability, and catalogue-wide checks (RLS on, invoker views, pinned search paths, nothing open to signed-out visitors) |
| `pnpm check` | TypeScript |

Run `pnpm test:rls` against a disposable Supabase branch database before each
release as well; it rolls back everything it creates.

## Go-live checklist

1. `supabase db push`, then deploy `admin-users`, `document-extract` and
   `ai-assistant`.
2. Secrets: `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS` (the exact site origins,
   comma separated) and `INVITE_REDIRECT_URL` with `supabase secrets set`. Never prefix a secret with
   `VITE_`; anything `VITE_` is shipped to every browser.
3. Vercel environment: `VITE_AUTH_PROVIDER=supabase`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` only.
4. If Supabase is served from a custom domain, add it to `connect-src`,
   `img-src` and `frame-src` in `vercel.json`.
5. Supabase Auth settings: email confirmation on, leaked-password protection
   on, minimum password length 10+, and MFA required for Admin and Travel Desk
   accounts.
6. Create the first Admin with `bootstrap_first_admin.sql` (see
   `supabase/README.md`), then invite everyone else from the app.
7. Run `pnpm test:rls` against a branch database and check the response
   headers of the deployed site (for example with securityheaders.com).

## Retiring the legacy Spring Boot backend

The Spring Boot API (`backend/`, hosted on Render) is still used when
`VITE_AUTH_PROVIDER` is not `supabase`. Plan to retire it:

1. Import its data: export bookings to Excel and load them with
   **Excel / CSV import** (source `legacy`), then spot-check totals in Reports.
2. Run both for one billing cycle with Supabase as the live system and the old
   API read-only.
3. Remove the `/api` rewrite and `https://trapple.onrender.com` from
   `vercel.json`, shut down the Render service, and rotate or delete its
   database credentials and JWT secret.
4. Archive `backend/` on a `legacy-spring-boot` branch and delete it from the
   main branch, together with the legacy screens in `client/src/App.tsx`.

Until then, the legacy screens benefit from the same browser protections, and
the notification bell (a legacy-only feature) is hidden in Supabase mode.

## Reporting a problem

Report security issues privately to the repository owner rather than in a
public issue.
