# CLAUDE.md — Project Instructions for Claude Code

## Identity

You are working on the **Demo to Conversion Platform** for **Tuitional Education**, a tutoring company in Karachi, Pakistan. This tracks demo tutoring sessions through an 11-step pipeline.

## Stack — three layers, one repo, one deploy

| Layer | Directory | What it does |
|-------|-----------|-------------|
| Frontend | `app/`, `components/`, `lib/`, `middleware.ts` | Next.js 15 + React 19 + Supabase client |
| Backend (Phase 3, active) | `backend/` | FastAPI + LangGraph + Anthropic + Groq Whisper. Runs on `:8000`. Auth: ES256 JWT via JWKS (see `backend/app/auth.py`) |
| Database | `supabase/migrations/` | Postgres + RLS + Realtime + Auth. Migrations must be applied in order |

**These three layers ship together.** Frontend code that calls a Supabase RPC assumes the migration introducing it has been applied. Frontend code that hits a backend endpoint assumes the backend has been deployed with the matching handler. A PR that changes one without the others will break at runtime even if `npm run build` is green. See **Deploy Contract** below.

## The Four Laws — Non-Negotiable

Violating any one of these has crashed this project before.

### Law 1: Space Before Return
The JSX transpiler turns `return(` (no space) into `returnReact.createElement(…)` and crashes the whole app. Every `return` statement MUST have a space before the parenthesis:
```tsx
return (          // ✅ correct
  <div>…</div>
);
return(<div>…</div>);   // ❌ fatal
```
After every edit, run:
```bash
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' --include='*.ts' | grep -v 'return (' | grep -v '//' | grep -v 'returnType'
```
Zero matches required.

### Law 2: No Hardcoded Chart Data
Every number in every chart, KPI card, leaderboard, or summary MUST be computed from the `demos` state array via `useMemo`. Analytics and Dashboard must always show consistent numbers. After every chart edit, run:
```bash
grep -rn 'const MONTHLY\|const ACCT_DATA\|const AGENT_DATA' app/ --include='*.tsx'
```
Zero matches required.

### Law 3: Muhammad, Not Zain
The third sales agent is **Muhammad**. "Zain" was wrong and was globally replaced. After every edit, run:
```bash
grep -rnE '"Zain"|'\''Zain'\''' app/ components/ lib/ --include='*.tsx' --include='*.ts'
```
Zero matches required.

The pattern matches a standalone quoted `"Zain"` / `'Zain'` string literal — that's how the bug originally manifested (`{ id: 3, name: "Zain" }` in the AGENTS array). It deliberately does **not** match legitimate teacher names that contain "Zain" as a substring (e.g. `"Syed Zain Ali Akbar"`, `"Zainab Fatima"` — added to the TEACHERS roster on 2026-04-14). The naive `grep 'Zain'` would false-positive on those.

### Law 4: Bracket Balance
After creating or editing any `.tsx` file, the naive `{}`/`()`/`[]` counts must each be zero.

### Running all four
Don't run the four greps by hand — they're codified in `scripts/_four-laws-check.sh`, which `scripts/smoke.sh` calls. See **Before You Commit** below.

## Deploy Contract

The three stack layers ship **in lockstep**:

```
1.  Apply migrations       supabase/migrations/ → DB
2.  Deploy backend         backend/   → :8000  (needs `cryptography`, `PyJWT`)
3.  Build + serve frontend app/ + lib/ → :3000 (reads from (1) and (2))
```

If step 3 references anything added in step 1 or 2, steps 1 + 2 MUST be deployed first. **An on-disk migration that has not been applied is a footgun** — the frontend `supabase.rpc('foo', …)` call passes TypeScript but 404s at runtime. This is what broke the UI on 2026-04-15 (see MEMORY.md `feedback_never_ship_unverified_integration.md`).

**The smoke script enforces this.** `scripts/smoke.sh` probes every `supabase.rpc()` called from frontend code against the live DB; it fails loudly if any called function isn't deployed.

## Before You Deploy — local `:3000` first, always

**Rule**: No change goes to Vercel / Render / the production domain until it has been verified end-to-end on `http://localhost:3000` against the live DB, as each relevant role.

Sequence, non-negotiable:

1. Apply migrations (`supabase/migrations/`) to the prod project.
2. `./scripts/smoke.sh` passes.
3. `npm run dev` on :3000 — walk the affected flows as analyst / manager / sales. Open the browser console; confirm zero errors. Confirm role-gated UI, realtime reactivity, and the obvious negative cases (missing data, wrong role, typos).
4. Only then push to `main`.

Build-green ≠ prod-ready. Full details + symptoms of past breakage in [DEPLOY.md](DEPLOY.md) and `memory/feedback_local_before_domain.md`.

## Before You Commit

**Single command:** `./scripts/smoke.sh`

It runs, in order:
1. Four Laws + bracket balance — `scripts/_four-laws-check.sh`
2. `npm run build` — zero TS errors, zero new warnings
3. Migration manifest — every RPC in frontend code exists in the DB
4. Backend contract — `POST /api/v1/demos/*/analyze` without auth returns 401
5. Dev server reachability — `/login` returns HTML (if dev is running)

