# Claude Code — Initialization Prompt

Copy everything below this line and paste it as your first message when opening Claude Code on this project.

---

You are working on the **Demo to Conversion Platform**, a Next.js 15 frontend module within an AI Virtual Workforce Platform for a tutoring company in Karachi, Pakistan. The platform tracks demo tutoring sessions through an 11-step pipeline from recording to teacher performance review.

## Mandatory Reading Protocol

Before writing ANY code, you must read the documentation files in this exact order. Do not skip any file. Do not skim. Each file exists because something broke when its rules were not followed.

```
1. Read CLAUDE.md          — Master rules, project structure, critical bugs, component API
2. Read MEMORY.md          — 8 documented bugs with guardrails, 9 architecture decisions, 12 rejected approaches
3. Read CONTEXT.md         — Business domain, 11-step pipeline, POUR taxonomy, accountability logic
4. Read DESIGN.md          — Apple design system tokens: colors, typography, spacing, border-radius, shadows
5. Read CONVENTIONS.md     — Code style, naming, import order, React patterns, CSS patterns
6. Read ARCHITECTURE.md    — System layers, Phase 2 migration plan, database schema, dependency policy
```

Read TOOLS.md, TESTING.md, SECURITY.md, and PROMPTS.md when their topics become relevant.

## The Four Laws

These are non-negotiable. Violating any one of them has crashed this project before.

**Law 1: The Space Before Return**
Every `return` statement MUST have a space before the parenthesis. `return (` is correct. `return(` will crash the entire application with `returnReact is not defined`. This is a transpiler bug specific to this environment. After every file edit, run:
```bash
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' | grep -v 'return (' | grep -v '//' | grep -v 'returnType'
```
Zero matches required.

**Law 2: No Hardcoded Chart Data**
Every number in every chart, KPI card, leaderboard, and summary MUST be computed from the `demos` state array via `useMemo`. Never create static arrays like `const MONTHLY = [...]` for chart data. The Analytics page and Dashboard must always show consistent numbers. After every chart edit, run:
```bash
grep -rn 'const MONTHLY\|const ACCT_DATA\|const AGENT_DATA' app/ --include='*.tsx'
```
Zero matches required.

**Law 3: Muhammad, Not Zain**
The third sales agent is Muhammad. The name "Zain" was incorrect and was globally replaced. Never use "Zain" in any file. After every edit, run:
```bash
grep -rn 'Zain' app/ components/ lib/ --include='*.tsx' --include='*.ts'
```
Zero matches required.

**Law 4: Bracket Balance**
After creating or editing any `.tsx` file, verify all brackets are balanced:
```bash
node -e "const c=require('fs').readFileSync('FILE.tsx','utf8');let b=0,p=0,k=0;for(const x of c){if(x==='{')b++;if(x==='}')b--;if(x==='(')p++;if(x===')')p--;if(x==='[')k++;if(x===']')k--;}console.log('{}: '+b+' (): '+p+' []: '+k);if(b||p||k)process.exit(1);"
```
All three must be 0.

## Workflow for Every Task

Follow this sequence for every change, no exceptions:

```
UNDERSTAND → LOCATE → PLAN → IMPLEMENT → VERIFY → REPORT
```

**Step 1: UNDERSTAND** — Read the relevant documentation files. If the task involves business logic, read CONTEXT.md. If it involves UI, read DESIGN.md. If it involves state, read the State section of CLAUDE.md.

**Step 2: LOCATE** — Identify which files need to change. Check the File Roles table in CLAUDE.md. If unsure how a feature works, check `reference/DemoToConversion_V4.jsx` for the working single-file implementation.

**Step 3: PLAN** — State what you will change and why, before writing code. If the change touches state (`lib/store.tsx`), list every consumer that will be affected.

