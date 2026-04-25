# DESIGN.md — Apple Design System Reference

This project implements an Apple-inspired design system. Every UI decision must reference this file. Do not improvise colors, spacing, or typography.

## Design Philosophy

1. **Subtraction over addition** — remove elements until only the essential remains
2. **Content is the interface** — UI chrome should be invisible; data should dominate
3. **Alternating surfaces** — sections alternate: black → light gray → white → light gray
4. **Single accent** — Apple Blue (#0071e3) is the ONLY accent color. No secondary brand colors.
5. **Negative space** — generous whitespace is not wasted space; it's structure

## Color Palette

### Core Tokens
| Token | Hex | CSS Variable | Usage |
|-------|-----|-------------|-------|
| Apple Blue | `#0071e3` | `BLUE` | Primary accent, CTAs, links, active nav |
| Near Black | `#1d1d1f` | `NEAR_BLACK` | Body text, headings |
| Light Gray | `#f5f5f7` | `LIGHT_GRAY` | Section backgrounds, input backgrounds |
| Muted | `#86868b` | `MUTED` | Secondary text, labels, captions |
| Card Dark | `#1c1c1e` | `CARD_DARK` | Dark card backgrounds (agent leaderboard) |
| Tuitional Sky | `#38b6ff` | — | Global nav bar background **only**. Brand colour for the chrome — not a component accent. Do not reuse on buttons, links, KPIs, or charts; that's still `#0071e3` per the "Apple Blue is the only accent" rule. |

### Status Colors
| Status | Background | Text | Dot |
|--------|-----------|------|-----|
| Pending | `#FFF8E1` | `#8B6914` | `#F5A623` |
| Converted | `#E8F5E9` | `#1B5E20` | `#4CAF50` |
| Not Converted | `#FFEBEE` | `#B71C1C` | `#E53935` |

### Aging Colors
| Age | Background | Text |
|-----|-----------|------|
| 0–1 days | `#E8F5E9` | `#1B5E20` |
| 2–3 days | `#FFF8E1` | `#8B6914` |
| 4+ days | `#FFEBEE` | `#B71C1C` |

### POUR Tag
- Background: `#FFF3E0`
- Text: `#B25000`

### Processing Status Colors (Sessions)
| Status | Background | Text | Notes |
|--------|-----------|------|-------|
| Pending | `#f0f0f0` | `#86868b` | Neutral gray |
| Processing | `#fff3cd` | `#856404` | Amber with pulse animation (`sessionPulse 1.5s`) |
| Scored | `#d4edda` | `#155724` | Green — ready for review |
| Approved | `#cce5ff` | `#004085` | Blue — finalized |
| Failed | `#f8d7da` | `#721c24` | Red — error state |

### Borders
- Card borders: `#e8e8ed`
- Subtle separators: `#f0f0f0`, `#f5f5f7`
- Input borders: `#d2d2d7`
- Input focus: `#0071e3` with `box-shadow: 0 0 0 3px rgba(0,113,227,.15)`
- Input error: `#E24B4A`

### Chart Colors
| Purpose | Color |
|---------|-------|
| Primary bars/areas | `#0071e3` (Apple Blue) |
| Secondary bars | `#d2d2d7` (light gray) |
| Success/Converted | `#30D158` |
| Warning | `#FF9F0A` |
| Error/Critical | `#E24B4A` |
| Purple accent | `#AF52DE` |
| Gold (rank #1) | `#FFD60A` |
| Link blue | `#2997ff` |

## Typography

### Font Stack
```css
font-family: -apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
```

### Type Scale
| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|---------------|
| Hero h1 | 48px | 600 | 1.07 | -0.28px |
| Page h1 | 40px | 600 | 1.1 | — |
| Section h2 | 24px | 600 | — | — |
| Chart title | 21px | 600 | — | — |
| Body text | 17px | 400 | 1.47 | — |
| Subtitle | 15px | 400 | 1.47 | — |
| Card label | 14px | 500 | — | — |
| Section label | 12px | 600 | — | 0.5px |
| Caption | 11px | 500 | — | — |
| Micro | 10px | 600 | — | — |
| Badge text | 12px | 500 | — | — |
| Star rating (interactive) | 22px | — | — | — |
| Star rating (display) | 13px | — | — | — |

### Section Label Pattern
Used for category labels above headings:
```tsx
<p className="section-label">Category name</p>
```
CSS: `font-size: 12px; font-weight: 600; color: #86868b; text-transform: uppercase; letter-spacing: 0.5px;`

## Spacing

### Section Padding
| Section type | Padding |
|-------------|---------|
| Hero (black bg) | `paddingTop: 104`, `paddingBottom: 64` |
| Page header (light bg) | `paddingTop: 92`, `paddingBottom: 40` |
| Content section | `padding: "40px 24px 80px"` |
| Chart section | `padding: "32px 24px"` |
| Dark footer section | `padding: "44px 24px 52px"` |

Note: `paddingTop: 92` = 48px nav height + 44px visual space.

### Container Widths
| Context | Max Width |
|---------|----------|
| Hero text | `maxWidth: 680` |
| Content | `maxWidth: 1100` |
| Kanban | `maxWidth: 1200` |
| Analyst form | `maxWidth: 640` |

### Inner Container
Always: `margin: "0 auto", padding: "0 24px"`

### Component Spacing
| Element | Gap/Margin |
|---------|-----------|
| KPI card grid | `gap: 10` |
| Chart card grid | `gap: 16` |
| Teacher card grid | `gap: 14` |
| Demo queue items | `gap: 6` |
| Kanban columns | `gap: 8` |
| Kanban cards | `gap: 5` |
| Filter row | `gap: 8` |
| Form grid | `gap: 14` |
| Card internal padding | `14px 18px` (demo), `24px` (chart), `12px 14px` (kanban) |

## Border Radius Scale

| Radius | Usage |
|--------|-------|
| `980px` | Pills, buttons, status badges (full round) |
| `50%` | Circles — avatars, dots, notification badge |
| `16px` | Chart cards, detail panels, modals, teacher cards |
| `14px` | KPI cards, kanban columns |
| `12px` | Demo cards, kanban cards, POUR label containers |
| `10px` | Input fields, dropdowns, filter selects |
| `8px` | Inner metric boxes, kanban card corners |
| `6px` | Search ESC button, month badge |
| `4px` | Checkboxes |

## Shadows

Shadows are used sparingly. The design is intentionally flat.

| Element | Shadow |
|---------|--------|
| Cards (default) | None — use border only |
| Card hover | `0 2px 12px rgba(0,0,0,.06)` |
| Kanban card hover | `0 3px 12px rgba(0,0,0,.08)` |
| KPI cards | `0 1px 3px rgba(0,0,0,.04)` |
| Modals | `0 20px 60px rgba(0,0,0,.25)` |
| Notification dropdown | `0 12px 40px rgba(0,0,0,.2)` |
| Toast | `0 4px 24px rgba(0,0,0,.2)` |
| Search overlay | `0 20px 60px rgba(0,0,0,.25)` |
| Selected card | `0 0 0 3px rgba(0,113,227,.12)` (blue ring) |
| Input focus | `0 0 0 3px rgba(0,113,227,.15)` (blue glow) |

## Navigation

### Solid Brand Bar
```css
background: #38b6ff;
```
The nav bar is the Tuitional brand chrome. Solid sky-blue (no glass / no backdrop-filter — those were the old dark-bar treatment).

### Brand Mark
- Source: `/public/tuitional-logo.svg`
- Render: `height: 28; width: 28; borderRadius: 50%` — the logo's intrinsic content is circular; the SVG ships with a white square background (the inner brand arc is itself `#38b6ff` and would vanish against the bar without it), so we crop to a circle to read as a clean brand coin rather than a white sticker.
- Position: leftmost in `.nav-inner`, `marginRight: 16` from the first nav link.

### Nav Links
- Default: `color: #1d1d1f; font-weight: 400; font-size: 12px`
- Hover: `color: #000`
- Active: `color: #1d1d1f; font-weight: 600`
- Height: `line-height: 48px` (matches nav bar height)
- Icon strokes (search, bell) are `#1d1d1f` for legibility on the sky-blue bar.
- User-initial badge: white circle (`background: #fff`) with `#1d1d1f` initial — avoids muddy two-blue stack against the bar.

## Animations

### Entrance Animations
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
```
- `.animate-fade-up` — 0ms delay
- `.animate-fade-up-1` — 80ms delay
- `.animate-fade-up-2` — 160ms delay
- `.animate-fade-up-3` — 240ms delay

Duration: `0.5s ease both`

### Slide In (for detail panels)
```css
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}
```
Duration: `0.4s ease both`

### Toast
Fades in from bottom, holds, fades out upward. Duration: `3.5s`.

### Interactive Transitions
- Card hover: `transition: all 0.2s`
- Button hover: `transition: all 0.25s`
- Input focus: `transition: border-color 0.2s, box-shadow 0.2s`
- Checkbox: `transition: all 0.15s`
- Nav link: `transition: color 0.15s`

## Layout Patterns

### Page Section Alternation
```
Black (hero) → Light Gray (KPIs) → White (content) → Light Gray (charts) → Black (leaderboard)
```

### Grid Patterns
```tsx
// Responsive cards (KPIs, teacher cards)
gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"

// Two-column form
gridTemplateColumns: "1fr 1fr"

// Master-detail (Sales queue + panel)
gridTemplateColumns: sel ? "minmax(0,380px) minmax(0,1fr)" : "1fr"

// Dashboard (content + sidebar)
gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)"

