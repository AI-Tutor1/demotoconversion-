# MEMORY.md — Complete Project History, Decisions & Guardrails

This is the institutional memory of the project. Claude Code MUST consult this file before making any change that touches architecture, data, naming, styling, or state management. Every entry exists because something went wrong or a non-obvious decision was made.

---

## Part 1: Critical Bugs — These WILL Recur Without Guardrails

### BUG-001: The `returnReact` Transpiler Crash
- **Severity:** Fatal — crashes the entire application
- **Versions affected:** V3 (74KB compressed JSX)
- **Symptom:** `returnReact is not defined` error in the artifact renderer
- **Root cause:** The JSX transpiler concatenates `return` with `(` into a single token when there is no space between them. `return(<div>)` becomes `returnReact.createElement(...)` instead of `return React.createElement(...)`
- **Where it happened:** Compressed single-line code throughout the 74KB V3 file
- **Fix applied:** Reformatted entire codebase. Every `return` now has a space before `(`
- **GUARDRAIL:** After EVERY file edit, run: `grep -n 'return(' FILE.tsx | grep -v 'return ('`. Zero matches = safe.
- **Why it recurs:** Code formatters, minifiers, and AI-generated code naturally compress `return(`. This is not a standard JavaScript error — it's specific to the artifact transpiler.

### BUG-002: Agent Name "Zain" → "Muhammad"
- **Severity:** Data integrity — wrong person credited/assigned
- **When discovered:** After V1 UI was built with "Zain" as the third sales agent
- **User correction:** "Change the name of third agent is Muhammad"
- **Fix applied:** Global find-and-replace across all files. `AGENTS` array in `lib/types.ts` updated.
- **GUARDRAIL:** Never hardcode agent names. Always reference the `AGENTS` array from `lib/types.ts`. After every edit, run: `grep -rn 'Zain' . --include='*.tsx' --include='*.ts'`. Zero matches = safe.
- **Why it matters:** Agent names appear in seed data, dropdowns, leaderboards, and activity logs. One missed reference means the wrong person appears in the UI.

### BUG-003: Hardcoded Analytics vs. Live Dashboard
- **Severity:** Critical — two views show contradictory numbers
- **When discovered:** CTO audit #1 (42 findings)
- **What happened:** The Analytics page used `const MONTHLY = [{demos: 267, rate: 42, ...}]` while the Dashboard computed stats from the live `demos` state. An executive opening both views would see "267 demos, 42% rate" in Analytics but "12 demos, 25% rate" in Dashboard.
- **Fix applied:** All chart data now computed from `rangedDemos` via `useMemo`. No static arrays for any chart.
- **GUARDRAIL:** After every edit to analytics or any chart, run: `grep -rn 'const MONTHLY\|const ACCT_DATA\|const AGENT_DATA' app/ --include='*.tsx'`. Zero matches = safe. Every chart's `data` prop must trace back to a `useMemo` that reads from `rangedDemos` or `demos`.

### BUG-004: Kanban Board State Disconnect
- **Severity:** High — new demos invisible on Kanban
- **When discovered:** CTO audit #1
- **What happened:** Kanban used `const [board, setBoard] = useState(computeBoard(demos))`. The `useState` initializer runs once. When a new demo was added via the Analyst form, `demos` state updated but Kanban's local `board` state never re-computed. The new demo was invisible until page refresh.
- **Fix applied:** Replaced `useState` with `useMemo`: `const board = useMemo(() => computeBoard(demos), [demos])`. Board now re-derives from demos on every change.
- **GUARDRAIL:** Never use `useState(computedValue)` where `computedValue` depends on props or external state. If a value is derived from state, use `useMemo`. If you see `useState` initialized from a function that reads `demos` or `rangedDemos`, it's a bug.

### BUG-005: Kanban Categorized by Age Instead of Workflow State
- **Severity:** High — demos appear in wrong columns
- **When discovered:** CTO audit #1
- **What happened:** Cards were sorted into columns using `age <= 1 → "New"`. This meant a fully-reviewed demo submitted today appeared in "New" instead of "Pending Sales."
- **Correct logic:**
  - `status === "Converted"` → Converted column
  - `status === "Not Converted"` → Not Converted column
  - `status === "Pending"` AND `analystRating > 0` AND `review` exists → Pending Sales
  - `status === "Pending"` AND has partial data → Under Review
  - Everything else → New
