#!/usr/bin/env bash
# Guards the database migrations when more than one person (or Claude account)
# works on the repo at the same time. Run on every pull request by checks.yml.
#
#   1. Migrations that already exist on the base branch must not be changed,
#      renamed or deleted: they are already applied to the live database.
#   2. Every new migration must be named YYYYMMDDHHMMSS_name.sql and sort after
#      every migration on the base branch, so two branches cannot add files that
#      run in the wrong order or clash.
#
# Usage: scripts/check-migrations.sh <base-ref>   (default: origin/main)
set -euo pipefail

BASE="${1:-origin/main}"
DIR="supabase/migrations"
fail=0

merge_base=$(git merge-base "$BASE" HEAD)

# 1. Existing migrations are read-only.
changed=$(git diff --name-status "$merge_base" HEAD -- "$DIR" | awk '$1 != "A" { print }')
if [ -n "$changed" ]; then
  echo "::error::Existing migrations were changed, renamed or deleted. Add a new migration instead:"
  echo "$changed"
  fail=1
fi

# 2. New migrations must come after everything already on the base branch.
latest_base=$(git ls-tree --name-only "$BASE" "$DIR/" | xargs -n1 basename | grep -E '^[0-9]{14}_.+\.sql$' | sort | tail -1 || true)
added=$(git diff --name-only --diff-filter=A "$merge_base" HEAD -- "$DIR" | xargs -r -n1 basename)

for f in $added; do
  if ! [[ "$f" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
    echo "::error::$f: name it YYYYMMDDHHMMSS_short_name.sql (lowercase, underscores)."
    fail=1
  elif [ -n "$latest_base" ] && [[ ! "$f" > "$latest_base" ]]; then
    echo "::error::$f must sort after $latest_base, the newest migration on $BASE. Rename it with a later timestamp."
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "Migrations OK (newest on $BASE: ${latest_base:-none}; new here: ${added:-none})."
fi
exit "$fail"