// Kanban (5 fixed columns with horizontal scroll)
gridTemplateColumns: "repeat(5, minmax(170px, 1fr))"

// Filter panel — outer (grid-level) and drill-level
gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"  // outer
gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"  // drill-nested
```

## Filter Pattern

Every list/grid page (`/enrollments`, `/sales`, `/conducted`, `/sessions`, `/teachers`) uses the same three-layer filter composition. Do not fork the layout — replicate it field-for-field so keyboard muscle memory transfers across pages.

### Three layers
1. **Primary filters** — always visible. Live in the page hero (dark or `LIGHT_GRAY`); status pills + a few high-value `SearchableSelect` dropdowns + `Sort`. Never collapse.
2. **Toolbar** — a single row in the content section: `Filters` toggle · freeform `.apple-input` search (maxWidth 320) · right-aligned count ("N items"). Always visible when the page has data.
3. **Collapsible panel** — secondary dropdowns, revealed by the toolbar toggle. Hidden by default so the page's content dominates.

### Toolbar — `Filters` toggle
Outlined Apple Blue when closed; filled Apple Blue when open. Icon is a 15px three-line-with-dots glyph (13px in drill variant). When any filter is active, a 16px bullet (●) badges the button — white-on-translucent when panel is open, white-on-BLUE when closed.

```tsx
padding: "8px 14px"; borderRadius: 10; fontSize: 14;
border: `1px solid ${BLUE}`;
background: showFilters ? BLUE : "transparent";
color:      showFilters ? "#fff" : BLUE;
```

### Panel layout
```tsx
padding: 16; borderRadius: 14; gap: 12;
display: "grid";
gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))";
alignItems: "end";
```

Every field is a stacked label-over-control:
```tsx
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: MUTED,
  textTransform: "uppercase", letterSpacing: "0.04em",
  marginBottom: 4, display: "block",
};
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column" };