A passing run ends with `✅ smoke passed`. Anything else blocks the commit.

For this to be automatic on every push, install the hook once per clone:
```bash
./scripts/install-git-hooks.sh
```

**If you're touching code that calls a Supabase RPC, reads a new column, hits a new backend endpoint, or reads a new env var — the migration / deploy / env MUST be applied before the commit.** Do not ship on trust.

## Workflow for Every Task

```
UNDERSTAND → LOCATE → PLAN → IMPLEMENT → VERIFY → REPORT
```

1. **UNDERSTAND** — Read the relevant doc. Business logic → CONTEXT.md. UI → DESIGN.md. State → "How State Works" below.
2. **LOCATE** — Identify which files need to change. Check the File Roles table.
3. **PLAN** — State what you will change and why, before writing code. If touching `lib/store.tsx`, list every consumer that will be affected.
4. **IMPLEMENT** — Follow the Code Conventions section below.
5. **VERIFY** — `./scripts/smoke.sh` (runs Four Laws + build + migration manifest + backend contract). No other sequence.
6. **REPORT** — Summarize what changed and confirm the smoke passed.

## Project Structure

```
├── app/                          # Next.js App Router pages
│   ├── globals.css
│   ├── layout.tsx                # Root layout: StoreProvider + Nav + ToastAndConfirm
│   ├── page.tsx                  # Dashboard
│   ├── login/page.tsx            # Supabase Auth login form
│   ├── analyst/page.tsx          # Analyst review form (Steps 1–5)
│   ├── sales/page.tsx            # Sales queue + detail + Step 10 accountability
│   ├── kanban/page.tsx           # Drag-drop board (workflow_stage columns)
│   ├── analytics/page.tsx        # Tab switcher: Demos | Sessions (?tab=sessions). All charts computed from live data.
│   ├── teachers/page.tsx         # Teacher performance + drill-down
│   ├── enrollments/page.tsx      # Product Review: enrollment CSV upload + table
│   └── sessions/
│       ├── page.tsx              # Product Review: session CSV upload + table + status
│       └── [id]/page.tsx         # Product Review: session detail + AI scorecard
├── components/
│   ├── nav.tsx                   # Tuitional brand nav (#38b6ff bar + logo), search, notifications, user menu
│   ├── ui.tsx                    # StatusBadge, Field, Stars, EmptyState, SectionHeader
│   ├── toast-confirm.tsx         # Toast + confirm modal
│   ├── csv-upload.tsx            # Reusable CSV file upload button
│   ├── session-status-badge.tsx  # Processing status badge (pending/processing/scored/approved/failed)
│   ├── session-draft-review.tsx  # Session QA scorecard review (8-question, approve/reject)
│   ├── teacher-product-log.tsx   # Approved sessions list for a teacher/student (accepts optional filterFn to narrow via drill filters; shared with future /students/[id])
│   └── (backend: app/scheduler.py — AsyncIOScheduler for auto-retry of failed sessions)
├── lib/
│   ├── types.ts                  # Demo type, design tokens, lookup arrays
│   ├── utils.ts                  # Helper functions
│   ├── data.ts                   # SEED_ACTIVITY only (demos come from Supabase)
│   ├── store.tsx                 # React Context + Supabase reads/writes/realtime
│   ├── supabase.ts               # Browser Supabase singleton
│   ├── supabase-server.ts        # Server Supabase client (cookies-based)
│   ├── transforms.ts             # dbRowToDemo / demoToInsertRow / demoUpdatesToDb
│   ├── csv-parser.ts             # Client-side CSV parser + column mappers (enrollments, sessions)
│   └── review-transforms.ts      # DB row ↔ camelCase for enrollments + sessions
├── middleware.ts                 # Route protection + auth refresh
├── public/
│   └── tuitional-logo.svg        # Brand mark rendered in the nav bar
├── supabase/
│   └── migrations/               # SQL migrations (timestamp-prefixed)
├── .env.example                  # Template
├── .env.local                    # Real secrets (gitignored)
├── CLAUDE.md                     # THIS FILE — master instructions
├── CONTEXT.md                    # Business domain + Phase 3 agent prompts
├── DESIGN.md                     # Apple design system tokens
├── MEMORY.md                     # Decisions, bugs, security model
└── README.md                     # Setup + architecture + working-with-Claude
```

## File Roles — Quick Reference

