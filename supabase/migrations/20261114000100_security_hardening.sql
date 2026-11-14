-- Pre-launch security hardening (2026-11-14). Safe to run more than once.
--
-- Supabase gives the app roles every table privilege by default, including
-- TRUNCATE, TRIGGER and REFERENCES. TRUNCATE empties a table WITHOUT checking
-- row level security. The website never uses these, and the REST API cannot
-- send them today, but if any future path ever reached raw SQL as a signed-in
-- user, one statement could wipe a table. Take them away for good.

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- The report views are read-only for the app. (They already run as the caller,
-- so RLS applies; this just removes the unused write rights.)
revoke insert, update, delete on public.travel_records_search, public.employee_travel_summary,
  public.report_spend_monthly, public.report_routes_monthly, public.spend_items from anon, authenticated;