<div style={FIELD}>
  <label style={LABEL}>Field name</label>
  <SearchableSelect options={toOpts(...)} buttonClassName="apple-input" width="100%" ... />
</div>
```

### Background contrast rule
The panel must visually separate from the surrounding content. Choose the opposite surface:

| Content section bg | Panel bg | Panel border |
|--------------------|----------|--------------|
| `#fff` (white) | `LIGHT_GRAY` | none |
| `LIGHT_GRAY` | `#fff` | `1px solid #e8e8ed` |

Pages using white content (`/enrollments`, `/conducted`, `/sessions`, `/teachers`) get `LIGHT_GRAY` panels. `/sales` is the inverse — its content is `LIGHT_GRAY` so its panel is white with a border.

### Clear button
Placed as the **last grid cell** of the panel, only rendered when `hasFilters === true`. Outlined blue, full width of its cell:
```tsx
background: "transparent"; color: BLUE; border: `1px solid ${BLUE}`;
padding: "10px 16px"; borderRadius: 10; fontSize: 13; fontWeight: 500;
```
`Clear filters` resets **every** filter on the page, including those rendered in the primary hero (Status pills reset to "All", Teacher/Agent dropdowns reset to ""). "Clear" means clear everything.

### Option-list derivation
Dropdown options MUST be derived from live data via `useMemo`, not from static lookup tables — so filters only offer values actually present in the current result set. Helpers used on every page:
```ts
function uniqSort(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)))
    .sort((a, b) => a.localeCompare(b));
}
function toOpts(arr: string[]) { return arr.map((v) => ({ value: v, label: v })); }
```

