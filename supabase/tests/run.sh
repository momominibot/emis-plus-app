#!/bin/bash
# Runs the loyalty backend tests against a throwaway local Postgres cluster.
# Needs: Postgres 17 binaries (brew postgresql@17) and Deno 2.
# Nothing here talks to Supabase or Shopify.
set -euo pipefail
cd "$(dirname "$0")/.."
# macOS: without a valid locale the postmaster refuses to start ("became multithreaded").
export LC_ALL=${LC_ALL:-en_US.UTF-8} LANG=${LANG:-en_US.UTF-8}

PGBIN=${PGBIN:-$(dirname "$(command -v pg_ctl)")}
TMP=$(mktemp -d)
PORT=${PGPORT_TEST:-55432}
cleanup() {
  "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
# -l keeps the server's output out of our pipes (a captured pg_ctl start hangs).
if ! "$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/pg.log" -o "-p $PORT -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -w start >/dev/null; then
  cat "$TMP/pg.log" >&2
  exit 1
fi

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres)
# Stand-ins for Supabase: the API roles, plus a non-superuser owner like the
# hosted `postgres` role. Default privileges mimic a platform that hands new
# objects to the API roles, so the tests prove the migration's revokes.
"${PSQL[@]}" -d postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role api_user login;
grant anon, authenticated, service_role to api_user;
create role loyalty_owner login createdb;
create database loyalty_template owner loyalty_owner;
SQL
# Stand-in for Supabase's auth.users, so the email-sync trigger is created and tested.
"${PSQL[@]}" -d loyalty_template <<'SQL'
create schema auth;
create table auth.users (
  id uuid primary key, email text unique, email_confirmed_at timestamptz,
  email_change text default '', deleted_at timestamptz
);
grant usage on schema auth to loyalty_owner;
grant select, insert, update, delete, trigger on auth.users to loyalty_owner;
SQL
"${PSQL[@]}" -d loyalty_template -c "alter default privileges for role loyalty_owner grant all on tables to anon, authenticated, service_role; alter default privileges for role loyalty_owner grant all on functions to anon, authenticated, service_role; alter default privileges for role loyalty_owner grant all on sequences to anon, authenticated, service_role;"
"${PSQL[@]}" -d loyalty_template -U loyalty_owner -f "${MIGRATION:-migrations/20261020120000_loyalty.sql}"

export TEST_PG_HOST=127.0.0.1 TEST_PG_PORT=$PORT
deno test --config deno.json --allow-net --allow-env --allow-read "${@:-tests/}"