| File | What it does | When to read it |
|------|-------------|-----------------|
| `CLAUDE.md` | Master rules, structure, patterns, verification | Always — read first |
| `CONTEXT.md` | Business logic, pipeline steps, POUR taxonomy, AI agent prompts | When implementing business rules or touching Phase 3 |
| `MEMORY.md` | Past bugs, architecture decisions, rejected approaches, security model | Before architectural choices, auth changes, RLS |
| `DESIGN.md` | Colors, spacing, typography, components | When building or modifying UI |
| `README.md` | Setup, architecture, Phase 2 migration, working with Claude Code | Onboarding, deploy prep |
| `lib/types.ts` | All TypeScript types and lookup data | When using any data type |
| `lib/store.tsx` | Supabase-backed global state | When reading or writing state |
| `lib/transforms.ts` | DB↔App row mapping | When touching DB fields |
| `lib/utils.ts` | Helper functions | When formatting or computing |
| `components/ui.tsx` | Shared UI components | When building any view |
| `components/nav.tsx` | Navigation (role-filtered) | Never render inside a page |
| `lib/csv-parser.ts` | CSV parse + column mapping | When touching CSV upload flow |
| `lib/review-transforms.ts` | Enrollment/session DB transforms | When changing enrollment/session schema |
| `components/session-draft-review.tsx` | Session scorecard review | When modifying session approval flow |
| `components/teacher-product-log.tsx` | Approved-sessions list (per teacher or student). Accepts optional `filterFn: (s: TeacherSession) => boolean` prop for narrowing sessions **after** the stable-FK teacher/student match. | When changing /teachers Product log, wiring drill-level filters into the Product log tab, or building /students/[id] |
| `components/add-teacher-review-drawer.tsx` | Right-slide drawer for authoring manual teacher reviews on `/teachers` (Product / Student / Excellence). Analyst/manager/hr only. **Scope toggle**: Product + Excellence can be `enrollment` (specific class) or `general` (overall teacher); Student is always `enrollment`. **Review date** input on every type, defaults to today, user-editable. For `enrollment` scope, calls `lookup_enrollment_for_review` RPC to fetch enrollment context + 5 most recent sessions; then `add_teacher_review` (SECURITY DEFINER) on submit. Reuses `RubricQuestion` + `ScoreScale` from `components/rubric.tsx`. Excellence rubric has 10 questions including the Agility section (adaptability / feedback_response / pace_flexibility). | When changing manual-review entry UX, adding a review type or scope, or changing the rubric questions in `lib/types.ts` (RUBRIC_BY_TYPE) |
| `components/teacher-review-card.tsx` | Pure presentational card for one `TeacherReview`. Type pill (Product=blue, Student=green, Excellence=purple) + scope badge (General / Enrollment) + rating + `review_date` (primary; `created_at` shown only if back-dated) + snapshot context (suppressed for General) + summary + rubric grid + verbatim block (Student) + improvement notes. Manager-only delete via `confirmDeleteTeacherReview`. | When changing how a manual review is rendered, or adjusting card layout for new rubric question types |
| `components/rubric.tsx` | Shared `RubricQuestion` + `ScoreScale` (lifted from `hr-interview-drawer.tsx` 2026-04-27). Used by HR interview drawer AND manual-review drawer. Structural prop type `RubricQuestionLike` accepts both `HrInterviewQuestion` and `RubricQuestionDef`. Per `feedback_drawer_button_flex_overflow.md` — never use flex:1 on score buttons; ScoreScale uses fixed 34×30. | When tweaking rubric controls (yes/no pills, score scale, choice selects, optional notes) — touch one place, both drawers update |
| `components/accountability-drawer.tsx` | Slide-in panel opened from /conducted row-click. Analyst/manager finalises the Product/Sales/Consumer-Issue multi-select for a Not-Converted demo. Goes through `finalizeAccountability` / `clearAccountability` store actions (atomic RPCs). | When changing accountability UX, adding categories, or wiring accountability into other surfaces (e.g. /students/[id]) |
| `components/demos-analytics.tsx` | The "Demos" tab body on `/analytics`. Verbatim extraction of the pre-tab-switcher page — hero, funnel, trend, POUR, QA scorecard, accountability, aging, subject demand, lead pipeline, agent leaderboard. Still reads `useStore().rangedDemos`. | When adding or adjusting a demo-side analytics chart |
| `components/sessions-analytics.tsx` | The "Sessions" tab body on `/analytics`. Orchestrates 12 useMemo aggregations over `useStore().rangedApprovedSessions` (interpretation bands, monthly trend, Q1–Q8 averages, POUR, subject/grade/curriculum, turnaround, attendance, teacher leaderboard, reviewer leaderboard) and owns the per-teacher drawer open state. Analyst/manager only; silently falls back to Demos tab otherwise. Child components are purely presentational: `sessions-interpretation-row`, `sessions-volume-trend`, `sessions-quality-charts`, `sessions-breakdowns`, `sessions-teacher-leaderboard`, `sessions-reviewer-leaderboard`, `sessions-teacher-drawer`. | When adding or adjusting a sessions-side analytics chart, or wiring a new aggregation into `useStore().rangedApprovedSessions` |
| `components/analytics-tabs.tsx` | Sticky pill tab strip (Demos \| Sessions) rendered directly below the fixed nav on `/analytics`. URL-syncs via `?tab=sessions`. Hides the Sessions pill unless `user.role` is analyst or manager. | When adding another analytics tab or changing the role gate |
| `components/sessions-teacher-drawer.tsx` | Right-slide drawer opened from the Sessions teacher leaderboard. Shows all-time approved sessions for that teacher (not date-filtered), Q1–Q8 averages, POUR breakdown, weakest question, 10 most recent approved sessions, and a link to `/teachers/[id]`. Exports `sessionGroupKey()` — the single source of truth for teacher-row identity on the Sessions tab. | When changing the teacher drill UX on `/analytics`, or adding a new drawer section |
| `backend/app/scheduler.py` | APScheduler job that auto-retries failed sessions every 15 min | When tuning retry behavior, adding failure classifications, or debugging stuck sessions |
| `app/hr/page.tsx` | HR workspace. 4 tabs (Candidates / Pending / Approved / Rejected). Route-gated to hr+manager. Opens `HrCandidateForm` and `HrInterviewDrawer`. | When changing HR intake or the interview/decision flow |
| `app/teachers/[id]/page.tsx` | Teacher profile page. Tabs: Profile · Rates · Schedule · Demos · Interview (hr/manager only). Edit button visible to hr/manager/**analyst** — goes through `update_teacher_profile` RPC (whitelisted fields, never `tid`/`status`). | When changing profile edit UX, adding fields, or wiring new tabs |
| `components/hr-candidate-form.tsx` | Drawer form for creating teacher candidates. Uniqueness by `hr_application_number`. | When HR intake fields change |
| `components/hr-interview-drawer.tsx` | Candidate interview drawer. Tabs: Info · Interview · Scorecard · Rates · Schedule · Decision. "Transcribe + Analyze" POSTs to backend `recruitment.py`; scorecard arrives via realtime on `hr_interview_drafts`. | When changing the interview pipeline, scorecard shape, or the Approved/Pending/Rejected outcomes |
| `components/teacher-rates-editor.tsx` | Row-level add/edit/delete for `teacher_rates`. UNIQUE (curriculum,level,grade,subject). Direct table mutations (side table has no sensitive columns). Reused in interview drawer AND `/teachers/[id]`. | When adding fields to the rate row or changing rate validation |
| `components/teacher-schedule-editor.tsx` | Weekly recurring availability grid for `teacher_availability`. Timezone per row. Overlaps allowed in v1. | When adding schedule exceptions or overlap validation |
| `backend/app/routers/recruitment.py` | `/api/v1/hr-interviews/{id}/process-recording` and `/analyze`. Reuses `ingest.run` for Whisper transcription; v1 chains `demo_analyst` as a bootstrap for the scorecard. Writes to `hr_interview_drafts`. | When the HR AI rubric becomes a dedicated agent, or when retry behavior changes |
| `lib/teacher-transforms.ts` | DB row → camelCase for teacher_profiles / teacher_rates / teacher_availability / hr_interview_drafts. Exports `teacherFullName()` which handles the `last_name='—'` sentinel used by the 171-row backfill. | When schema columns change or new transforms are needed |
| `app/globals.css` | All CSS classes | When adding new CSS |
| `supabase/migrations/` | Schema history | When changing DB shape |

## How State Works

All shared state lives in `lib/store.tsx` (React Context). Every page accesses it via `useStore()`:

```tsx
const {
  demos,             // Full demo array (source of truth, synced with Supabase)
  setDemos,          // Wrapped setter — diff + batched Supabase write + rollback
  rangedDemos,       // demos filtered by global date range
  approvedSessions,  // Approved product-review sessions joined to their scorecard (analyst/manager only)
  rangedApprovedSessions, // approvedSessions filtered by global dateRange (Sessions analytics tab)
  reviewerNames,     // Record<uuid, full_name> for analyst+manager users — powers the reviewer leaderboard
  stats,           // Computed: { total, converted, pending, notConv, rate, avgR, pourRate }
  flash,           // flash("Message") — toast for 3.5s
  logActivity,     // logActivity("converted", "Maryam", "Ahmed Khan")
  setConfirm,      // setConfirm({ title, msg, onConfirm }) — confirm modal
  confirmDeleteDemo,      // confirmDeleteDemo(demo, { onAfterDelete? }) — manager hard-delete with confirm modal + cascade
  confirmBulkDeleteDemos, // confirmBulkDeleteDemos(demos, { onAfterDelete? }) — one modal, batched delete for bulk selections (/sales action bar)
  confirmDeleteSession,   // confirmDeleteSession(id, label, { onAfterDelete? }) — manager hard-delete on sessions table
  teacherReviews,         // Manual reviews authored on /teachers (Product/Student/Excellence) — visible to all authenticated; FK on teacher_user_id
  addTeacherReview,       // addTeacherReview(payload) — analyst/manager/hr; calls add_teacher_review SECURITY DEFINER RPC
  lookupEnrollmentForReview, // lookupEnrollmentForReview(id) — used by Student/Excellence flows; returns enrollment + 5 most recent sessions
  confirmDeleteTeacherReview,// confirmDeleteTeacherReview(id, label, { onAfterDelete? }) — manager-only via delete_teacher_review RPC
  notifications,   // Computed: pending demos aged 3+ days
  dateRange, setDateRange,
  loading,         // True during initial fetch
  user,            // { id, email, role, full_name } | null
} = useStore();
```

### Data-model invariant — entities are loosely coupled

**A teacher can have demos with no sessions, sessions with no demos, both, or neither. Same for students.** The demo pipeline and the product-review (session) pipeline are independent data flows that happen to share the same humans. Any page, query, component, or aggregation that references teachers or students MUST:

- Never assume a teacher appears in `demos` just because they exist in `sessions` (and vice versa). The `/teachers` page learned this the hard way — its grid was built only from demos, so teachers with approved sessions but zero demos were unreachable. Fixed by unioning sources via the `TEACHERS` roster lookup ([app/teachers/page.tsx:23-44](app/teachers/page.tsx#L23-L44)).
- Build primary groupings from the **union** of all entity sources that can carry the teacher/student name, not from one source.
- Resolve a teacher's tid from name via the `TEACHERS` array in [lib/types.ts](lib/types.ts) when joining across `demos` ↔ `sessions` ↔ `enrollments` (different ID spaces — see `memory/project_session_to_profile_linkage.md`).
- Render empty-KPI cards gracefully for entities that exist in one source only — never crash, never silently hide.

The same invariant applies to the future `/students/[id]`: a student may have many sessions and zero demos, or vice versa.

### Store rules
- Pages use `rangedDemos` for display, `demos` only for mutations
- Never import Supabase in page components for DATA — all data goes through `useStore()`
- **Exception:** auth operations (`supabase.auth.signInWithPassword`, `supabase.auth.signOut`) are allowed to call `supabase` directly from `app/login/page.tsx` and `components/nav.tsx`. Auth is a session concern, not a data concern; the store's read/write/realtime machinery doesn't apply.
- Never init `useState` from a computed value depending on `demos` — use `useMemo`
- Every mutation to `setDemos` should be followed by `logActivity()` for audit

### Adding a new demo
```tsx
setDemos(prev => [{
  id: Date.now(), date: f.date, teacher: f.teacher, tid: t.uid,
  student: f.student, level, subject, pour: [], review: "",
  studentRaw: 7, analystRating: 0, status: "Pending" as const,
  suggestions: "", agent: "", comments: "", verbatim: "", acctType: "",
  accountabilityFinal: [], accountabilityFinalAt: null, accountabilityFinalBy: null,
  link: "", recording: "", marketing: false, ts: Date.now(),
  workflowStage: "pending_sales",
}, ...prev]);
```

### Updating a demo
```tsx
setDemos(prev => prev.map(d =>
  d.id === id ? { ...d, status: "Converted", agent: "Maryam" } : d
));
```

The wrapped `setDemos` diffs prev vs next by id + reference equality, groups identical field-diffs for **batched `.in('id', [ids])` UPDATEs**, handles POUR changes via DELETE+INSERT, and rolls back local state on Supabase error.

## Data Model

Every `Demo` (see `lib/types.ts`):

| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Date.now() on client create; BIGINT in DB |
| `date` | `string` | ISO "YYYY-MM-DD" |
| `teacher` | `string` | Teacher full name (denormalized) |
| `tid` | `number` | Teacher user ID |
| `student` | `string` | Student full name |
| `level` | `string` | IGCSE, A Level, IB, … |
| `subject` | `string` | Mathematics, Physics, … |
| `pour` | `{cat, desc}[]` | DB columns are `category` / `description` — mapped in transforms |
| `review` | `string` | Qualitative review text |
| `methodology`, `engagement`, `improvement` | `string?` | Optional analyst fields |
| `studentRaw` | `number` | 0–10 |
| `analystRating` | `number` | 0–5 |
| `status` | `"Pending" \| "Converted" \| "Not Converted"` | Coarse state |
| `workflowStage` | `"new" \| "assigned" \| "under_review" \| "pending_sales" \| "contacted" \| "converted" \| "lost"` | Fine-grained pipeline stage; drives Kanban columns |
| `suggestions` | `string` | — |
| `agent` | `string` | Sales agent name (Phase-1 display; Phase-2+ uses `sales_agent_id` FK) |
| `comments`, `verbatim` | `string` | Sales inputs |
| `acctType` | `"Sales" \| "Product" \| "Consumer" \| ""` | **Sales suggestion** (Step 10). Locked read-only once an analyst finalises on `/conducted` |
| `accountabilityFinal` | `string[]` | Product-analyst finalisation — multi-select subset of `Product / Sales / Consumer`. Set via `/conducted` drawer → `finalize_demo_accountability` RPC. Empty until finalised. Authoritative over `acctType` for analytics/teachers |
| `accountabilityFinalAt` | `string \| null` | ISO timestamp. Non-null ⇔ `accountabilityFinal.length ≥ 1` (invariant enforced by the RPCs) |
| `accountabilityFinalBy` | `string \| null` | UUID of the analyst/manager who finalised |
| `link` | `string` | Sales reference URL |
| `recording` | `string` | Recording URL set by analyst (Step 1 of pipeline) |
| `marketing` | `boolean` | Marketing lead flag |
| `ts` | `number` | ms-epoch timestamp for ordering |

### Lookup arrays (all in `lib/types.ts`)
- `TEACHERS` — 8 teachers with id, name, uid
- `LEVELS` — 13 academic levels
- `SUBJECTS` — 12 subjects
- `POUR_CATS` — 7 issue categories
- `AGENTS` — 3 sales agents: Maryam, Hoor, Muhammad
- `ACCT_TYPES` — Sales, Product, Consumer

## Design System (quick reference — full details in DESIGN.md)

Tokens in `lib/types.ts`:
- `BLUE` `#0071e3` — primary accent
- `NEAR_BLACK` `#1d1d1f` — body text
- `LIGHT_GRAY` `#f5f5f7` — section backgrounds
- `MUTED` `#86868b` — secondary text
- `CARD_DARK` `#1c1c1e` — dark cards

Primary CSS classes in `app/globals.css`: `.apple-input`, `.apple-select`, `.apple-textarea`, `.apple-checkbox`, `.pill`, `.pill-blue`, `.pill-outline`, `.pill-white`, `.demo-card`, `.kanban-card`, `.pour-tag`, `.section-label`, `.filter-select-dark`, `.filter-select-light`, `.nav-bar`, `.nav-link`, `.toast`, `.animate-fade-up`, `.animate-slide-in`.

Hybrid approach: CSS classes for reusable patterns (inputs, buttons, cards). Inline styles for layout (grid, flex, spacing). No Tailwind.

## Component Reference (`components/ui.tsx`)

```tsx
import { StatusBadge, Field, Stars, EmptyState, SectionHeader } from "@/components/ui";

<StatusBadge status="Pending" />
<Field label="Name *" error={errors.name}><input className="apple-input" /></Field>
<Stars value={4} onChange={setRating} />          // Interactive
<Stars value={4} readOnly onChange={() => {}} />  // Display only
<EmptyState text="No demos match filters" />
<SectionHeader num="01" title="Info" subtitle="…">{children}</SectionHeader>
```

## Page Pattern

Every page is `"use client"` in `app/[route]/page.tsx`:

```tsx
"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";

export default function MyPage() {
  const { rangedDemos, setDemos, flash } = useStore();
  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Category</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Page title.</h1>
        </div>
      </section>
      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        {/* content */}
      </section>
    </>
  );
}
```

`paddingTop: 92` accounts for sticky nav (48px) + visual spacing.

---

## Code Conventions

### TypeScript
- Strict mode ON — no implicit any, no unused locals
- Type all exported function parameters and return values
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `Record<string, T>` instead of `{[key: string]: T}`

### Naming
- **Files**: kebab-case (`toast-confirm.tsx`)
- **Components**: PascalCase (`StatusBadge`)
- **Functions**: camelCase (`ageDays`, `formatMonth`)
- **Constants**: UPPER_SNAKE for primitives (`BLUE`), PascalCase for arrays/objects (`TEACHERS`, `POUR_CATS`)
- **Props interfaces**: `ComponentNameProps`
- **State filter prefixes**: `f` (`fStatus`, `fTeacher`)
- **Sales form field bag**: `sf`

### React patterns
```tsx
// ✅ functional update
setDemos(prev => prev.map(d => d.id === id ? { ...d, status } : d));