**Exception:** `ACCT_TYPES` unions static + live values so Sales/Product/Consumer always appear even before any Not-Converted demo has been tagged.

### Pagination + selection resets
- **Paginated pages** (`/enrollments`, `/sessions`) — reset `page` to 0 on any filter change. `/sessions` uses a dedicated `useEffect` keyed on every filter state; `/enrollments` does it inline in each `onChange`.
- **Master-detail** (`/sales`) — selection state is not cleared automatically; the detail panel continues to show a previously-selected demo even if filters would hide its card. If this ever confuses users, clear `selDemo` in a `useEffect` keyed on filters.

### Drill-level variant
The `/teachers` drill-down card uses a **nested** filter toolbar at reduced scale:
```tsx
// button
padding: "6px 12px"; borderRadius: 10; fontSize: 13;
// panel
padding: 14; borderRadius: 12; gap: 10;
gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))";
```
Drill-level state is prefixed `d*` (`dSearch`, `dSubject`, `dDateFrom`, …) to distinguish from the outer grid-level filters. A `useEffect` keyed on `[drill]` resets the drill state whenever the user drills into a different entity, so filters do not leak between profiles. The architectural rationale (one filter toolbar → all 4 child tabs) lives in [memory/reference_drill_panel_filter_flow.md](...).

### Per-page filter inventory
| Page | Primary (hero) | Secondary (collapsible panel) |
|------|----------------|-------------------------------|
| `/enrollments` | — | Teacher · Student · Subject · Grade · Board · Curriculum · Status · Admin · Enrollment ID · Teacher ID · Student ID · Date From · Date To |
| `/sales` | Status pills · Teacher · Agent · Sort | Workflow stage · Age bucket · Analyst approval · Account type · Min rating · Student · Subject · Level · Grade · POUR · Marketing · Has recording · Date From · Date To |
| `/conducted` | Status pills · Teacher · Level · Subject · Sort | Workflow stage · Age bucket · Analyst approval · Account type · Min rating · Agent · Student · Grade · POUR · Marketing · Has recording · Date From · Date To |
| `/sessions` | — (moved to panel) | Processing status · Class status · Teacher · Student · Subject · Grade · Board · Curriculum · Enrollment ID · Attended · Has recording · Has transcript · Date From · Date To |
| `/teachers` (grid) | Sort | Min demos · Conversion bucket · Min rating · Has POUR · POUR category · Subject · Level · Grade · Account type · Has product log · Has demos · Has demo of status · Marketing · Teacher ID |
| `/teachers` (drill) | — | Subject · Grade · Demo status · Session processing · POUR · Min rating · Has recording · Date From · Date To |

### Page-specific rules
- **`/teachers` "Has product log"** matches by `teacher_user_id` (stable FK) not by name. See [memory/feedback_join_by_stable_fk.md](...) — name-based matching silently returned zero rows when `teacher_user_name` drifted (whitespace, casing, nbsp).
- **`/teachers` "Has demos"** enables finding teachers that only exist in `sessions` with zero `demos` (or vice versa). See [memory/project_entities_loosely_coupled.md](...).
- **`/sessions` "Teacher" dropdown** unions `teacher_user_name` ∪ `tutor_name` (different columns, overlapping reality). Same union for Student across `student_user_name` ∪ `expectedStudent1` ∪ `expectedStudent2`.
- **`/sessions` body columns** — the three stable IDs (`enrollment_id`, `student_user_id`, `teacher_user_id`) render inline as `nowrap` muted cells immediately after `session_id`. On the detail page they appear as tiles in the hero metadata grid (after Session ID, before Grade). Missing values render `—` so rows/tiles don't collapse when the teacher-linkage trigger back-fills later.
- **`/enrollments` body columns** — `teacher_user_id` and `student_user_id` render as `nowrap` muted cells between `enrollment_id` and the Teacher name (same treatment as `/sessions`). These are the **source** for the linkage that the sessions trigger denormalises onto each `sessions` row, so showing them here lets uploaders eyeball the LMS FK before any session ingest happens.
- **`/teachers` drill option lists** (Subject, Grade, POUR) union demo-side and session-side values for the current teacher — so a subject the teacher only teaches via sessions still appears in the dropdown.

