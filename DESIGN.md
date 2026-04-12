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

### Glass Effect
```css
background: rgba(0, 0, 0, 0.85);
backdrop-filter: saturate(180%) blur(20px);
-webkit-backdrop-filter: saturate(180%) blur(20px);
```

### Nav Links
- Default: `color: rgba(255,255,255,.7); font-weight: 400; font-size: 12px`
- Hover: `color: #fff`
- Active: `color: #fff; font-weight: 600`
- Height: `line-height: 48px` (matches nav bar height)

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
```

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