// ❌ stale closure
setDemos([...demos, newDemo]);

// ✅ useMemo for derived values
const filtered = useMemo(() => demos.filter(d => d.status === fStatus), [demos, fStatus]);

// ✅ presence check on numbers
{items.length > 0 && <List />}

// ❌ renders "0" when empty
{items.length && <List />}
```

### Import order
```tsx
"use client";                                    // 1. Directive
import { useState, useMemo, useEffect } from "react";  // 2. React
import Link from "next/link";                           // 3. Next
import { useStore } from "@/lib/store";                 // 4. Local lib
import { StatusBadge } from "@/components/ui";          // 5. Components
import { TEACHERS, MUTED, BLUE } from "@/lib/types";    // 6. Types/constants
import { ageDays } from "@/lib/utils";                  // 7. Utilities
import { BarChart } from "recharts";                    // 8. Third-party
```

### CSS patterns
```tsx
// Responsive cards (KPIs, teacher cards)
gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
// Two-column form
gridTemplateColumns: "1fr 1fr"
// Master-detail (Sales queue + panel)
gridTemplateColumns: sel ? "minmax(0,380px) minmax(0,1fr)" : "1fr"
// Kanban (5 fixed)
gridTemplateColumns: "repeat(5, minmax(170px, 1fr))"
```

**Border radius scale** — `980px` pills, `16px` chart/modal cards, `14px` KPI/kanban columns, `12px` demo/kanban cards, `10px` inputs, `8px` inner boxes, `6px` small buttons, `4px` checkboxes.

**Section alternation** — `#000` hero → `LIGHT_GRAY` KPIs → `#fff` content → `LIGHT_GRAY` charts → `#000` leaderboard.