- **GUARDRAIL:** See CONTEXT.md "Kanban Board Column Logic" for the exact conditions. Never use timestamp/age for column assignment.

### BUG-006: Search Navigation Shows Empty Queue
- **Severity:** Medium — user clicks search result, sees nothing
- **When discovered:** CTO audit #1
- **What happened:** Clicking a search result called `setView("sales")` which set the status filter to "Pending" by default. If the searched demo was "Converted", it was selected (`setSelDemo(d.id)`) but invisible because the filter excluded it.
- **Fix applied:** Sales view now defaults to "All" status filter, so any searched demo is always visible.
- **GUARDRAIL:** When navigating to a filtered view from search, always set the filter to "All" or match the target item's status.

### BUG-007: Notification Dropdown Never Dismissed
- **Severity:** Medium — UI element stays permanently visible
- **When discovered:** CTO audit #1
- **What happened:** The notification dropdown toggled on bell click only. Clicking anywhere else on the page left it floating open.
- **Fix applied:** Added `useRef` on the dropdown container + `useEffect` with `document.addEventListener("mousedown", handler)` that closes the dropdown when clicking outside.
- **GUARDRAIL:** Every dropdown, popover, and overlay in this project MUST have an outside-click dismiss handler. Pattern:
  ```tsx
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  ```

### BUG-008: ESC Key Did Not Close Search
- **Severity:** Low — visual "ESC" button existed but keyboard shortcut didn't work
- **When discovered:** CTO audit #1
- **Fix applied:** Added `useEffect` with `document.addEventListener("keydown", handler)` checking for `e.key === "Escape"`.
- **GUARDRAIL:** Every modal/overlay must respond to ESC key. Test both click-dismiss and keyboard-dismiss.

---

## Part 2: Data Decisions — The Source Spreadsheet

### Original Data Source
- **File:** `My_new_reference_.numbers` (Apple Numbers format, 1MB)
- **Two sheets:** "Reference" (170 teachers with names and user IDs) and "Demo to Conversion" (990 rows of demo data)

### Name Matching Problem
- **Challenge:** Teacher names in the demo sheet didn't exactly match the reference sheet. "Shoaib Ahmed Ghani" in demos → "Shoaib Ghani" (ID 62) in reference.
- **Solution:** Built a manual mapping of 28 name variants:
  - Shoaib Ahmed Ghani → Shoaib Ghani (62)
  - Hira Zaffar → Hira Zafar (594)
  - Fizza → Fiza Imran (543) [partial match]
  - Rameesha → Rameesha Saleem (599) [partial match]
  - And 24 more...
- **Result:** 266 of 274 rows with teacher names matched (97%). 7 teachers had no reference match at all.
- **GUARDRAIL:** When importing new data, always run fuzzy matching. Never trust exact string comparison for teacher names.

### Seed Data Design
The 12 seed demos in `lib/data.ts` were intentionally designed to test edge cases:

| Aspect | Distribution | Why |
|--------|-------------|-----|
| Status | 6 Pending, 3 Converted, 3 Not Converted | All Kanban columns, all filter states, all analytics segments have data |
| Ratings | 0 at 1/5, 2 at 2/5, 3 at 3/5, 2 at 4/5, 3 at 5/5 | Tests the accountability auto-suggestion at each threshold |
| POUR issues | 7 demos with issues, 5 without | Tests POUR charts, tags, and teacher POUR metrics |
| Dates | Apr 6-12 (recent) + Mar 5-20 (older) | Tests date range filter at 7d, 30d, 90d |
| Teachers | 8 unique teachers, some with multiple demos | Tests teacher aggregation and drill-down |
| Agents | Maryam (2), Hoor (2), Muhammad (1), empty (7) | Tests agent leaderboard and assignment |
| Accountability | 3 "Product" entries, rest empty | Tests accountability pie chart |
| Marketing | 1 true, rest false | Tests the marketing toggle |

**GUARDRAIL:** If you modify seed data, maintain these distributions. Breaking them will make charts, filters, or Kanban columns appear empty during development.

---

## Part 3: Architecture Decisions — Why We Chose This

