#!/usr/bin/env bash
# Smoke test — the hard gate that prevents shipping frontend code that
# depends on un-provisioned server state (un-applied migrations, missing
# env vars, unreachable backend, or Four Laws violations).
#
# Run manually:    ./scripts/smoke.sh
# Run on push:     installed via scripts/install-git-hooks.sh
#
# A passing run ends with the literal line "✅ smoke passed" so CI / humans
# can grep for it.
set -euo pipefail

cd "$(dirname "$0")/.."

trap 'echo "✗ smoke FAILED at line $LINENO" >&2' ERR

echo "▶ A. Four Laws + bracket balance"
./scripts/_four-laws-check.sh

# Guard: `npm run build` + `npm run dev` sharing .next/ corrupts the cache
# (MEMORY.md BUG-012). Refuse to run when dev is listening on :3000.
if lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  ✗ 'npm run dev' is running on :3000."
  echo "    smoke.sh runs 'npm run build' — they would corrupt .next/ cache."
  echo "    Stop dev first:   kill \$(lsof -ti :3000)"
  exit 1
fi

echo "▶ B. npm run build"
npm run build >/tmp/smoke-build.log 2>&1 || {
  echo "  ✗ build failed. Last 30 lines of /tmp/smoke-build.log:"
  tail -30 /tmp/smoke-build.log
  exit 1
}
grep -qE "Compiled successfully|Generating static pages" /tmp/smoke-build.log \
  || { echo "  ✗ build log missing success marker"; tail -20 /tmp/smoke-build.log; exit 1; }
echo "  ✓ build clean"

echo "▶ C. Migration manifest (every RPC called from frontend must exist)"
./scripts/_migration-manifest-check.sh

echo "▶ D. Teacher roster coverage (approved sessions vs lib/types.ts TEACHERS)"
# Guards the silent-drop at app/teachers/page.tsx:48 — any approved session
# whose teacher_user_name isn't in the hardcoded TEACHERS array becomes
# unreachable on /teachers. Needs service-role key (RLS blocks anon reads
# of sessions). See tests/teachers-product-log.md for the full context.
if [ -f .env.local ]; then set -a; . .env.local; set +a; fi
if [ -f backend/.env ]; then set -a; . backend/.env; set +a; fi
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "  ⚠ need NEXT_PUBLIC_SUPABASE_URL (.env.local) + SUPABASE_SERVICE_ROLE_KEY (backend/.env) — roster check skipped"
else
  roster_resp=$(curl -sS --max-time 10 \
    "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/sessions?processing_status=eq.approved&teacher_user_name=not.is.null&select=teacher_user_name" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
  echo "$roster_resp" | python3 -c 'import json, re, sys
try:
    rows = json.load(sys.stdin)
except Exception as e:
    print(f"  ✗ could not parse REST response: {e}", file=sys.stderr); sys.exit(1)
if not isinstance(rows, list):
    print(f"  ✗ unexpected REST response (RLS or 4xx?): {rows}", file=sys.stderr); sys.exit(1)
session_names = {(r.get("teacher_user_name") or "").strip().lower() for r in rows}
session_names.discard("")
with open("lib/types.ts") as f:
    src = f.read()
m = re.search("export const TEACHERS[^\\[]*\\[([\\s\\S]*?)\\];", src)
if not m:
    print("  ✗ could not locate TEACHERS array in lib/types.ts", file=sys.stderr); sys.exit(1)
roster = {n.strip().lower() for n in re.findall("name:\\s*\"([^\"]+)\"", m.group(1))}
missing = sorted(session_names - roster)
if not missing:
    print(f"  ✓ {len(session_names)} distinct approved-session teacher name(s), all in TEACHERS roster ({len(roster)} entries)")
    sys.exit(0)
print("  ✗ out-of-roster teacher names in approved sessions:")
for name in missing:
    count = sum(1 for r in rows if (r.get("teacher_user_name") or "").strip().lower() == name)
    print(f"    - \"{name}\" ({count} approved session(s)) — not in lib/types.ts TEACHERS array")
print("    /teachers silently drops these (app/teachers/page.tsx:48).")
print("    Fix: add the tutor(s) to TEACHERS, or correct the session rows teacher_user_name.")
sys.exit(1)'
fi

echo "▶ E. Backend contract (if uvicorn is running on :8000)"
# MANUAL VERIFICATION REQUIRED (cannot be automated):
#   Supabase Dashboard → Authentication → Hooks must have:
#   "custom_access_token" → public.custom_access_token_hook
#   Without this, JWT tokens lack the app_role claim and the backend
#   falls back to DB lookup on every request.
if curl -fsS --max-time 2 http://127.0.0.1:8000/health >/dev/null 2>&1; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    -X POST http://127.0.0.1:8000/api/v1/demos/1/analyze)
  if [ "$code" != "401" ]; then
    echo "  ✗ /analyze auth gate expected 401, got $code"; exit 1
  fi
  echo "  ✓ /analyze auth gate returns 401 on no-auth"
  code2=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    -X POST http://127.0.0.1:8000/api/v1/demos/1/process-recording)
  if [ "$code2" != "401" ]; then
    echo "  ✗ /process-recording auth gate expected 401, got $code2"; exit 1
  fi
  echo "  ✓ /process-recording auth gate returns 401 on no-auth"
else
  echo "  ⚠ backend not running — contract check skipped"
  echo "    (start with: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload)"
fi

echo "▶ F. Frontend dev server (if running on :3000)"
if curl -fsS --max-time 2 http://127.0.0.1:3000/login >/dev/null 2>&1; then
  curl -s --max-time 5 http://127.0.0.1:3000/login | grep -q '<title' \
    || { echo "  ✗ /login did not return HTML with <title>"; exit 1; }
  echo "  ✓ dev server serving /login"
else
  echo "  ⚠ dev server not running — reachability check skipped"
  echo "    (start with: npm run dev)"
fi

echo "✅ smoke passed"
