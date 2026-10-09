#!/usr/bin/env bash
# Runs the migration + flow tests against a throwaway local Postgres.
# Usage: supabase/tests/run.sh   (needs postgres binaries on PATH or in /usr/lib/postgresql/*/bin)
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
export PATH="$PGBIN:$PATH"
DATA=$(mktemp -d)
PORT=${PGPORT:-55432}
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" start >/dev/null
PSQL="psql -h $DATA -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f supabase/tests/flows.sql
