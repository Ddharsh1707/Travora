# Supabase (Phase 1)

Database, Row Level Security, private storage and Edge Functions for Trapple.
The full plan, including which credentials are needed and where they go, is in
the project plan document. Short version:

```bash
supabase login                         # uses your personal access token
supabase link --project-ref <ref>      # asks for the database password
supabase db push                       # applies supabase/migrations
supabase secrets set ALLOWED_ORIGINS=https://travora-ashy.vercel.app INVITE_REDIRECT_URL=https://travora-ashy.vercel.app/login
supabase functions deploy admin-users
```

Then run `bootstrap_first_admin.sql` in the SQL Editor and invite that email
from Authentication > Users. In Vercel set `VITE_AUTH_PROVIDER=supabase`,
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only).

## Tests

`pnpm test:rls` starts a throwaway PostgreSQL, loads small stand-ins for the
Supabase `auth` and `storage` schemas (`tests/local_stubs.sql`), applies every
migration and runs `tests/rls_test.sql`. It needs PostgreSQL 15+ binaries and
must run as a non-root user. The test file is wrapped in a rolled-back
transaction and can also be run against a disposable Supabase branch database.