### File size
Keep pages ≤ 300 lines, shared components ≤ 200, library files ≤ 150. If a page exceeds, extract a sub-component into `components/`.

---

## Verification Scripts

Run after every edit before committing. Kept short — for deeper detail see `npm run build` which is the final gate.

```bash
# 1. Build — catches types, bundling, page registration
npm run build

# 2. Four Laws sweep
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' --include='*.ts' | grep -v 'return (' | grep -v '//' | grep -v 'returnType'
grep -rn 'const MONTHLY\|const ACCT_DATA\|const AGENT_DATA' app/ --include='*.tsx'
grep -rn 'Zain' app/ components/ lib/ --include='*.tsx' --include='*.ts'

# 3. Bracket balance per changed file
for f in changed files; do
  node -e "const c=require('fs').readFileSync('$f','utf8');let b=0,p=0,k=0;for(const x of c){if(x==='{')b++;if(x==='}')b--;if(x==='(')p++;if(x===')')p--;if(x==='[')k++;if(x===']')k--;}console.log('$f',b,p,k);if(b||p||k)process.exit(1);"
done

# 4. Every page has "use client" + default export
for f in app/page.tsx app/*/page.tsx; do
  head -1 "$f" | grep -q '"use client"' || echo "MISSING use client: $f"
  grep -q 'export default' "$f" || echo "MISSING default export: $f"
done
```

