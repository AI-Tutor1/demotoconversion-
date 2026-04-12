# CLAUDE.md — Project Instructions for Claude Code

## Identity

You are working on the **Demo to Conversion Platform**, a module within an AI Virtual Workforce Platform for a tutoring company based in Karachi, Pakistan. This is a Next.js 15 frontend that tracks demo tutoring sessions through an 11-step pipeline from recording to teacher review.

## Critical Rules — Read Before Every Change

### The returnReact Bug
The artifact/JSX transpiler converts `return(` (no space) into `returnReact.createElement(...)` which crashes the app. **Every `return` statement MUST have a space before the parenthesis:**
```tsx
// CORRECT
return (
  <div>...</div>
);

// FATAL — will crash the entire app
return(<div>...</div>);
```
This applies everywhere: components, map callbacks, ternaries. After every file change, grep for `return(` with no space and fix any matches.

### Agent Naming
The third sales agent is **Muhammad**. Never use "Zain." This was a data correction applied across the entire codebase. If you see "Zain" anywhere, replace it with "Muhammad."

### No Hardcoded Analytics
Every number displayed in a chart, KPI card, leaderboard, or summary MUST be computed from the `demos` state array via `useMemo`. Never use static arrays like `const MONTHLY = [{...}]` for chart data. The analytics view and dashboard must always show the same numbers for the same data. If you add a new chart, derive its data from `rangedDemos` (the date-filtered demo array from the store).

### Bracket Balance
After creating or editing any `.tsx` file, verify bracket balance. An unmatched `{`, `(`, or `[` will silently break the build. Count them:
```bash
node -e "const c=require('fs').readFileSync('FILE.tsx','utf8');let b=0,p=0,k=0;for(const x of c){if(x==='{')b++;if(x==='}')b--;if(x==='(')p++;if(x===')')p--;if(x==='[')k++;if(x===']')k--;}console.log('{}:',b,'():',p,'[]:',k);if(b||p||k)process.exit(1);"
```

## Project Structure

```
nextjs-project/
├── app/                          # Next.js App Router pages
│   ├── globals.css               # ALL CSS — Apple design system
│   ├── layout.tsx                # Root layout: StoreProvider + Nav
│   ├── page.tsx                  # Dashboard (KPIs, recent, activity)
│   ├── analyst/page.tsx          # Analyst review form (Steps 1-5)
│   ├── sales/page.tsx            # Sales queue + detail + Step 10
│   ├── kanban/page.tsx           # Drag-drop Kanban board
│   ├── analytics/page.tsx        # All charts (computed from live data)
│   └── teachers/page.tsx         # Teacher performance + drill-down
├── components/
│   ├── nav.tsx                   # Glass nav, search, notifications
│   ├── ui.tsx                    # Shared: Badge, Field, Stars, Empty, Modal
│   └── toast-confirm.tsx         # Toast + confirmation modal wrapper
├── lib/
│   ├── types.ts                  # Types, design tokens, lookup arrays
│   ├── utils.ts                  # Helper functions
│   ├── data.ts                   # 12 seed demos
│   └── store.tsx                 # React Context global state
├── reference/
│   └── DemoToConversion_V4.jsx   # Working artifact (single-file reference)
├── .gitignore                    # Git exclusions (node_modules, .next, .env)
├── .env.example                  # Environment variable template
├── .eslintrc.json                # ESLint configuration
├── CLAUDE.md                     # THIS FILE — master instructions
├── CONTEXT.md                    # Business domain and pipeline logic
├── MEMORY.md                     # Decisions, learnings, pitfalls
├── TOOLS.md                      # Commands, scripts, verification
├── CONVENTIONS.md                # Code style and patterns
├── ARCHITECTURE.md               # Technical decisions and rationale
├── DESIGN.md                     # Apple design system tokens and specs
├── SECURITY.md                   # Auth, RLS policies, data access
├── PROMPTS.md                    # AI agent system prompts (Phase 3)
└── TESTING.md                    # Verification checklist
```

## File Roles — Quick Reference

