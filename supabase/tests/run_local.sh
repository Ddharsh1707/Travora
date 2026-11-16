#!/usr/bin/env bash
# Spins up a throwaway PostgreSQL, applies Supabase stand-ins + all migrations,
# then runs the RLS test suite. Usage: supabase/tests/run_local.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
cleanup() { "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At)
"${PSQL[@]}" -f "$HERE/local_stubs.sql"
for f in "$HERE"/../migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$HERE/rls_test.sql"
"${PSQL[@]}" -f "$HERE/intelligence_test.sql"
"${PSQL[@]}" -f "$HERE/admin_portal_test.sql"
"${PSQL[@]}" -f "$HERE/requests_pdf_test.sql"
"${PSQL[@]}" -f "$HERE/delete_reset_test.sql"
"${PSQL[@]}" -f "$HERE/request_tickets_test.sql"
"${PSQL[@]}" -f "$HERE/security_sweep_test.sql"
"${PSQL[@]}" -f "$HERE/safeupdate_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_import_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_manage_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_analytics_test.sql"
"${PSQL[@]}" -f "$HERE/tenant_isolation_test.sql"
"${PSQL[@]}" -f "$HERE/tenant_functions_test.sql"
# The new files must be safe to run again
"${PSQL[@]}" -f "$HERE/../migrations/20261107000500_company_admin_role.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261107000510_admin_portal_uploads_assistant.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261107000520_past_employees.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261107000600_requests_admin_pdf.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261108000200_delete_people_reset_data.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261108000300_request_tickets.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261108000400_travel_desk_full_access.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261114000100_security_hardening.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261114170000_signup_allowlist_required.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261115100000_workforce_model.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261115120000_workforce_import.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261115140000_workforce_manage.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261115160000_workforce_analytics.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261115180000_ticket_passengers.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261115200000_bulk_save_where_clause.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261116100000_tenant_isolation.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261116120000_tenant_isolation_functions.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261116130000_tenant_helpers_new_rows.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261116140000_tenant_definer_revoke_create.sql"
"${PSQL[@]}" -f "$HERE/requests_pdf_test.sql"
"${PSQL[@]}" -f "$HERE/delete_reset_test.sql"
"${PSQL[@]}" -f "$HERE/request_tickets_test.sql"
"${PSQL[@]}" -f "$HERE/security_sweep_test.sql"
"${PSQL[@]}" -f "$HERE/safeupdate_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_import_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_manage_test.sql"
"${PSQL[@]}" -f "$HERE/workforce_analytics_test.sql"
"${PSQL[@]}" -f "$HERE/tenant_isolation_test.sql"
"${PSQL[@]}" -f "$HERE/tenant_functions_test.sql"
echo "re-ran 000500, 000510, 000520 and 000600"