---

## Testing Checklist

### Automated (must pass before commit)
1. `npm run build` → zero TS errors
2. Four Laws sweep → zero matches
3. Bracket balance → all zeros

### Manual (spot-check after UI changes)

**Dashboard** — KPIs match demo count; date range updates numbers; empty state text is role-aware (sales/analyst/manager).

**Analyst form** — required-field validation; POUR checkbox reveals description input; star keyboard support; submit guard prevents double-click; new demo appears once in Dashboard + Sales queue.

**Sales queue** — status filter; teacher/agent/sort dropdowns; select-all + bulk action; confirm modal on status change; detail panel shows analyst review + POUR + recording link + Step 10 accountability when Not Converted; auto-suggested accountability matches CONTEXT.md logic.

**Kanban** — cards in correct column based on `workflowStage` (NOT age/data-presence); drag-drop shows drop target + confirmation modal on Converted/Not Converted.

**Analytics (Demos tab)** — all 9 panels (funnel, trend, POUR, QA scorecard, accountability, aging, subject demand, lead pipeline, agent leaderboard) have non-empty data; respond to global date range.

**Analytics (Sessions tab)** — analyst/manager only; `?tab=sessions` deep-links; interpretation bands sum to `approvedCount`; Q1–Q8 ratios stay in 0–100% (Q6 not perpetually last); clicking a teacher card opens the per-teacher drawer with Q1–Q8 bars, POUR, weakest-Q tile, recent-sessions list; backdrop click + Esc close the drawer; reviewer leaderboard shows real names not UUIDs.

