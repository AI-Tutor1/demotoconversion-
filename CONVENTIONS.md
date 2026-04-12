# CONVENTIONS.md — Code Style & Patterns

## TypeScript

### Strict Mode
- `strict: true` in tsconfig — no implicit any, no unused locals
- Always type function parameters and return values for exported functions
- Use `Record<string, T>` instead of `{[key: string]: T}`
- Prefer `interface` for object shapes, `type` for unions/intersections

### Naming
- **Files**: kebab-case (`toast-confirm.tsx`, not `ToastConfirm.tsx`)
- **Components**: PascalCase (`StatusBadge`, `EmptyState`)
- **Functions**: camelCase (`ageDays`, `formatMonth`)
- **Constants**: UPPER_SNAKE for primitive constants (`BLUE`, `NEAR_BLACK`), PascalCase for arrays/objects (`TEACHERS`, `POUR_CATS`)
- **Props interfaces**: `ComponentNameProps` (e.g., `FieldProps`, `StarsProps`)
- **State variables**: descriptive camelCase (`selDemo`, `fStatus`, `bulkSel`)
- **State filter prefixes**: `f` prefix for filter state (`fStatus`, `fTeacher`, `fAgent`)
- **Setter forms**: `sf` object for sales form fields

### Types to Always Use
```tsx
// Status — never use a bare string
status: "Pending" | "Converted" | "Not Converted"

// POUR — always this shape
pour: { cat: string; desc: string }[]

// Ratings — always numbers, never strings
analystRating: number  // 0-5
studentRaw: number     // 1-10

// Timestamps — always millisecond epoch
ts: number  // Date.now()
```

## React Patterns

### State Updates
Always use functional updates when the new value depends on the old:
```tsx
// CORRECT
setDemos(prev => [...prev, newDemo]);
setDemos(prev => prev.map(d => d.id === id ? { ...d, status } : d));

// WRONG — stale closure risk
setDemos([...demos, newDemo]);
```

### Computed Values
Use `useMemo` for any value derived from state that's used in rendering:
```tsx
// CORRECT — recomputes only when dependencies change
const filtered = useMemo(() => {
  return demos.filter(d => d.status === fStatus);
}, [demos, fStatus]);

// WRONG — recomputes on every render
const filtered = demos.filter(d => d.status === fStatus);
```

### Event Handlers in Loops
When rendering lists with click handlers, capture the loop variable:
```tsx
// CORRECT — d is captured per iteration
{demos.map(d => (
  <div key={d.id} onClick={() => setSelDemo(d.id)}>
))}
```

### Conditional Rendering
```tsx
// Short-circuit for presence
{sel && <DetailPanel demo={sel} />}

// Ternary for either/or
{loading ? <Skeleton /> : <Content />}

// Never use && with numbers (0 is falsy and renders "0")
{items.length > 0 && <List />}  // CORRECT
{items.length && <List />}       // WRONG — renders "0" when empty
```

## CSS Patterns

### Section Layout
Every page follows this structure:
```tsx
<>
  {/* Dark header with title */}
  <section style={{ background: "#000" | LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
      ...
    </div>
  </section>

  {/* Light content area */}
  <section style={{ background: "#fff" | LIGHT_GRAY, padding: "40px 24px 80px" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      ...
    </div>
  </section>
</>
```

### Grid Patterns
```tsx
// Responsive auto-fit (cards, KPIs)
display: "grid",
gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
gap: 14

// Fixed two-column (form fields)
gridTemplateColumns: "1fr 1fr",
gap: 14

// Sidebar layout (queue + detail panel)
gridTemplateColumns: sel ? "minmax(0,380px) minmax(0,1fr)" : "1fr",
gap: 16
```

### Border Radius Scale
- `4px` — subtle rounding (inline tags)
- `8px` — buttons, small cards
- `10px` — input fields, dropdowns
- `12px` — demo cards, kanban cards
- `14px` — KPI cards, kanban columns
- `16px` — chart cards, detail panels, modals
- `980px` — pills (effectively full-round)
- `50%` — circles (avatars, dots)

### Color Usage
- Section backgrounds alternate: `"#000"` → `LIGHT_GRAY` → `"#fff"` → `LIGHT_GRAY`
- Never use raw hex for text — use `NEAR_BLACK` or `MUTED` from tokens
- Border color: `#e8e8ed` for cards, `#f0f0f0` / `#f5f5f7` for subtle separators
- Status colors: green `#1b8a4a` / `#E8F5E9`, amber `#8B6914` / `#FFF8E1`, red `#c13030` / `#FFEBEE`

## Import Order

```tsx
"use client";                                    // 1. Directive

import { useState, useMemo, useEffect } from "react";  // 2. React
import Link from "next/link";                           // 3. Next.js
import { useStore } from "@/lib/store";                 // 4. Local lib
import { StatusBadge, Field } from "@/components/ui";   // 5. Components
import { TEACHERS, MUTED, BLUE } from "@/lib/types";    // 6. Types/constants
import { ageDays, formatMonth } from "@/lib/utils";     // 7. Utilities
import { BarChart, Bar } from "recharts";               // 8. Third-party
```

## File Size Guidelines

| File type | Target | Max |
|-----------|--------|-----|
| Page component | 100-200 lines | 300 lines |
| Shared component | 50-100 lines | 200 lines |
| Library file | 50-100 lines | 150 lines |
| CSS file | 200-300 lines | 500 lines |

If a file exceeds its max, extract a sub-component or utility function.
