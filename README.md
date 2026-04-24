# Demo to Conversion — AI Virtual Workforce Platform

A Next.js 15 frontend + Supabase backend for tracking, evaluating, and converting tutoring demo sessions into enrollments. Built for **Tuitional Education** (Karachi) with the Apple design system.

**Status:** Phase 2 (Supabase schema + RLS + auth + realtime) and Phase 3 (FastAPI + LangGraph AI backend) both live. Deploy all three layers — migrations, backend, frontend — in lockstep.

---

## First-time Setup

Every step below must pass before you develop. The smoke gate (step 8) verifies the full stack.

```bash
# 1. Clone + install frontend deps
git clone https://github.com/AI-Tutor1/demotoconversion-.git
cd demotoconversion-
npm install

# 2. Frontend env
cp .env.example .env.local              # fill in NEXT_PUBLIC_SUPABASE_URL + anon key

# 3. Backend env + venv + deps
cp backend/.env.example backend/.env    # fill in ANTHROPIC_API_KEY + GROQ_API_KEY + SUPABASE_SERVICE_ROLE_KEY
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt

# 4. Apply migrations to Supabase (via dashboard SQL editor, supabase CLI, or MCP tool)
#    Order matters: supabase/migrations/*.sql are timestamp-prefixed.

# 5. Seed dev users — only for a fresh Supabase project
export MANAGER_PWD=... ANALYST_PWD=... SALES_PWD=...
export DATABASE_URL="postgresql://postgres:<pwd>@<host>:5432/postgres"
./scripts/seed-dev-users.sh

# 6. Install git hooks (one-time, runs smoke.sh on every push)
./scripts/install-git-hooks.sh

# 7. Start processes
source backend/.venv/bin/activate && uvicorn app.main:app --reload --port 8000 &
npm run dev  # starts Next.js on :3000

# 8. Green-light gate
./scripts/smoke.sh                       # must end with "✅ smoke passed"
```

