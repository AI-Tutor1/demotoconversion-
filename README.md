# Demo to Conversion — AI Virtual Workforce Platform

A Next.js 15 frontend for tracking, evaluating, and converting tutoring demo sessions into enrollments. Built with the Apple design system.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
├── app/
│   ├── globals.css          # Apple design system CSS
│   ├── layout.tsx           # Root layout + StoreProvider + Nav
│   ├── page.tsx             # Dashboard (KPIs, recent demos, activity)
│   ├── analyst/page.tsx     # Analyst review form (Steps 1–5)
│   ├── sales/page.tsx       # Sales queue + detail panel + Step 10
│   ├── kanban/page.tsx      # Drag-and-drop Kanban board
│   ├── analytics/page.tsx   # Charts (funnel, trends, POUR, aging, demand)
│   └── teachers/page.tsx    # Teacher performance + drill-down
├── components/
│   ├── nav.tsx              # Glass navigation + search + notifications
│   ├── ui.tsx               # StatusBadge, Field, Stars, EmptyState, ConfirmModal
│   └── toast-confirm.tsx    # Toast + confirmation modal wrapper
├── lib/
│   ├── types.ts             # TypeScript types, design tokens, lookups
│   ├── utils.ts             # Helper functions
│   ├── data.ts              # 12 seed demos
│   └── store.tsx            # React Context global state
└── reference/
    └── DemoToConversion_V4.jsx  # Complete single-file artifact (reference)
```

## Tech stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Charts**: Recharts
- **State**: React Context (lib/store.tsx)
- **Styling**: CSS classes + inline styles (Apple design tokens)
- **Database**: Supabase (Phase 2 — currently uses in-memory seed data)

## Views

| Route | Description |
|-------|-------------|
| `/` | Dashboard with 6 KPIs, recent demos, activity feed |
| `/analyst` | Demo review form with POUR descriptions, validation, star ratings |
| `/sales` | Sales queue with filters, bulk actions, Step 10 accountability |
| `/kanban` | 5-column board with drag-and-drop status updates |
| `/analytics` | Conversion funnel, trends, POUR breakdown, aging, subject demand, agent leaderboard |
| `/teachers` | Teacher cards with sort + drill-down (per-demo chart, POUR distribution, history table) |

## Features from CTO audit (42/42 fixed)

- All analytics computed from live demo state (no hardcoded data)
- Kanban derived from demos with proper workflow state logic
- Step 10 accountability with auto-suggestion (Sales/Product/Consumer)
- POUR description fields per flagged issue
- Global date range filter (All time / 7d / 30d / 90d)
- Conversion funnel chart
- Pending aging histogram
- Subject demand chart
- Reactive activity log
- CSV export respects current view filters
- Agent filter in Sales
- Sort controls on Sales and Teachers
- Form validation with per-field error states
- Confirmation dialogs for destructive actions
- Outside-click dismiss for notification dropdown
- ESC key closes search overlay
- Select-all checkbox for bulk actions
- Star rating keyboard accessibility (arrow keys, Enter, Space)
- Responsive grids (auto-fit/minmax)
- Empty state components

## Next steps (Phase 2)

1. Connect to Supabase (replace seed data with real database)
2. Add Supabase Auth (login, role-based access)
3. Add realtime subscriptions (live queue updates)
4. Connect Python AI backend (agent orchestration)

See `Platform_Architecture_V2.docx` for the complete technical specification.