## Component Patterns

### Status Badge
Three-state pill with color dot + text. Never use raw text for status — always use the `<StatusBadge>` component.

### POUR Tag
Orange pill for issue categories. Always render from `pour.map()` — never hardcode categories.

### Age Badge
Appears on Pending demo cards when age > 1 day. Color scales with urgency (green → amber → red).

### Star Rating
Interactive (22px) for forms with keyboard support. Display-only (13px) for cards and tables.

### Empty State
Centered icon + text. Used when filters return zero results. Always include guidance text.

### Confirm Modal
Full-screen overlay with blur. Used before ALL destructive actions: status changes, bulk updates, kanban drops to terminal columns.

### SearchableSelect (`components/searchable-select.tsx`)
Click-to-open dropdown replacing native `<select>` on filter surfaces. Features:
- Type-to-filter with `.apple-input` search box
- Outside-click / ESC dismiss (same pattern as nav dropdowns)
- "Clear" row at top for resetting the filter
- Two variants: `filter-select-dark` (hero bars) / `filter-select-light` (light forms)
- `buttonClassName` override for form contexts (swaps to `.apple-input .apple-select`)
- Dropdown: white bg, `border-radius: 12px`, `box-shadow: 0 10px 32px rgba(0,0,0,.12)`, z-index 50

### SessionStatusBadge (`components/session-status-badge.tsx`)
Five-state pill badge for session processing status. Uses `.session-badge .session-badge-{status}` CSS classes. Processing state has pulse animation. See "Processing Status Colors" in Color Palette.

### CSVUpload (`components/csv-upload.tsx`)
File upload button with hidden `<input type="file">`. Shows filename after selection. Props: `label`, `onParsed(rows)`, `disabled`. Styled as `.pill .pill-blue`.

### TeacherProductLog (`components/teacher-product-log.tsx`)
Approved-sessions feed for a teacher profile (and, later, a student profile). Reuses shared helpers rather than redefining visual mapping:
- `SCORECARD_MAX`, `interpretationBadge(total)` and `scoreColor(score, max)` from [lib/scorecard.ts](lib/scorecard.ts). Do NOT redefine these per surface — all scorecard colors/labels come from one place.
- Interpretation badge bands: `≥28 Excellent`, `≥22 Good`, `≥15 Below Standard`, else `Significant Concerns`. Colors reuse the "Status Colors" tokens above.
- Row layout follows the demo-card pattern (LIGHT_GRAY bg, 12px radius, 1px border, 16px 20px padding).
- Visibility is analyst + manager only; the component short-circuits to an EmptyState for other roles.
- Clicking a row routes to `/sessions/[id]` — no inline detail duplicated.

### SessionDraftReview (`components/session-draft-review.tsx`)
8-question AI scorecard review form with per-field accept/edit/reject. Key patterns:
- Each field has three states: untouched (gray border), accepted (green `#d4edda` border, locked), edited (orange `#fff3cd` border, input unlocked)
- Score boxes use `scoreColor()` from `lib/scorecard.ts` for color-coding by ratio
- POUR issues editable via dropdown (validates against `POUR_CATS`)
- "Accept all" button for batch acceptance
- Approval bar shows acceptance percentage
- Layout: `.session-scorecard-grid` (responsive, 1-col on mobile)

### ScoreScale (`components/hr-interview-drawer.tsx` → `ScoreScale`)
Compact 1–N button scale for scoring rubric questions inline inside drawers and narrow cards. **Fixed-size buttons only** (≈34×30 px) — never `flex: 1`, or the row stretches to container width and becomes the "giant rectangles" bug (see `memory/feedback_drawer_button_flex_overflow.md`). Click the currently-selected button to clear (matches `Stars` / POUR tag toggle pattern). Anchor labels (`lowLabel` ↔ `highLabel`) render as a 10px row BELOW the scale — optional.