Sign in at [http://localhost:3000/login](http://localhost:3000/login):

| Email | Role | Scope |
|-------|------|-------|
| `manager@demo.pk` | `manager` | Full access — every page, every mutation |
| `analyst@demo.pk` | `analyst` | Demos (own + unassigned), enrollments/sessions, teacher profiles (read approved, edit whitelisted fields) |
| `sales@demo.pk` | `sales_agent` | Only their assigned demos; read-only view of approved teachers |
| `hr@demo.pk` *(seed after adding via dashboard)* | `hr` | HR workspace (`/hr`) + teacher profiles (all statuses). Cannot see demos, sales, enrollments, sessions |

**⚠️ `20260412112906_seed_initial_users.sql` is gated.** It raises an exception unless called with `app.allow_dev_seed = 'true'` + per-role password session settings. Only `scripts/seed-dev-users.sh` satisfies the gate. The migration file itself contains no passwords.

### Commands
```bash
npm run dev        # Next.js dev server (:3000)
npm run build      # production TypeScript check + bundle
./scripts/smoke.sh # full-stack gate (Four Laws + build + RPC manifest + backend + frontend)
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | React 19, Recharts, Apple design tokens (CSS + inline styles, no Tailwind) |
| State | React Context (`lib/store.tsx`) wired to Supabase |
| Database | Supabase (Postgres + Auth + Realtime) |
| Auth | `@supabase/ssr` (cookie-based, SSR-safe) |
| Product Review | Enrollment + Session CSV upload → AI scorecard (same 8-Q framework) → approved scorecards surface on `/teachers` Product log |
| Deployment (planned) | Vercel (frontend) + Supabase Cloud |

Dependencies are minimal: `next`, `react`, `react-dom`, `recharts`, `@supabase/supabase-js`, `@supabase/ssr`. No state manager, no component library, no date library, no CSS framework — see MEMORY.md Part 6 for rejected approaches.

## Project Structure

```
app/
  globals.css              # Apple design system CSS
  layout.tsx               # Root: StoreProvider + Nav + ToastAndConfirm
  page.tsx                 # Dashboard (KPIs, recent, activity)
  login/page.tsx           # Supabase Auth form
  analyst/page.tsx         # Review form (Steps 1–5)
  sales/page.tsx           # Sales queue + detail + Step 10
  kanban/page.tsx          # Drag-drop board (workflow_stage)
  analytics/page.tsx       # Demos | Sessions tab switcher (?tab=sessions, analyst/manager only)
  teachers/page.tsx        # Teacher performance + drill-down
components/
  nav.tsx                  # Role-filtered nav + user menu
  ui.tsx                   # StatusBadge, Field, Stars, EmptyState, SectionHeader
  toast-confirm.tsx        # Toast + confirm modal
lib/
  types.ts                 # Demo type, design tokens, lookups
  utils.ts                 # ageDays, formatMonth, inDateRange, exportCSV, etc.
  data.ts                  # SEED_ACTIVITY only (demos come from Supabase)
  store.tsx                # Supabase-backed Context (reads/writes/realtime/dedup)
  supabase.ts              # Browser client singleton
  supabase-server.ts       # Server client (cookies-based)
  transforms.ts            # DB↔App row mapping (snake_case ↔ camelCase, POUR cat↔category)
middleware.ts              # Session check + role gate + cookie refresh
supabase/migrations/       # SQL migrations (timestamp-prefixed)
```

## Views

| Route | Description |
|-------|-------------|
| `/` | Dashboard with 6 KPIs, recent demos, activity feed (role-aware empty state) |
| `/login` | Email+password sign-in |
| `/analyst` | Demo review form (Steps 1–5) with POUR descriptions, validation, submit guard |
| `/sales` | Sales queue with filters, bulk actions, Step 10 accountability, recording link |
| `/kanban` | 5-column board driven by `workflow_stage` with drag-drop + confirmation |
| `/analytics` | Two tabs (Demos \| Sessions, `?tab=sessions`). **Demos** — conversion funnel, POUR, QA scorecard, accountability, aging, subject demand, lead pipeline, agent leaderboard. **Sessions** (analyst + manager only) — interpretation bands, monthly volume + avg score, Q1–Q8 rubric ratios, POUR, subject/grade/curriculum breakdown, ingest→approved turnaround, attendance KPIs, teacher leaderboard with per-teacher drawer, reviewer leaderboard. All computed from `useStore().rangedApprovedSessions`. |
| `/teachers` | Teacher cards with sort + drill-down (analyst, manager, hr) |
| `/teachers/[id]` | Teacher profile: tabs for Profile · Rates · Schedule · Demos · Interview (hr/manager only). Edit button goes through whitelisted RPC. |
| `/hr` | HR workspace — candidate intake, interview + rubric, scorecard, rates, schedule, Approved/Pending/Rejected decision. Role-gated to hr + manager. |
| `/enrollments` | Product Review: enrollment CSV upload + filters + roster table (analyst, manager) |
| `/sessions` | Product Review: session CSV upload + AI scorecard queue + status badges (analyst, manager) |
| `/conducted` | Not-converted demos awaiting analyst accountability finalisation |
| `/admin/data-quality` | Data-quality issues ledger (manager-only) |

---

## Architecture

### System Layers

```
┌─────────────────────────────────────────┐
│  Human Interface: Next.js 15            │  ← this repo
│  TypeScript · React 19 · Recharts       │
├─────────────────────────────────────────┤
│  Data Layer: Supabase (Phase 2, done)   │
│  Postgres · Auth · Realtime · Storage   │
├─────────────────────────────────────────┤
│  AI Backbone: Python (Phase 3, live)    │
│  FastAPI · LangGraph · Groq Whisper     │
└─────────────────────────────────────────┘
```

**Boundary rule:** The Next.js frontend reads and writes data. It does NOT do AI reasoning. The Python backend (Phase 3, live at `:8000`) does AI reasoning and does NOT serve HTML. Supabase is the shared data layer both talk to. Inter-layer communication is HTTP with `Authorization: Bearer <supabase-access-token>` + ES256/JWKS verification on the backend.

### Database Schema (Phase 2 — applied)

**Core tables:**
- `users` — UUID linked to `auth.users`, role enum (analyst, sales_agent, manager), capacity
- `teachers` — static lookup (170 teachers in production; 8 seeded for dev)
- `demos` — core pipeline record with V2 multi-user fields (`analyst_id`, `sales_agent_id`, `workflow_stage`, `recording`, etc.)
- `pour_issues` — normalized from Demo.pour[] (`category` / `description`)

**Phase 3 tables (empty, ready):**
- `demo_drafts` — AI output before human approval
- `agent_configs` — manager-editable AI agent settings
- `task_queue` — AI task execution log

### RLS & Auth

All 7 tables have RLS enabled. Role checks use a `SECURITY DEFINER` helper `public.current_user_role()` to avoid infinite-recursion on the users table. See MEMORY.md Part 9 for the full RLS policy matrix and the 3 Phase-2 bugs we hit during rollout (BUG-009, 010, 011).

Auth is middleware-enforced: every request passes through `middleware.ts`, which uses `@supabase/ssr` with cookie adapters to validate the session and refresh tokens. Role-based route gates redirect to `/?denied=<prefix>`; the store reads that param and flashes a toast.

### Realtime

The store subscribes to `postgres_changes` on `demos` and `pour_issues`. Optimistic-update dedup prevents local copies from duplicating when the realtime echo arrives. Supabase RLS still applies to realtime payloads — users only receive events for rows they're allowed to read.

### Dependency Policy (do not extend without justification)

- **State managers** — React Context is sufficient for ~1000-demo scale. No Zustand/Redux.
- **CSS frameworks** — Apple design tokens don't map to Tailwind's scale. Inline + globals.css.
- **Component libraries** — Project has its own design system. No MUI/Chakra/shadcn.
- **Date libraries** — `ageDays`, `formatMonth`, `inDateRange` in `lib/utils.ts` handle every case.
- **Form libraries** — Custom validation is simpler for the ~5 required fields.
- **Chart libraries** — Recharts only. D3 conflicts with React virtual DOM; Chart.js uses canvas.

See MEMORY.md Part 6 for a deeper rationale on each rejected library.

---

## Working with Claude Code

This project is optimized for development via Claude Code (the CLI or IDE extension). Claude Code reads `CLAUDE.md` as the master instructions.

### First message (onboarding)

```
Read CLAUDE.md, MEMORY.md, CONTEXT.md, DESIGN.md in that order. After reading each, confirm with a one-line summary. Then run npm install and npm run build and report what you find. Do not write new code yet.
```

### Ongoing task template

```
Read CLAUDE.md and MEMORY.md. Then:

<task>

Follow the workflow: UNDERSTAND → LOCATE → PLAN → IMPLEMENT → VERIFY → REPORT. Before writing code, tell me which files you'll change and why. After writing code, run the Four Laws verification (see CLAUDE.md) and confirm all pass.
```

### Example tasks

- **Add a feature:** *"Add a date picker filter to /analytics for a custom start/end range. Follow DESIGN.md for input styling."*
- **Fix a bug:** *"Submitting a new demo from /analyst creates a duplicate. Check MEMORY.md BUG-004 (useState vs useMemo) and the realtime dedup in lib/store.tsx."*
- **New page:** *"Create app/admin/page.tsx — manager-only admin panel showing all users with current_load, capacity, and a link to deactivate. Use SectionHeader + the existing Apple tokens. Role-gate it in middleware."*

### Tips

1. **One task per message.** Don't ask Claude to "add auth, connect Supabase, build the admin panel" in one prompt — split into three.
2. **Reference docs explicitly.** "Follow DESIGN.md Typography section" beats "make it look nice."
3. **Name the guardrails.** "Check MEMORY.md BUG-010 about RLS recursion before changing any users-table policy."
4. **Ask for verification at the end.** "Run the Four Laws check and confirm all pass" catches 90% of errors before you see them.
5. **Start read-only for risky changes.** "Read the relevant files and tell me your plan before writing code" — review plan, then say "proceed."

---

## Roadmap

### Phase 2 — Done
- Supabase schema (12 migrations applied) + RLS + auth
- Multi-user seeded (manager / analyst / sales_agent)
- Store refactored with optimistic reads/writes, batched UPDATEs, realtime subscription
- Login page + middleware + role-based route protection
- Phase-1 UI preserved (analyst form, sales queue, kanban, analytics, teachers dashboard)

### Phase 3 — Future (Python AI backend)
- FastAPI + LangGraph orchestration on Railway
- 7 AI agents: Ingest (Whisper + Haiku), Demo Analyst (Sonnet), Router (Haiku), Sales Coach (Sonnet), Classifier (Haiku), Teacher Coach (Sonnet), Escalation (Haiku)
- Human-in-the-loop: every AI output → `demo_drafts` table → human review UI with per-field accept/edit tracking
- Agent prompts in `CONTEXT.md` AI Agent Prompts section

### Phase 4 — Advanced
- Agent configuration panel (edit prompts without code change)
- Performance metrics dashboard (analyst / sales / AI KPIs)
- pgvector semantic search across reviews
- Predictive conversion scoring (ML model trained on historical data)

**Cost estimate at scale:** $125–$365/month (Vercel + Supabase + Railway + Claude API + Whisper).

---

## License & Confidentiality

Internal to Tuitional Education. Not for redistribution.