| File | What it does | When to read it |
|------|-------------|-----------------|
| `CLAUDE.md` | Master rules, structure, patterns | Always — read first |
| `CONTEXT.md` | Business logic, pipeline steps, POUR taxonomy | When implementing business rules |
| `MEMORY.md` | Past bugs, decisions, rejected approaches | Before making architectural choices |
| `TOOLS.md` | Verification commands, scripts | After every file change |
| `CONVENTIONS.md` | Naming, imports, style patterns | When writing new code |
| `DESIGN.md` | Colors, spacing, typography, components | When building or modifying UI |
| `ARCHITECTURE.md` | System layers, Phase 2 migration, schema | When planning features |
| `SECURITY.md` | Auth, RLS, environment variables, PII | When adding auth or data access |
| `PROMPTS.md` | AI agent system prompts | When implementing Phase 3 agents |
| `TESTING.md` | Verification checklist, data integrity tests | Before committing |
| `lib/types.ts` | All TypeScript types and lookup data | When using any data type |
| `lib/store.tsx` | Global state, computed values | When reading or writing state |
| `lib/utils.ts` | Helper functions | When formatting or computing |
| `lib/data.ts` | Seed demo data | When testing data-dependent features |
| `components/ui.tsx` | Shared UI components | When building any view |
| `components/nav.tsx` | Navigation bar | Never modify without understanding layout.tsx |
| `app/globals.css` | All CSS classes | When adding new CSS |
| `reference/DemoToConversion_V4.jsx` | Complete working prototype | When unsure how a feature should work |

## How State Works

All shared state lives in `lib/store.tsx` (React Context). Every page accesses it via `useStore()`:

```tsx
const { demos, setDemos, rangedDemos, stats, flash, logActivity, setConfirm, dateRange } = useStore();
```

Key state values:
- `demos` — full array of all Demo objects (source of truth)
- `setDemos` — setter for demos (use functional update: `setDemos(prev => [...])`)
- `rangedDemos` — demos filtered by the global date range selector
- `stats` — computed object: `{ total, converted, pending, notConv, rate, avgR, pourRate }`
- `flash(msg)` — shows a toast notification for 3.5 seconds
- `logActivity(action, user, target)` — adds entry to the reactive activity feed
- `setConfirm({title, msg, onConfirm})` — shows confirmation modal before destructive actions
- `notifications` — computed array of pending demos aged 3+ days
- `dateRange` / `setDateRange` — global time filter ("all", "7d", "30d", "90d")

### Adding a new demo:
```tsx
setDemos(prev => [{
  id: Date.now(),
  date: "2026-04-12",
  teacher: "Shoaib Ghani",
  tid: 62,
  student: "New Student",
  level: "IGCSE",
  subject: "Mathematics",
  pour: [],
  review: "",
  studentRaw: 7,
  analystRating: 0,
  status: "Pending",
  suggestions: "",
  agent: "",
  comments: "",
  verbatim: "",
  acctType: "",
  link: "",
  marketing: false,
  ts: Date.now(),
}, ...prev]);
```

### Updating a demo:
```tsx
setDemos(prev => prev.map(d => d.id === targetId ? { ...d, status: "Converted", agent: "Maryam" } : d));
```

## Design System

This project uses the **Apple design system** with these tokens (defined in `lib/types.ts`):

| Token | Value | Usage |
|-------|-------|-------|
| `BLUE` | `#0071e3` | Primary accent, links, active states |
| `NEAR_BLACK` | `#1d1d1f` | Body text |
| `LIGHT_GRAY` | `#f5f5f7` | Section backgrounds |
| `MUTED` | `#86868b` | Secondary text, labels |
| `CARD_DARK` | `#1c1c1e` | Dark card backgrounds |

### CSS Classes (defined in `app/globals.css`):
- `.apple-input` — form input with focus ring
- `.apple-input.error` — red border for validation
- `.apple-select` — dropdown with chevron
- `.apple-textarea` — multiline input
- `.apple-checkbox` — custom checkbox
- `.pill` — rounded button base
- `.pill-blue` — primary action
- `.pill-outline` — secondary action
- `.pill-white` — on dark backgrounds
- `.demo-card` / `.demo-card.selected` — queue items
- `.chart-card` — chart container
- `.kanban-card` — draggable board card
- `.pour-tag` — orange POUR category tag
- `.section-label` — uppercase muted label
- `.filter-select-dark` — filter on dark bg
- `.filter-select-light` — filter on light bg
- `.nav-bar` / `.nav-link` / `.nav-link.active` — navigation
- `.toast` — notification toast
- `.animate-fade-up` / `-1` / `-2` / `-3` — entrance animations
- `.animate-slide-in` — slide-in animation

### Styling Approach
The project uses a **hybrid** of CSS classes and inline styles. CSS classes handle reusable patterns (inputs, buttons, cards). Inline styles handle layout (grid, flex, spacing, colors). Do NOT convert inline styles to Tailwind — the project does not use Tailwind.

