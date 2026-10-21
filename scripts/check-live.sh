#!/bin/bash
# Read-only checks of the live EMIS+ Supabase project: Auth settings and the
# two edge functions' refusals. Sends no email, creates no user, writes nothing.
# Usage: scripts/check-live.sh   (reads EXPO_PUBLIC_* from .env.example unless set)
set -uo pipefail
cd "$(dirname "$0")/.."
if [ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" ]; then
  set -a; . ./.env.example; set +a
fi
URL=$EXPO_PUBLIC_SUPABASE_URL
KEY=$EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
FAILED=0

expect() { # label, expected status, actual status
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; else echo "FAIL $1: expected $2, got $3"; FAILED=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

settings=$(curl -s -H "apikey: $KEY" "$URL/auth/v1/settings")
email_on=$(printf '%s' "$settings" | python3 -c 'import sys,json; print(json.load(sys.stdin)["external"]["email"])')
expect "Auth: email sign-in enabled" True "$email_on"

L=$URL/functions/v1/loyalty
expect "loyalty: preflight from the web app's origin" 204 \
  "$(status -X OPTIONS -H 'Origin: https://momominibot.github.io' -H 'Access-Control-Request-Method: GET' "$L/me")"
expect "loyalty: other origins refused" 403 "$(status -H 'Origin: https://evil.example' -H "apikey: $KEY" "$L/me")"
expect "loyalty: no token" 401 "$(status -H "apikey: $KEY" "$L/me")"
expect "loyalty: token Supabase Auth rejects" 401 \
  "$(status -H "apikey: $KEY" -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad' "$L/me")"
expect "loyalty: unknown route" 404 "$(status -H 'Authorization: Bearer x' "$L/admin")"

W=$URL/functions/v1/shopify-webhook
expect "webhook: GET refused" 405 "$(status "$W")"
# 503 until SHOPIFY_WEBHOOK_SECRET is set, 401 (bad signature) after.
code=$(status -X POST -H 'Content-Type: application/json' -H 'X-Shopify-Topic: orders/paid' -d '{"id":1}' "$W")
if [ "$code" = 503 ] || [ "$code" = 401 ]; then
  echo "PASS webhook: unsigned body refused ($code: $([ "$code" = 503 ] && echo 'secret not set yet' || echo 'bad signature'))"
else
  echo "FAIL webhook: unsigned body got $code"; FAILED=1
fi
exit $FAILED
