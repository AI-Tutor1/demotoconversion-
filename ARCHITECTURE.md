# ARCHITECTURE.md — Technical Decisions & System Design

## System Layers

```
┌─────────────────────────────────────────┐
│  Human Interface: Next.js 15 (this repo) │  ← You are here
│  TypeScript · React 19 · Recharts        │
├─────────────────────────────────────────┤
│  Data Layer: Supabase (Phase 2)          │
│  PostgreSQL · Auth · Realtime · Storage  │
├─────────────────────────────────────────┤
│  AI Backbone: Python (Phase 3)           │
│  FastAPI · LangGraph · Celery · Redis    │
├─────────────────────────────────────────┤
│  LLM Providers (Phase 3)                 │
│  Claude API · Whisper · pgvector         │
└─────────────────────────────────────────┘
```

**Boundary rule:** The Next.js frontend reads and writes data. It does NOT do AI reasoning. The Python backend does AI reasoning. It does NOT serve HTML. Supabase is the shared data layer both talk to.

## Current State (Phase 1)

- All data is in-memory via React Context (`lib/store.tsx`)
- No authentication — all views are accessible
- No API calls — no fetch, no Supabase client
- State resets on page refresh
- 12 seed demos simulate realistic data distribution

## Phase 2 Migration Plan (Supabase)

When connecting to Supabase, change these files only:

### 1. Add Supabase client
Create `lib/supabase.ts`:
```tsx
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### 2. Update store.tsx
Replace seed data initialization with Supabase query:
```tsx
useEffect(() => {
  supabase.from('demos').select('*').order('date', { ascending: false })
    .then(({ data }) => setDemos(data || []));
}, []);
```

### 3. Update mutations
Replace `setDemos(prev => ...)` with Supabase mutations + optimistic updates:
```tsx
const submitDemo = async (demo: Partial<Demo>) => {
  setDemos(prev => [{ ...demo, id: Date.now() } as Demo, ...prev]); // Optimistic
  const { error } = await supabase.from('demos').insert(demo);
  if (error) { flash("Save failed"); /* revert */ }
};
```

### 4. Add Realtime
Subscribe to changes so multiple users see updates:
```tsx
useEffect(() => {
  const channel = supabase.channel('demos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'demos' },
      (payload) => { /* update local state */ }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

### 5. Add Auth
Wrap layout with Supabase Auth:
```tsx
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect('/login');
```

**Critical: These changes affect only `lib/store.tsx`, `lib/supabase.ts`, and `app/layout.tsx`. No page components change.**

## Database Schema (Phase 2)

### Table: demos
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | Auto-increment |
| date | DATE | Demo session date |
| teacher_id | INT FK → teachers | |
| student_name | TEXT | |
| level | TEXT | |
| subject | TEXT | |
| review | TEXT | Qualitative review |
| student_rating_raw | INT | Out of 10 |
| student_rating_5 | INT | Generated: ROUND(raw/2) |
| analyst_rating | INT | Out of 5 |
| status | TEXT | CHECK IN (Pending, Converted, Not Converted) |
| suggestions | TEXT | |
| accountability_type | TEXT | NULL unless Not Converted |
| sales_agent_id | INT FK → users | |
| analyst_id | INT FK → users | |
| comments | TEXT | Sales comments |
| verbatim | TEXT | Student verbatim |
| link | TEXT | Reference URL |
| is_marketing | BOOLEAN | Default FALSE |
| created_at | TIMESTAMPTZ | Default NOW() |
| updated_at | TIMESTAMPTZ | Auto-update trigger |

### Table: pour_issues
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| demo_id | INT FK → demos | ON DELETE CASCADE |
| category | TEXT | CHECK IN (Video, Interaction, ...) |
| description | TEXT | What specifically happened |

### Table: users (Phase 2)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Supabase Auth UID |
| email | TEXT UNIQUE | |
| full_name | TEXT | |
| role | TEXT | analyst, sales_agent, manager |
| max_capacity | INT | Default 15 |
| is_active | BOOLEAN | Default TRUE |

## Performance Boundaries

| Metric | Current | Phase 2 target | Notes |
|--------|---------|----------------|-------|
| Demo count | 12 (seed) | 1,000+ | Pagination needed at 100+ |
| Page load | Instant (in-memory) | < 500ms (SSR) | Use Server Components |
| Chart render | < 100ms | < 200ms | Recharts handles 1000 points well |
| Realtime updates | N/A | < 50ms | Supabase WebSocket |
| Search | Client-side filter | Full-text search | Supabase pg_trgm extension |

## Security Model (Phase 2)

### Row-Level Security Policies
```sql
-- Analysts see only their assigned demos
CREATE POLICY analyst_demos ON demos
  FOR SELECT USING (analyst_id = auth.uid() OR auth.role() = 'manager');

-- Sales agents see only their assigned demos
CREATE POLICY agent_demos ON demos
  FOR SELECT USING (sales_agent_id = auth.uid() OR auth.role() = 'manager');

-- Only assigned analyst can update review fields
CREATE POLICY analyst_update ON demos
  FOR UPDATE USING (analyst_id = auth.uid())
  WITH CHECK (analyst_id = auth.uid());

-- Atomic claim: analyst_id must be NULL to claim
CREATE POLICY claim_demo ON demos
  FOR UPDATE USING (analyst_id IS NULL)
  WITH CHECK (analyst_id = auth.uid());
```

## Dependency Policy

### Approved Dependencies
- `next` — framework
- `react` / `react-dom` — UI
- `recharts` — charts
- `@supabase/supabase-js` — database (Phase 2)
- `typescript` — types

### Do NOT Add
- State managers (Zustand, Redux, Jotai) — Context is sufficient
- CSS frameworks (Tailwind, styled-components) — project uses inline + globals
- Component libraries (MUI, Ant Design, Chakra) — project has its own Apple design system
- Animation libraries (Framer Motion, GSAP) — CSS animations are sufficient
- Date libraries (date-fns, dayjs, moment) — built-in Date + custom formatMonth is sufficient
- Form libraries (React Hook Form, Formik) — custom validation is sufficient for current scope