**Teachers** — cards show correct stats; drill-down chart uses actual dates on x-axis; close button dismisses.

**Nav** — role-filtered links (sales sees no "Analyst"); user-initial badge → dropdown → Sign out; search finds by student/teacher/subject; ESC closes search; notification dropdown closes on outside click.

**Realtime** — update a demo in one tab, watch it reflect in another tab within ~1s.

### Data integrity tests (sanity)
- Add a demo as analyst → appears once on Dashboard, Sales, Kanban, Analytics, Teachers
- Mark Converted → Dashboard rate updates, Kanban card moves, Analytics funnel increments, Teacher rate updates
- Set date range to 7d → all views reflect only last 7 days

---

## Do Not

- Do NOT use Tailwind classes — CSS + inline styles only
- Do NOT create separate CSS files per component — all CSS in `globals.css`
- Do NOT use `localStorage` / `sessionStorage` — state is Supabase + React Context
- Do NOT render `<Nav />` inside pages — it's in `layout.tsx`
- Do NOT use `"use server"` — backend runs as a separate FastAPI service at `:8000`; frontend talks to it over HTTP with `Authorization: Bearer <supabase-access-token>`
- Do NOT add new npm dependencies without explicit instruction
- Do NOT hardcode chart data — compute from `rangedDemos` via `useMemo`
- Do NOT use `return(` without a space (Law 1)
- Do NOT use the name "Zain" (Law 3)
- Do NOT put `async` on page components — they're client components
- Do NOT use `fetch()` or raw HTTP calls in pages — go through `useStore()`
- Do NOT modify `lib/store.tsx` without listing every consumer first
- Do NOT add a second accent color — Apple Blue is the only one
- Do NOT add gradients or decorative shadows — the design is intentionally flat
- Do NOT run `npm run build` while `npm run dev` is running — causes `.next` cache corruption (see `memory/feedback_next_cache_corruption_recovery.md`). Stop dev first, build, then restart dev. If UI breaks right after a build, recovery = `pkill -f "next dev" && rm -rf .next && npm run dev`.
- Do NOT write a filter predicate that calls `.toLowerCase()` / `.includes()` / `.trim()` on a DB-sourced string without `?? ""`. Most string columns in this repo are nullable in DB; a single null crashes the `useMemo` and React silently returns `[]` — "0 results" with no visible error. See `memory/feedback_filter_predicate_null_safety.md` and the /enrollments 2026-04-20 incident.
- Do NOT create additional root-level directories for services — only `backend/` and `supabase/` exist alongside the Next.js app
- Do NOT import from `backend/` in frontend code or vice versa — they communicate via HTTP only
- Do NOT filter cross-entity lists (Product log, Teacher drill-down, /students/[id]) by `teacher_user_name` / `student_user_name` or any denormalised string. Always join by `teacher_user_id` / `student_user_id` — the stable FK. See `memory/feedback_join_by_stable_fk.md` for the 2026-04-19 incident that motivated this.
- Do NOT resolve teacher name ↔ tid from the `TEACHERS` array in `lib/types.ts` — it's deprecated. Use `useStore().approvedTeachers` (DB-backed, status='approved' only) and the `teacherFullName()` helper from `lib/teacher-transforms.ts`. The TEACHERS array remains in-file purely for legacy reference until a cleanup PR removes it; any new code reading from it is a bug. See `memory/project_hr_pipeline.md`.
- Do NOT mutate `teacher_profiles.tid` / `status` / `approved_*` / `rejected_*` directly from the frontend. The only sanctioned paths are the `finalize_teacher_decision` RPC (hr/manager only) and the invariant trigger enforces `status='approved' ⇔ tid IS NOT NULL`. `update_teacher_profile` RPC (used by the Edit button on `/teachers/[id]`) silently drops those keys from the payload — don't rely on that drop as a validation signal.
- Do NOT use `flex: 1` on score scales or pill button rows inside side drawers or narrow cards. It stretches buttons to container width, producing giant rectangles (2026-04-20 HR rubric bug). Use fixed-size buttons (≈34×30 for score scales, ≈52px min-width for yes/no pills). Canonical source: `components/hr-interview-drawer.tsx` → `ScoreScale`. See `memory/feedback_drawer_button_flex_overflow.md`.
- Do NOT name PL/pgSQL RPC parameters the same as the columns they write to. `SET teaching_matrix = teaching_matrix` with both as a param + column is ambiguous and Postgres rejects it. Prefix every RPC parameter with `p_*` (`p_id`, `p_teaching_matrix`, etc.). Renaming a param requires `DROP FUNCTION … ; CREATE FUNCTION …` — plan ahead. See `memory/feedback_plpgsql_param_name_collision.md`.
- Do NOT have an RPC enqueue a `queued` row in `task_queue` when a backend router will also try to start a task for the same action. The backend's idempotency check will see the RPC's row and 409 forever. The backend owns task_queue lifecycle; the RPC stops at writing user-facing state. See `memory/feedback_never_pre_enqueue_task_queue_in_rpc.md`.
- Do NOT create a new public table expecting live UI updates without adding it to `supabase_realtime` publication in the same migration. Logical replication silently drops unpublished tables; `postgres_changes` subscriptions return zero events. See `memory/feedback_realtime_publication_check.md`.
- Do NOT call `supabase.from("demos" | "sessions").delete()` directly from a page. Use `confirmDeleteDemo(demo, { onAfterDelete? })` or `confirmDeleteSession(id, label, { onAfterDelete? })` from `useStore()`. The helpers wrap the confirm modal + activity log + toast + cascade semantics in one place; bypassing them drifts the copy, skips the audit trail, and (for demos) bypasses the `setDemos` diff-writer that handles POUR/draft/accountability/task_queue cascade. Manager-only gate (`user?.role === "manager"`) stays at every call site — helper trusts the caller.
- Do NOT call `supabase.from("teacher_reviews").insert/.update/.delete` directly from a page. Use `addTeacherReview(payload)` and `confirmDeleteTeacherReview(id, label, { onAfterDelete? })` from `useStore()`. All writes go through SECURITY DEFINER RPCs (`add_teacher_review`, `delete_teacher_review`) that enforce the role gate (insert: analyst/manager/hr; delete: manager-only) — bypassing them either fails RLS (no INSERT/UPDATE/DELETE policy on the table) or drifts validation. For enrollment lookup on Student + Excellence reviews, use `lookupEnrollmentForReview(id)` — it calls the `lookup_enrollment_for_review` RPC which also returns the 5 most recent sessions for context. See migration `20260427000100_create_teacher_reviews.sql` and `memory/project_teacher_reviews.md`.

## When In Doubt

- **Business rules or pipeline logic** → CONTEXT.md
- **Colors / spacing / typography** → DESIGN.md
- **Past bugs or architectural decisions** → MEMORY.md
- **Auth, RLS, environment variables** → MEMORY.md (Security section)
- **Phase 3 AI agent prompts** → CONTEXT.md (AI Agent Prompts section)
- **Setup or deploy** → README.md
- **Adding a filter panel (dropdowns / ID searches / date ranges) to any list page** → `ui-qa-demo-to-conversion` skill, Section 9 "Filter UIs — the recipe that passes first-review". Canonical example: `app/enrollments/page.tsx`.
- **Building a new page, drawer, tab strip, score scale, or rubric card** → `DESIGN.md` §Layout Templates. Copy the snippet; don't improvise layout. Canonical sources: `app/hr/page.tsx` (page), `components/hr-interview-drawer.tsx` (drawer + tabs + ScoreScale + RubricQuestion + collapsible Note).
- Run the Four Laws check after every file edit
- Run `npm run build` before committing (but not while `npm run dev` is running)
