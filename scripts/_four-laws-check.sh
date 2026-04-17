#!/usr/bin/env bash
# Four Laws static check — lifted from CLAUDE.md so discipline is enforced
# by the machine, not by memory. Called from scripts/smoke.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

# ── Law 1: space before return ───────────────────────────────────────────────
# Known phantom on this repo (see MEMORY.md). Kept for parity with CLAUDE.md.
# Excludes comments, returnType/returnsNew aliases, and valid `return (`.
hits=$(grep -rn 'return(' app/ components/ lib/ --include='*.tsx' --include='*.ts' 2>/dev/null \
  | grep -v 'return (' | grep -v '//' | grep -v 'returnType' | grep -v 'returnsNew' || true)
if [ -n "$hits" ]; then
  echo "  ✗ Law 1 (space before return):"; echo "$hits"; fail=1
else
  echo "  ✓ Law 1"
fi

# ── Law 2: no hardcoded chart data ───────────────────────────────────────────
hits=$(grep -rn 'const MONTHLY\|const ACCT_DATA\|const AGENT_DATA' app/ --include='*.tsx' 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "  ✗ Law 2 (hardcoded chart data):"; echo "$hits"; fail=1
else
  echo "  ✓ Law 2"
fi

# ── Law 3: no Zain string literal ────────────────────────────────────────────
hits=$(grep -rnE '"Zain"|'"'"'Zain'"'"'' app/ components/ lib/ --include='*.tsx' --include='*.ts' 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "  ✗ Law 3 (Zain):"; echo "$hits"; fail=1
else
  echo "  ✓ Law 3"
fi

# ── Law 4: bracket balance per file ──────────────────────────────────────────
# Naive char-count — matches CLAUDE.md. Strings / regex can false-positive; if
# that happens in practice, upgrade to AST parse.
files=$(find app components lib -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null | grep -v node_modules || true)
if [ -n "$files" ]; then
  node -e '
    const fs = require("fs");
    let fail = 0;
    for (const f of process.argv.slice(1)) {
      const c = fs.readFileSync(f, "utf8");
      let b=0, p=0, k=0;
      for (const x of c) {
        if (x==="{") b++; if (x==="}") b--;
        if (x==="(") p++; if (x===")") p--;
        if (x==="[") k++; if (x==="]") k--;
      }
      if (b || p || k) { console.log("   " + f + "  {}:" + b + "  ():" + p + "  []:" + k); fail = 1; }
    }
    process.exit(fail);
  ' $files && echo "  ✓ Law 4" || { echo "  ✗ Law 4 (unbalanced brackets)"; fail=1; }
fi

[ $fail -eq 0 ] || exit 1
