#!/usr/bin/env bash
# Migration manifest check — would have prevented the 2026-04-15 incident.
#
# For every `supabase.rpc('foo', ...)` call in the frontend, confirm that
# `foo` exists as a public function in the deployed DB. Fails loudly if
# any RPC called from code isn't deployed — telling you to apply migrations
# BEFORE pushing code that relies on them.
#
# Uses public.list_public_rpcs() (created in migration 20260415000009).
# That function returns the authoritative list of deployed public-schema
# functions; we diff against RPC names grepped from the frontend.
set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env.local for the anon key + URL.
if [ -f .env.local ]; then
  set -a; . .env.local; set +a
fi

: "${NEXT_PUBLIC_SUPABASE_URL:?_migration-manifest-check: NEXT_PUBLIC_SUPABASE_URL not set in .env.local}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?_migration-manifest-check: NEXT_PUBLIC_SUPABASE_ANON_KEY not set in .env.local}"

# 1. Extract RPC names called from frontend code.
called=$(grep -rhEo "supabase\.rpc\(\s*['\"][a-z_][a-z_0-9]*['\"]" lib/ app/ components/ 2>/dev/null \
  | sed -E "s/.*['\"]([a-z_][a-z_0-9]*)['\"].*/\1/" | sort -u)

if [ -z "$called" ]; then
  echo "  (no supabase.rpc() calls in frontend — manifest check skipped)"
  exit 0
fi

# 2. Fetch the deployed RPC list.
resp=$(curl -sS --max-time 10 "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/list_public_rpcs" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -X POST -d '{}')

if echo "$resp" | grep -q "Could not find the function.*list_public_rpcs"; then
  echo "  ✗ list_public_rpcs() helper is not deployed."
  echo "    Apply migration 20260415000009_list_public_rpcs_helper.sql before running smoke.sh."
  exit 1
fi

# 3. Extract the deployed names (JSON array of {name: "..."} objects).
deployed=$(echo "$resp" | python3 -c 'import sys,json
try:
    rows = json.load(sys.stdin)
    print("\n".join(r["name"] for r in rows))
except Exception as e:
    print(f"ERR: {e}", file=sys.stderr); sys.exit(1)')

# 4. Diff.
fail=0
for rpc in $called; do
  if echo "$deployed" | grep -qx "$rpc"; then
    echo "  ✓ $rpc (deployed)"
  else
    echo "  ✗ $rpc — called from frontend but NOT deployed to DB."
    echo "    Apply pending migrations (supabase/migrations/*.sql) before committing code that calls this RPC."
    fail=1
  fi
done

[ $fail -eq 0 ] || exit 1