### Decision: React Context (not Redux, Zustand, or Jotai)
- **Scale factor:** 12 demos in dev, ~200 in production, max ~1000
- **Rationale:** React Context with `useMemo` handles this scale. External state managers add bundle size and complexity for no measurable benefit.
- **Revisit trigger:** If performance degrades with 500+ demos, or if > 3 developers work simultaneously on state-dependent features, migrate to Zustand (not Redux — too much boilerplate).

### Decision: Inline Styles + CSS Classes (not Tailwind)
- **Rationale:** The Apple design system has specific tokens (border-radius: 980px for pills, specific hex colors like #0071e3) that don't map to Tailwind's default scale. The prototype was built with inline styles. Converting to Tailwind would risk visual regressions with zero functional benefit.
- **What was tried:** Tailwind was evaluated and rejected. The team would need a custom `tailwind.config.ts` with non-standard values, defeating the purpose of using a utility framework.
- **GUARDRAIL:** Never add Tailwind to this project. Never convert inline styles to className-based utilities. The hybrid approach (CSS classes for reusable patterns, inline for layout) is intentional.

### Decision: Single Context Provider (not per-feature stores)
- **Rationale:** All 6 views share the same `demos` array. The Analyst form pushes to `demos`, Sales reads and updates `demos`, Kanban derives from `demos`, Analytics computes from `demos`, Teachers aggregates `demos`. Splitting into AnalystStore + SalesStore + KanbanStore would require context bridging for every cross-view mutation.
- **GUARDRAIL:** If a new feature needs state, add it to the existing `StoreProvider` in `lib/store.tsx`. Do not create additional Context providers.

### Decision: "use client" on All Pages
- **Rationale:** Every page uses interactive state (filters, forms, drag-drop, charts). Server Components would help with data fetching (Phase 2), but currently there's no server data source.
- **Phase 2 plan:** When Supabase connects, data fetching moves to Server Components. Interactivity stays in Client Components. The page structure will split into `page.tsx` (server, fetches data) and `ClientView.tsx` (client, renders interactive UI).

### Decision: Next.js 15 App Router (not Pages Router)
- **Rationale:** App Router supports Server Components (Phase 2), nested layouts, and parallel routes. Pages Router is legacy. Every new Next.js project should use App Router.
- **GUARDRAIL:** Never create files in a `pages/` directory. All routes go in `app/`.

### Decision: Recharts (not Chart.js, D3, or Plotly)
- **Rationale:** Recharts renders as React components (not canvas). It integrates naturally with React state and `useMemo`. Chart.js uses canvas (conflicts with React rendering). D3 requires DOM manipulation (conflicts with virtual DOM). Plotly is heavy (1.5MB+ bundle).
- **GUARDRAIL:** All chart components must be imported from `recharts`. Never add Chart.js, D3, or Plotly.

### Decision: Python Backend for AI (Phase 3)
- **Rationale:** LangGraph, CrewAI, Whisper, sentence-transformers, and the Anthropic SDK are Python-native. The TypeScript AI ecosystem is 2+ years behind Python.
- **Architecture:** Python handles AI orchestration. Next.js handles human interface. They share Supabase as the data layer. Python does NOT serve HTML. Next.js does NOT do AI reasoning.
- **GUARDRAIL:** Never add AI/ML libraries to the Next.js project. Never add web framework code to the Python project.

### Decision: No Supabase in Phase 1
- **Rationale:** The frontend must be validated independently. All data is in-memory seed data. Phase 2 adds Supabase with zero page component changes — only `lib/store.tsx` and a new `lib/supabase.ts` change.
- **GUARDRAIL:** No page component should ever import Supabase directly. All data access goes through `useStore()`.

### Decision: Apple Design System (from VoltAgent/awesome-design-md)
- **Source:** `https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md`
- **Key tokens applied:** SF Pro system fonts, Apple Blue (#0071e3) as singular accent, glass navigation (backdrop-filter blur), alternating black/light-gray sections, pill CTAs (980px radius), negative letter-spacing
- **GUARDRAIL:** See DESIGN.md for the complete token reference. Never introduce a second accent color. Never use gradients.

---

## Part 4: CTO Audit History — 42 Findings

Two comprehensive CTO-level audits were performed. All 42 findings were fixed.

### Audit #1: Gap Analysis (16 findings)
Identified 16 missing features across 5 categories: data visualization (no charts), workflow management (no Kanban), search/filter (incomplete), teacher intelligence (no drill-down), operations (no bulk actions).

### Audit #2: Full Audit (42 findings)
7 Critical, 14 High, 13 Medium, 8 Low across 7 categories:

**Data Integrity (6):** Hardcoded analytics, Kanban state disconnect, age-based categorization, static activity feed, CSV ignoring filters, search navigation bug.

**Pipeline Coverage (5):** Step 10 accountability missing, POUR descriptions missing, link field missing, month display missing, master data view missing.

**Filter/Sort (9):** No date range filter, no sort controls, dashboard KPIs not filterable, no agent filter, no rating filter, no POUR filter, Kanban has zero filters, Teacher view has no sort, no "clear all" button.

**Analytics (7):** No conversion funnel, no pending aging histogram, no teacher comparison, no student vs analyst rating correlation, no subject demand chart, teacher drill-down uses "D1,D2" labels, charts lack date controls.

**UX (7):** No form validation error states, no confirmation dialogs, notification dropdown doesn't dismiss, no undo for status changes, no select-all checkbox, no empty state illustrations, no loading states.

**Accessibility (4):** Star rating no keyboard support, search no ESC handler, Kanban no ARIA labels, color-only status indicators.

**Responsive (4):** Kanban breaks on mobile, analytics grid breaks below 900px, no pagination for large datasets, dashboard layout breaks on narrow screens.

**All 42 were fixed in V4.** The fixes are embedded in the current codebase.

---

## Part 5: Version History

| Version | File | Lines | What changed |
|---------|------|-------|-------------|
| V1 | DemoToConversion.jsx | ~400 | Initial 4-view app (Dashboard, Analyst, Sales, Teachers) |
| V2 | AnalyticsAndKanban.jsx | ~400 | Added Analytics (6 charts) + Kanban (drag-drop) |
| V3 | DemoToConversion_V3.jsx | 736 | Merged all + 42 audit fixes. **CRASHED** with `returnReact` bug due to compression |
| V4 | DemoToConversion_V4.jsx | 1203 | Properly formatted, all fixes confirmed working |
| Next.js | nextjs-project/ | 1915 | Full conversion to Next.js 15 App Router with modular architecture |

---

## Part 6: Things Tried and Rejected

| What | Why rejected |
|------|-------------|
| Tailwind CSS | Apple tokens don't map to default scale; would need custom config defeating purpose |
| Zustand | Over-engineering for 12-200 demo scale; Context suffices |
| Separate CSS modules | Apple design system is global; splitting CSS causes duplication |
| shadcn/ui components | Would override the Apple design system's custom inputs/buttons |
| React Hook Form | Custom validation is simpler for 5 required fields |
| date-fns / dayjs | Built-in Date + custom `formatMonth` handles all cases |
| D3 for charts | DOM manipulation conflicts with React virtual DOM |
| Chart.js | Canvas rendering doesn't integrate with React state |
| TypeScript `!` non-null assertion | Strict mode is enabled; always handle null explicitly |
| Pages Router | Legacy; App Router needed for Phase 2 Server Components |
| Redux | Too much boilerplate for current scale |
| Framer Motion | CSS keyframe animations sufficient; FM adds 30KB+ |

---

## Part 7: Non-Obvious Rules

### Teacher User ID Lookup
The `TEACHERS` array in `lib/types.ts` maps names to UIDs. When the analyst selects a teacher from the dropdown, the UID auto-fills: `const t = TEACHERS.find(x => x.name === f.teacher); tid: t ? t.uid : 0`. Never ask users to type UIDs manually.

### Rating Conversion
Students rate out of 10. The system displays out of 5: `Math.round(studentRaw / 2)`. This happens in the UI (display) and will happen in the database via trigger (Phase 2). The `analystRating` is natively 1-5.

### Accountability Auto-Suggestion Logic
When status is "Not Converted":
- `analystRating <= 2` OR `pour.length > 0` → suggest **Product**
- `analystRating >= 4` AND `studentRaw >= 7` AND `pour.length === 0` → suggest **Sales**
- Otherwise → suggest **Consumer**

The suggestion is a hint, not a decision. The sales agent can override it.

### Activity Log is Reactive
`logActivity(action, user, target)` pushes to the activity feed state. It must be called every time state changes: demo submission, status update, bulk action, Kanban drop. If you add a new mutation, add a `logActivity` call.

### Date Range is Global
The `dateRange` state in the store filters ALL views simultaneously. `rangedDemos` is the filtered array. Pages should use `rangedDemos`, not `demos`, for display. Only use `demos` for mutations (`setDemos`).

### Confirmation Modals are Mandatory for Destructive Actions
Every action that changes a demo's status must go through `setConfirm()`:
- Individual status changes (Sales detail panel)
- Bulk status changes (Sales bulk bar)
- Kanban drops to Converted or Not Converted columns
- Never bypass this. A mis-click on "bulk Not Converted" with 10 selected demos is irreversible.

### The Marketing Toggle is Conditional
When `marketing: true`, additional marketing comments should be collected. The UI shows the marketing checkbox + conditional textarea. In Phase 2, `marketing: true` demos are routed to a marketing queue for re-engagement.

### Month Auto-Derivation
`formatMonth("2026-04-12")` returns `"Apr 2026"`. This is displayed as a blue badge below the date picker in the Analyst form. The user never types the month — it derives from the date.

---

## Part 8: Environment & Deployment Context

- **Company location:** Karachi, Pakistan
- **Time zone:** PKT (UTC+5)
- **Primary users:** Analysts (2-5), Sales agents (3+: Maryam, Hoor, Muhammad), Managers (1-2)
- **Scale:** 170 teachers, ~50 demos/week, 15 academic levels, 12 subjects
- **Infrastructure budget:** $125-365/month (Vercel + Railway + Supabase + Claude API)
- **Deployment target:** Vercel (frontend), Railway (Python AI backend in Phase 3)
- **Phase 1:** Frontend only, in-memory data, no auth
- **Phase 2:** Supabase database + auth + realtime
- **Phase 3:** Python AI backend with 7 agents (LangGraph + Celery + Redis)
- **Phase 4:** Predictive ML, pgvector semantic search, agent config panel

---

## Part 9: Security Decisions (was SECURITY.md)

### Authentication Flow (Phase 2 — implemented)

```
User opens app → Middleware checks session →
  If valid session → Render page (role from users table)
  If no session → Redirect to /login
```

Middleware at the project root uses `@supabase/ssr`'s `createServerClient` with `NextRequest`/`NextResponse` cookie adapters. Calls `auth.getUser()` (not `getSession`) to validate the JWT with Supabase Auth on every request. See `middleware.ts`.

### Role-Based Route Protection Matrix

| Route | analyst | sales_agent | manager |
|-------|---------|-------------|---------|
| `/` | Read own stats | Read own stats | Read all stats |
| `/analyst` | Full access | No access | Full access |
| `/sales` | No access | Full access | Full access |
| `/kanban` | Own columns | Own columns | All columns |
| `/analytics` | View only | View only | Full access |
| `/teachers` | View only | View only | Full access |
| `/admin/*` | No access | No access | Full access |

Violations redirect to `/?denied=<prefix>`. The store reads the query param on mount, flashes a toast, and cleans the URL via `history.replaceState`.

### RLS Policy Design (as implemented)

Core principle: every read and write is governed by RLS. Service-role key only used by Python backend in Phase 3 (bypasses RLS for AI writes).

**Key policy pattern:** role checks use a `SECURITY DEFINER` helper `public.current_user_role()` that reads from `users` bypassing RLS. This prevents the infinite-recursion bug (Postgres 42P17) that crashed sign-in briefly during Phase 2 rollout — see BUG-009 below.

#### Active policies (summary — exact DDL in `supabase/migrations/`)

**users:**
- Read all profiles (all authenticated)
- Managers manage users (FOR ALL, `current_user_role() = 'manager'`)
- Update own profile (`id = auth.uid()`)

**demos:**
- Analysts read own + unassigned pool (role-scoped so sales agents cannot see unassigned)
- Sales agents read demos where `sales_agent_id = auth.uid()` (tight, no blanket analyst pass)
- Analysts update own reviews (`analyst_id = auth.uid()`)
- Claim unassigned demo (atomic `analyst_id IS NULL` WITH CHECK `= auth.uid()` + role=analyst)
- Sales update own demos
- Analysts create demos (INSERT — either role)
- Managers full access (FOR ALL)

**pour_issues:**
- Read if parent demo is visible (cascades demos RLS via EXISTS)
- Analysts IUD POUR for own demos
- Managers manage all

**demo_drafts / agent_configs / task_queue (Phase 3 tables):**
- Analyst reads own drafts + manager reads all
- Managers manage configs
- Managers read task queue

### Env Var Security

| Variable | Public? | Where used |
|----------|---------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser client (RLS protects data, not the key) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO** | Server Actions / Python backend only (bypasses RLS) |
| `ANTHROPIC_API_KEY` | **NO** | Python backend only (Phase 3) |

Rules:
1. NEVER commit `.env.local` — it's gitignored
2. `.env.example` holds variable names with placeholders
3. `NEXT_PUBLIC_` prefix = exposed to browser; reserved for non-secret values
4. Server-only secrets must NEVER have `NEXT_PUBLIC_` prefix

### PII Handling

| Data | Class | Handling |
|------|-------|---------|
| Student names | PII | Display only; no bulk export without manager approval |
| Parent phone numbers | PII | Visible only to assigned sales agent |
| Teacher names | Business data | Visible to all authenticated users |
| Student verbatim feedback | PII | Visible to assigned analyst + sales agent |
| Demo recordings | PII | Stored in Supabase Storage behind access policies |

Retention: active demos indefinitely; archived (>12mo) to cold storage; user accounts soft-deleted (`is_active=false`); AI drafts retained 6 months; task_queue logs purged after 3 months.

---

## Part 10: Phase 2 Bugs — Added During Deployment

These were not in the original V4 / Phase 1 history. They surfaced during Supabase integration (April 2026).

### BUG-009: Raw-SQL Auth User Seeding — Null Token Columns
- **Severity:** Fatal — sign-in fails for all seeded users
- **Symptom:** "Database error querying schema" on every attempted login
- **Root cause:** GoTrue (Supabase Auth) requires `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` to be `''` (empty string), not NULL. Raw SQL INSERTs into `auth.users` that omit these columns leave them NULL, which breaks token verification.
- **Fix:** Always include those 4 columns with `''` when seeding via SQL. See `20260412112906_seed_initial_users.sql` (fixed) and `20260412112908_fix_auth_user_null_tokens.sql` (hotfix for already-seeded rows).
- **GUARDRAIL:** Never seed `auth.users` via raw SQL without explicitly setting all token columns to `''`. Prefer `supabase.auth.admin.createUser()` when possible.

### BUG-010: Users RLS Infinite Recursion (42P17)
- **Severity:** Fatal — every authenticated read of `users` fails
- **Symptom:** Middleware profile lookup returns null → all routes denied; store `syncUserProfile` fails → no user badge; "Managers full access demos" EXISTS subquery fails → manager sees 0 demos.
- **Root cause:** `"Managers manage users"` FOR ALL policy on `users` table had `USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'))` — reading users to decide a policy on users causes Postgres to evaluate policy → query → evaluate policy → infinite loop.
- **Fix:** Introduce `public.current_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp`. The SECURITY DEFINER function runs as postgres (which has BYPASSRLS), so its inner query doesn't trigger policies. Rewrite every policy that used `EXISTS (… users … role=X)` to `public.current_user_role() = 'X'`. See migration `20260413000000_fix_users_rls_recursion.sql`.
- **GUARDRAIL:** Never write a policy on table X whose USING/WITH CHECK queries table X. Use a SECURITY DEFINER helper for role lookups. Grant EXECUTE only to `authenticated, service_role` and REVOKE from PUBLIC.

### BUG-011: Analysts Read Policy Leaked Unassigned Pool to Sales
- **Severity:** Medium — RLS-level role isolation violation
- **Symptom:** Sales agent dashboard showed 12 demos instead of 0.
- **Root cause:** `"Analysts read own and unassigned demos"` SELECT policy had `USING (analyst_id = auth.uid() OR analyst_id IS NULL OR role='manager')` with no role restriction on the `analyst_id IS NULL` branch. Since all seed demos had `analyst_id = NULL`, any authenticated user (including sales agents) matched this branch.
- **Fix:** Add role gate: USING now requires `current_user_role() = 'analyst'` for the own-and-unassigned branch. Managers remain covered by their separate FOR ALL policy. See `20260413000001_scope_analyst_read_to_analyst_role.sql`.
- **GUARDRAIL:** When copying policies verbatim from docs, trace each branch against every role — not just the role named in the policy title. An "analyst" policy that doesn't assert role='analyst' applies to everyone authenticated.

### BUG-012: Next.js .next Cache Corruption (Recurring)
- **Severity:** High — entire UI renders unstyled or with 500 errors
- **Symptom:** Nav bar loses all CSS, pages show raw HTML or MODULE_NOT_FOUND errors, Kanban/Analytics show 0 data
- **Root cause:** Running `npm run build` while `npm run dev` is active corrupts webpack chunk IDs in `.next/server/`. The dev server holds references to old chunk hashes that no longer exist.
- **Fix:** `pkill -f 'next' && rm -rf .next && npm run dev`
- **GUARDRAIL:** NEVER run `npm run build` while `npm run dev` is running. Stop the dev server first, run build, then restart dev. Use this safe sequence:
  ```bash
  # SAFE build check:
  pkill -f 'next' 2>/dev/null; sleep 1
  npm run build
  npm run dev  # restart after build
  ```
- **Occurrences:** Step 6 verification (twice), post-cleanup commit (62c3e05)

### BUG-013: Duplicate INSERT from React Strict Mode × impure updater
- **Severity:** High — every analyst-form submit created TWO DB rows with adjacent ids
- **Symptom:** Student "Ahmed Shaheer" or "dsfg" appeared twice on the dashboard; DB query showed `ids=[N, N+1]` with created_at within microseconds
- **Root cause:** The analyst form's submit handler called `Date.now()` *inside* the `setDemos` updater. React Strict Mode deliberately invokes state updaters twice in dev to flag impurity; each invocation produced a Demo with a different `id` (off by 1 ms), so the store's `shouldFire('insert:' + id)` hash dedup saw two distinct hashes and fired INSERT twice.
- **Fix:** Hoist `Date.now()` to `const now = Date.now()` BEFORE `setDemos`, build the whole `newDemo` object once, then pass it into the updater as a captured constant. Both strict-mode invocations now use the same id → dedup catches the second. Migration commit `2e6bd05`.
- **Secondary defense:** Added `processedRealtimeIds: useRef<Set<number>>` in the store's realtime INSERT handler to drop any event whose id was already processed.
- **GUARDRAIL:** State updater functions must be PURE. Never call `Date.now()`, `Math.random()`, `uuid()`, or any side-effect inside a `setState(prev => …)` callback. Compute impure values once, capture as `const`, then pass the captured value into the updater.

---

## Part 11: Phase 2 Completion Record

**Date:** April 2026
**Status:** Complete — all 6 steps verified

### What was delivered:
- 7 Supabase tables (demos, teachers, users, pour_issues, demo_drafts, agent_configs, task_queue)
- 12 SQL migrations (sequential, no gaps)
- 19 RLS policies with SECURITY DEFINER helper to avoid recursion
- 3 seeded users (manager, analyst, sales_agent) with email/password auth
- Login page with Apple design system styling
- Middleware for session checking and role-based route protection
- Store refactor: Supabase fetch on mount, optimistic writes with rollback, Realtime subscriptions
- Transform layer (snake_case DB ↔ camelCase frontend)
- Sales agent assignment from users table (not hardcoded constants)
- Role-filtered nav (analysts can't see Sales, sales can't see Analyst)
- Contextual empty states per role

### Bugs found and fixed during Phase 2:
- BUG-009: GoTrue null token columns (auth sign-in crash)
- BUG-010: RLS infinite recursion on users table
- BUG-011: Analyst SELECT too permissive (leaked all demos to all roles)
- BUG-012: .next cache corruption from concurrent build/dev
- BUG-013: Duplicate INSERT from React Strict Mode (Date.now() in state updater)

### What's ready for Phase 3:
- demo_drafts table exists (empty, waiting for AI agent output)
- agent_configs table exists (empty, waiting for prompt configuration)
- task_queue table exists (empty, waiting for Celery task tracking)
- PROMPTS section in CONTEXT.md has production-ready system prompts for all 7 agents
