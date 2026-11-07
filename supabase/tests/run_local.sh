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
# The new files must be safe to run again
"${PSQL[@]}" -f "$HERE/../migrations/20261107000500_company_admin_role.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261107000510_admin_portal_uploads_assistant.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261107000520_past_employees.sql"
"${PSQL[@]}" -f "$HERE/../migrations/20261107000600_requests_admin_pdf.sql"
"${PSQL[@]}" -f "$HERE/requests_pdf_test.sql"
echo "re-ran 000500, 000510, 000520 and 000600"