**Step 4: IMPLEMENT** — Write the code following CONVENTIONS.md patterns:
- Import order: react → next → @/lib → @/components → @/lib/types → @/lib/utils → third-party
- Use `useMemo` for any value derived from state
- Use functional updates for `setDemos`: `setDemos(prev => [...])`
- Use existing CSS classes from `globals.css` before adding new ones
- Use design tokens from `lib/types.ts` — never hardcode colors
- Call `logActivity()` after every state mutation
- Use `setConfirm()` before every destructive action
- Keep files under 300 lines; extract components if exceeding

**Step 5: VERIFY** — Run the full verification suite from TOOLS.md:
```bash
# Build check
npm run build

# Four Laws check
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' | grep -v 'return (' | grep -v '//' | grep -v 'returnType'
grep -rn 'const MONTHLY\|const ACCT_DATA' app/ --include='*.tsx'
grep -rn 'Zain' app/ components/ lib/ --include='*.tsx' --include='*.ts'

# Bracket balance on changed files
node -e "const c=require('fs').readFileSync('CHANGED_FILE.tsx','utf8');let b=0,p=0,k=0;for(const x of c){if(x==='{')b++;if(x==='}')b--;if(x==='(')p++;if(x===')')p--;if(x==='[')k++;if(x===']')k--;}console.log('{}: '+b+' (): '+p+' []: '+k);if(b||p||k)process.exit(1);"
```

**Step 6: REPORT** — Summarize what was changed, which files were modified, and confirm all verification checks passed.

## State Architecture

All state flows through a single React Context provider in `lib/store.tsx`. Access it via `useStore()`:

```tsx
const {
  demos,           // Full demo array (source of truth)
  setDemos,        // Setter (always use functional update)
  rangedDemos,     // Demos filtered by global date range
  stats,           // Computed: { total, converted, pending, notConv, rate, avgR, pourRate }
  flash,           // Show toast: flash("Message")
  logActivity,     // Log action: logActivity("converted", "Maryam", "Ahmed Khan")
  setConfirm,      // Confirm dialog: setConfirm({ title, msg, onConfirm })
  dateRange,        // Global filter: "all" | "7d" | "30d" | "90d"
  notifications,   // Computed: pending demos aged 3+ days
  activity,        // Reactive activity feed
} = useStore();
```

**Rules:**
- Pages use `rangedDemos` for display, `demos` only for mutations
- Never import Supabase in page components — all data goes through `useStore()`
- Never initialize `useState` from a computed value that depends on `demos` — use `useMemo` instead
- Every mutation to `setDemos` must be followed by `logActivity()`

## What NOT to Do

- Do NOT add Tailwind, styled-components, or any CSS framework
- Do NOT add Redux, Zustand, Jotai, or any state manager
- Do NOT add MUI, Ant Design, Chakra, or any component library
- Do NOT add date-fns, dayjs, moment, or any date library
- Do NOT add React Hook Form, Formik, or any form library
- Do NOT add D3, Chart.js, or Plotly — only Recharts
- Do NOT create files in a `pages/` directory — use `app/` (App Router)
- Do NOT use `"use server"` — there is no backend yet
- Do NOT use `localStorage` or `sessionStorage`
- Do NOT use `fetch()` or API calls — data comes from Context
- Do NOT put `async` on page components — they are client components
- Do NOT render the Nav component inside pages — it's in layout.tsx
- Do NOT use gradients, multiple accent colors, or decorative shadows — see DESIGN.md

## Quick Reference

| Need to know... | Read this file |
|-----------------|---------------|
| Project rules and structure | `CLAUDE.md` |
| Business logic, pipeline steps | `CONTEXT.md` |
| Past bugs, decisions, pitfalls | `MEMORY.md` |
| Colors, spacing, typography | `DESIGN.md` |
| Code patterns, naming, imports | `CONVENTIONS.md` |
| System layers, Phase 2 plan | `ARCHITECTURE.md` |
| Auth, RLS, environment vars | `SECURITY.md` |
| AI agent prompts | `PROMPTS.md` |
| Verification commands | `TOOLS.md` |
| Test checklist | `TESTING.md` |
| How a feature actually works | `reference/DemoToConversion_V4.jsx` |

Begin by reading CLAUDE.md now.
