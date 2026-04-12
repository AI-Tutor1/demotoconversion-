# TOOLS.md — Commands, Scripts & Verification

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:3000)
npm run dev

# Production build (catches type errors)
npm run build

# Lint check
npm run lint
```

## Verification Scripts

Run these after EVERY file change. They catch the bugs that have crashed this project before.

### 1. Bracket Balance Check
Verifies all `{}`, `()`, `[]` are matched in a file:
```bash
node -e "
const fs = require('fs');
const file = process.argv[1];
const code = fs.readFileSync(file, 'utf8');
let b=0, p=0, k=0;
for (const c of code) {
  if (c === '{') b++; if (c === '}') b--;
  if (c === '(') p++; if (c === ')') p--;
  if (c === '[') k++; if (c === ']') k--;
}
const pass = b === 0 && p === 0 && k === 0;
console.log(file, '{}: ' + b, '(): ' + p, '[]: ' + k, pass ? 'PASS' : 'FAIL');
if (!pass) process.exit(1);
" FILE.tsx
```

### 2. returnReact Bug Check
Finds dangerous `return(` patterns without space:
```bash
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' --include='*.ts' | grep -v 'return (' | grep -v 'return;' | grep -v '//'
```
If any matches appear, add a space: `return (`.

### 3. Agent Name Check
Ensures "Zain" is never used:
```bash
grep -rn 'Zain' app/ components/ lib/ --include='*.tsx' --include='*.ts'
```
Should return zero results.

### 4. Hardcoded Data Check
Ensures no static chart data arrays exist:
```bash
grep -rn 'const MONTHLY\|const ACCT_DATA\|const AGENT_DATA' app/ --include='*.tsx'
```
Should return zero results. All chart data must be computed via `useMemo`.

### 5. Export Default Check
Ensures every page has a default export:
```bash
for f in app/page.tsx app/*/page.tsx; do
  grep -l 'export default' "$f" > /dev/null || echo "MISSING default export: $f"
done
```

### 6. "use client" Check
Ensures every page with interactive state has the directive:
```bash
for f in app/page.tsx app/*/page.tsx; do
  head -1 "$f" | grep -q '"use client"' || echo "MISSING 'use client': $f"
done
```

### 7. Full Project Verification
Run all checks at once:
```bash
echo "=== Bracket Balance ===" && \
for f in app/page.tsx app/*/page.tsx components/*.tsx lib/*.tsx lib/*.ts; do \
  node -e "const c=require('fs').readFileSync('$f','utf8');let b=0,p=0,k=0;for(const x of c){if(x==='{')b++;if(x==='}')b--;if(x==='(')p++;if(x===')')p--;if(x==='[')k++;if(x===']')k--;}const ok=b===0&&p===0&&k===0;console.log('$f',ok?'PASS':'FAIL('+b+','+p+','+k+')');" ; \
done && \
echo "" && echo "=== returnReact Check ===" && \
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' --include='*.ts' | grep -v 'return (' | grep -v 'return;' | grep -v '//' | grep -v 'returnType' || echo "PASS" && \
echo "" && echo "=== Zain Check ===" && \
grep -rn 'Zain' app/ components/ lib/ --include='*.tsx' --include='*.ts' || echo "PASS" && \
echo "" && echo "=== Hardcoded Data Check ===" && \
grep -rn 'const MONTHLY\|const ACCT_DATA' app/ --include='*.tsx' || echo "PASS"
```

## File Size Monitoring

Large files cause transpiler issues. Keep individual files under 300 lines:
```bash
wc -l app/page.tsx app/*/page.tsx components/*.tsx lib/*.tsx lib/*.ts | sort -n
```

If a page exceeds 300 lines, extract reusable parts into `components/`.

## Git Workflow (When Ready)

```bash
# Before committing
npm run build           # Catches type errors
npm run lint            # Catches style issues
# Run full verification script above

# Commit pattern
git add .
git commit -m "feat(sales): add agent filter dropdown"
```

Commit message prefixes:
- `feat(scope)` — new feature
- `fix(scope)` — bug fix
- `refactor(scope)` — code change that doesn't add/fix
- `style(scope)` — CSS/formatting only
- `docs` — documentation changes