### When creating new UI:
1. Use existing CSS classes from `globals.css` for inputs, buttons, cards
2. Use inline styles for layout and spacing
3. Import design tokens from `lib/types.ts`
4. Use the shared components from `components/ui.tsx`
5. Match the Apple aesthetic: clean whites, LIGHT_GRAY sections, rounded corners (10-16px), subtle borders (#e8e8ed)

## Component Reference

### From `components/ui.tsx`:
```tsx
import { StatusBadge, Field, Stars, EmptyState, ConfirmModal, SectionHeader } from "@/components/ui";

<StatusBadge status="Pending" />                    // Status pill
<Field label="Name *" error={errors.name}>           // Form field wrapper
  <input className="apple-input" />
</Field>
<Stars value={4} onChange={setRating} />              // Interactive
<Stars value={4} readOnly onChange={() => {}} />      // Display only
<EmptyState text="No demos match filters" />          // Empty state
<SectionHeader num="01" title="Info" subtitle="...">  // Section header
  {children}
</SectionHeader>
```

### From `components/nav.tsx`:
Navigation is rendered once in `app/layout.tsx`. Never render it inside pages.

## Page Patterns

Every page is a `"use client"` component in `app/[route]/page.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { LIGHT_GRAY, MUTED, BLUE } from "@/lib/types";

export default function MyPage() {
  const { rangedDemos, setDemos, flash } = useStore();

  return (
    <>
      {/* Hero/header section */}
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Category</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Page title.</h1>
        </div>
      </section>

      {/* Content section */}
      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        {/* Content here */}
      </section>
    </>
  );
}
```

Note: `paddingTop: 92` accounts for the sticky nav bar (48px) + visual spacing.

## Data Model

Every demo has this shape (defined in `lib/types.ts` as `Demo`):

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique identifier |
| `date` | `string` | ISO date "YYYY-MM-DD" |
| `teacher` | `string` | Teacher full name |
| `tid` | `number` | Teacher user ID |
| `student` | `string` | Student full name |
| `level` | `string` | Academic level (IGCSE, A Level, etc.) |
| `subject` | `string` | Subject taught |
| `pour` | `PourIssue[]` | Array of `{cat, desc}` |
| `review` | `string` | Qualitative review text |
| `studentRaw` | `number` | Student rating out of 10 |
| `analystRating` | `number` | Analyst rating out of 5 |
| `status` | `"Pending" \| "Converted" \| "Not Converted"` | Current status |
| `suggestions` | `string` | Improvement suggestions |
| `agent` | `string` | Assigned sales agent name |
| `comments` | `string` | Sales comments |
| `verbatim` | `string` | Student feedback verbatim |
| `acctType` | `string` | Accountability: "Sales", "Product", or "Consumer" |
| `link` | `string` | Reference URL |
| `marketing` | `boolean` | Is this a marketing lead |
| `ts` | `number` | Timestamp (Date.now()) |

## Lookup Data

All lookup arrays are in `lib/types.ts`:
- `TEACHERS` — 8 teachers with id, name, uid
- `LEVELS` — 13 academic levels
- `SUBJECTS` — 12 subjects
- `POUR_CATS` — 7 issue categories
- `AGENTS` — 3 sales agents: Maryam, Hoor, Muhammad
- `ACCT_TYPES` — 3 accountability types: Sales, Product, Consumer

## Do Not

- Do NOT use Tailwind classes — this project uses CSS + inline styles
- Do NOT create separate CSS files per component — all CSS goes in `globals.css`
- Do NOT use `localStorage` or `sessionStorage` — state is in React Context
- Do NOT render the Nav component inside pages — it's in layout.tsx
- Do NOT use `"use server"` — there is no backend yet (Phase 2)
- Do NOT add new npm dependencies without explicit instruction
- Do NOT hardcode chart data — compute from `rangedDemos` via `useMemo`
- Do NOT use `return(` without a space — see the returnReact bug above
- Do NOT use the name "Zain" anywhere — the agent is "Muhammad"
- Do NOT put `async` on page components — they are client components
- Do NOT use `fetch()` or API calls — data comes from the Context store
- Do NOT modify `lib/store.tsx` without understanding all consumers

## When In Doubt

- Check `reference/DemoToConversion_V4.jsx` for the working implementation
- Check `CONTEXT.md` for business rules and pipeline logic
- Check `MEMORY.md` for past decisions and known pitfalls
- Check `DESIGN.md` for colors, spacing, typography, and component specs
- Check `SECURITY.md` for auth, RLS, and data access patterns
- Check `PROMPTS.md` for AI agent system prompt templates
- Check `CONVENTIONS.md` for code style patterns
- Run the bracket balance check after every file edit
- Run the full verification script from `TOOLS.md` before committing
- Grep for `return(` without space after every file edit
- Grep for `Zain` after every file edit