### Collapsible Note field (`components/hr-interview-drawer.tsx` → `RubricQuestion` note branch)
Secondary-input pattern for rubric questions. Default-collapsed behind a `+ Add note` text button in Apple Blue. Auto-opens when existing content is present on mount OR when a question's `requireNoteWhen(value)` predicate fires (e.g. red flags = Yes). Required state: red 1px border + micro-label "Required" in `#B71C1C`. Two rows default (`<textarea rows={2}>`). Use this whenever a score/choice needs optional context but you don't want the form to feel heavy by default.

### Structured rubric card (`components/hr-interview-drawer.tsx` → `RubricQuestion`)
Inline header-row layout for rubric-style forms: label on the left, answer control (ScoreScale / yes-no pills / select / textarea) on the right of the same row. Card bg `LIGHT_GRAY`, border `#e8e8ed`, radius `10px`, padding `10px 12px`. Matches the read-only scorecard-report Q-card treatment so write + read modes are visually sibling. Questions are grouped into categories; the category header uses `.section-label` (never inline styling).

### Destructive action button (delete)
Red-on-white pill for manager-only hard-delete across all surfaces. Never a solid red button (too dominant for a destructive action next to primary buttons); always `pill pill-outline` with a red text + soft red border. Two sizes only:

| Where | `fontSize` | `padding` | Label |
|-------|-----------|-----------|-------|
| Detail-page headers (`/analyst/{id}`, `/sessions/{id}`, `/sales` detail panel) | `12` | `5px 14px` | "Delete demo" / "Delete session" |
| Inline list rows (dashboard, `/conducted`, `/drafts`, `/sessions`, `/sales` queue card) | `11` (`10` for the densest cards) | `3px 10px` (`2px 8px` dense) | "Delete" |

Colors (fixed — do not substitute tokens):
- `color: "#B42318"` — red text
- `borderColor: "#FDA29B"` — soft red border
- Background inherits from `.pill .pill-outline` (white).

Behaviour contract:
- Gated on `user?.role === "manager"` at every call site. Helper trusts the caller.
- Click opens the confirm modal (via `confirmDeleteDemo` / `confirmDeleteSession` from `useStore()`); never wires to `supabase.from(...).delete()` inline.
- In any row/card that already has a click handler (drawer-open, selection-set), the button's `onClick` MUST `e.stopPropagation()`. Reuse the cell's existing stopPropagation if it has one — don't double-wrap.
- When inside a `<Link>` wrapper (e.g. `/drafts`), put the button *outside* the Link via a flex container (`<div><Link flex:1/><button/></div>`), not inside it. Inside-link buttons bubble click to the Link no matter what.

