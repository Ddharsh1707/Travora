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

## Phase 4: ticket / PDF scanner

```bash
supabase secrets set ANTHROPIC_API_KEY=<your key>       # server-side only, never VITE_
# optional: supabase secrets set ANTHROPIC_MODEL=claude-opus-5-5
supabase functions deploy document-extract
```

Anyone can upload their own tickets at **Tickets & documents**; Travel Desk
and Admin can upload for any employee, scan, and confirm.

- The scanner reads the PDF's text layer first. Only when there is no usable
  text (a scanned PDF or a photo) is the file itself sent to the model to read.
- The model can only fill a fixed JSON schema. Every value is checked again in
  `functions/_shared/ticket.ts`: impossible dates, negative amounts and odd
  codes are dropped, and a PNR, ticket number or passenger name that is not
  printed in the document text is flagged "check". A passenger name that does
  not match the employee is flagged too.
- Nothing becomes a trip until a person presses **Confirm and save trip**,
  which calls `document_confirm()`. The database validates the fields again,
  attaches the document to an existing trip with the same PNR and date instead
  of creating a duplicate, and writes an audit entry (ids only, no booking
  details). A plain API update cannot mark a document confirmed.
- 30 scans per person per hour (`consume_rate_limit`). The limit lives in the
  database, so callers cannot raise it.
- The function runs every query as the signed-in user, so RLS applies. It does
  not use the service-role key.
- What is sent to Anthropic: the document text (or file, when it has no text
  layer). Nothing else from the database.

## Phase 5: bulk / group bookings

**Bulk & group bookings** (`/travel/bulk`) is for Travel Desk, Admin and
approvers. Nothing to deploy beyond `supabase db push`.

- Travellers are real employees (add by name or paste employee IDs, up to
  500). Each one gets their own travel record (`source = 'bulk_booking'`), so
  the trip appears in their history, search and totals straight away. An
  existing trip with the same person, date and PNR is re-used, not duplicated.
- Cost is split evenly unless a traveller has their own amount; PNR defaults
  to the group reference.
- Removing a traveller cancels their trip; cancelling the booking cancels all
  of them. Changing cost, date or destination sends it back for review.
- Approvers review the group budget for bookings with their team on board,
  and see only their own team on the manifest. Employees see only their own
  row. Nobody reviews a booking they created.
- Tickets per traveller are normal documents attached to that traveller's
  trip, so the scanner and its privacy rules apply to them too.
- Tables are read-only to the API; `bulk_save`, `bulk_cancel` and
  `bulk_review` do all writes and are audited.