Canonical sources: [app/analyst/[id]/page.tsx:156-165](app/analyst/[id]/page.tsx#L156-L165) for the detail-page size; [app/conducted/page.tsx](app/conducted/page.tsx) "View →" cell for the inline-list size.

### CSS Classes — Product Review
| Class | Usage |
|-------|-------|
| `.review-table-wrap` | Horizontal scroll container for data tables |
| `.review-table` | Full-width collapsed table (14px font, uppercase headers) |
| `.review-table tr.clickable` | Pointer cursor + hover highlight for linked rows |
| `.session-badge` | Base badge: inline-flex, 12px font, pill radius, 500 weight |
| `.session-badge-{status}` | Status-specific bg/text colors (see Processing Status Colors) |
| `.session-scorecard-grid` | Responsive grid for scorecard questions (1-col on mobile) |
| `.filter-select-dark` | Dark-themed filter trigger (for hero bars with dark bg) |
| `.filter-select-light` | Light-themed filter trigger (for content sections) |

## Layout Templates

Copy-paste starting points for new surfaces. Every page, drawer, and tab strip in this codebase follows one of these. If you deviate, you're introducing a new pattern — expect scrutiny.

### 1. Page template (hero + content)

Every page is `"use client"` at the top. Hero on `LIGHT_GRAY`, content on `#fff`, `paddingTop: 92` to clear the sticky nav. Canonical: [app/hr/page.tsx](app/hr/page.tsx), [app/enrollments/page.tsx](app/enrollments/page.tsx).

```tsx
"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { BLUE, LIGHT_GRAY, MUTED } from "@/lib/types";

export default function MyPage() {
  const { /* state from store */ } = useStore();
  return (
    <>
      <section style={{ background: LIGHT_GRAY, paddingTop: 92, paddingBottom: 40 }}>
        <div className="animate-fade-up" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <p className="section-label">Category</p>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>Page title.</h1>
          <p style={{ color: MUTED, marginTop: 8, fontSize: 15 }}>Short subtitle.</p>
        </div>
      </section>
      <section style={{ background: "#fff", padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* content */}
        </div>
      </section>
    </>
  );
}
```

- `max-width: 1100` for single-flow content pages, `1200` for list pages with filter panels.
- Never render `<Nav />` — it lives in `app/layout.tsx`.
- Every page body uses `animate-fade-up` on the hero content wrapper.

### 2. Drawer / side-panel template

Role-safe, full-height, 720px max. Overlay click closes. Canonical: [components/hr-interview-drawer.tsx](components/hr-interview-drawer.tsx), [components/hr-candidate-form.tsx](components/hr-candidate-form.tsx), [components/accountability-drawer.tsx](components/accountability-drawer.tsx).

```tsx
<div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 100 }}>
  <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
  <div
    className="animate-slide-in"
    style={{
      position: "absolute", right: 0, top: 0, bottom: 0,
      width: "100%", maxWidth: 720, background: "#fff",
      boxShadow: "-8px 0 28px rgba(0,0,0,0.12)",
      display: "flex", flexDirection: "column",
    }}
  >
    {/* Sticky header with optional tabs */}
    <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0" }}>
      {/* title row + close × button */}
    </div>
    {/* Scrollable body */}
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      {/* body */}
    </div>
    {/* Sticky footer — optional */}
    <div style={{ padding: 16, borderTop: "1px solid #f0f0f0", display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button onClick={onClose} className="pill pill-outline">Cancel</button>
      <button onClick={submit} className="pill pill-blue">Save</button>
    </div>
  </div>
</div>
```

- `maxWidth: 720` is the standing convention. Wider drawers feel out of place; narrower (520) is fine for single-column forms (see `HrCandidateForm`).
- Close affordances: (a) overlay click, (b) `×` button in header, (c) `onSuccess`/save path. NOT ESC — no keyboard shortcut is wired globally.
- If the drawer has tabs, put them inside the header's bottom area with `marginBottom: -1` and `borderBottom: "2px solid transparent"` — see the Tabs template below.

### 3. Tabs template

Used in drawers AND in page headers. Blue-underline active state; muted secondary labels; optional chip counts. Canonical: [app/hr/page.tsx](app/hr/page.tsx) (tabs with counts), [components/hr-interview-drawer.tsx](components/hr-interview-drawer.tsx) (tabs inside drawer header), [app/teachers/[id]/page.tsx](app/teachers/[id]/page.tsx) (tabs on a page hero).

```tsx
const TABS: { key: string; label: string }[] = [
  { key: "a", label: "First" },
  { key: "b", label: "Second" },
];

<div style={{ display: "flex", gap: 4, borderBottom: "1px solid #f0f0f0", marginBottom: -1 }}>
  {TABS.map((t) => {
    const active = t.key === tab;
    return (
      <button
        key={t.key}
        onClick={() => setTab(t.key)}
        style={{
          padding: "10px 16px",
          border: "none",
          background: "none",
          borderBottom: active ? `2px solid ${BLUE}` : "2px solid transparent",
          color: active ? BLUE : MUTED,
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          cursor: "pointer",
          marginBottom: -1,
        }}
      >
        {t.label}
        {/* Optional count chip: */}
        {/* <span style={{ marginLeft: 8, fontSize: 11, background: active ? BLUE : "#e5e5e5",
              color: active ? "#fff" : MUTED, padding: "1px 8px", borderRadius: 980 }}>{count}</span> */}
      </button>
    );
  })}
</div>
```

- Tab row uses `marginBottom: -1` so its `borderBottom` sits on the parent's `borderBottom: 1px solid #f0f0f0`, producing a clean single hairline.
- `padding: 10px 16px` in pages, `padding: 8px 12px` in drawers (tighter).
- Never animate the underline — it's a `border-bottom` swap, not a transform.

### 4. List row + drawer-on-click (list page pattern)

Filter panel on top → `div` of rows (NOT a table) → row click opens detail drawer. Canonical: [app/hr/page.tsx](app/hr/page.tsx). The CSS-grid header/row alignment pattern:

```tsx
const COLS = "1fr 140px 180px 140px 80px";

{/* Header row */}
<div style={{
  display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "10px 16px",
  background: "#fafafa", fontSize: 11, fontWeight: 600, color: MUTED,
  textTransform: "uppercase", letterSpacing: "0.04em",
}}>
  <div>Name</div><div>HR#</div><div>Phone</div><div>Status</div><div>Tutor ID</div>
</div>

{/* Data rows — use <button> for keyboard + focus ring */}
{rows.map((r) => (
  <button
    key={r.id}
    onClick={() => openDrawer(r)}
    style={{
      display: "grid", gridTemplateColumns: COLS, gap: 8,
      width: "100%", padding: "12px 16px",
      background: "#fff", border: "none", borderTop: "1px solid #f5f5f7",
      textAlign: "left", cursor: "pointer", fontSize: 13,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
  >
    {/* row cells — one <div> per column */}
  </button>
))}
```

- Always `<button>` for rows (not `<div onClick>`) — gets keyboard activation + accessible name for free.
- Column widths: `1fr` for the primary field (usually name), fixed pixel widths for the rest.

### 5. Shared form controls (do not re-invent)

When building any new interactive form or drawer:

| Control | Canonical source | DESIGN.md section |
|---|---|---|
| Field wrapper (label + input + error) | `components/ui.tsx` → `Field` | Component Patterns |
| Text input / select / textarea | `.apple-input`, `.apple-select`, `.apple-textarea` | Typography + CSS classes above |
| Searchable dropdown | `components/searchable-select.tsx` | Component Patterns → SearchableSelect |
| Rating (1–5 stars) | `components/ui.tsx` → `Stars` | Component Patterns → Star Rating |
| Score scale (numeric, 1–N) | `components/hr-interview-drawer.tsx` → `ScoreScale` | ScoreScale above |
| Yes/No + clear | `components/hr-interview-drawer.tsx` → yes/no pills in `RubricQuestion` | (same file) |
| Collapsible secondary note | `components/hr-interview-drawer.tsx` → note branch in `RubricQuestion` | Collapsible Note field above |
| Primary / secondary button | `.pill .pill-blue`, `.pill .pill-outline` | (CSS classes section) |

If a new control doesn't exist here, propose it in DESIGN.md *before* implementing, not after. Three sibling controls in a PR without a prior discussion is a yellow flag.

## Anti-Patterns — Do NOT

- Do NOT use gradients anywhere
- Do NOT use more than 1 accent color (Apple Blue only)
- Do NOT use colored backgrounds for cards (white or LIGHT_GRAY only)
- Do NOT use thick borders (1px max, prefer #e8e8ed)
- Do NOT add decorative icons or illustrations
- Do NOT use hover animations beyond subtle translateY(-1px)
- Do NOT use loading spinners (use skeleton placeholders when needed)
- Do NOT put borders on both sides of a separator — use bottom-border only
- Do NOT center-align body text — left-align everything except hero titles and KPI numbers
- Do NOT use ALL CAPS except in `.section-label` elements
- Do NOT use `flex: 1` on score-scale or pill-toggle buttons inside side drawers or narrow cards. Fixed sizes only (≈34×30 for score, ≈52 min-width for yes/no pills). See ScoreScale section above + `memory/feedback_drawer_button_flex_overflow.md`.
- Do NOT ship raw AI/JSON output in a surface that a user will see. Always render through the shared rubric helpers (`Q_KEYS`, `Q_META`, `scoreColor`, `interpretationBadge` from `lib/scorecard.ts`). Raw `<pre>{JSON.stringify(draft)}</pre>` is an acceptable debug affordance only behind a `<details>` in internal-only tabs.
