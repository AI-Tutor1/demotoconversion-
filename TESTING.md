# TESTING.md — Verification Checklist

## Pre-Commit Checklist

Run this checklist before every commit. Every item must pass.

### Automated Checks (run in terminal)
```bash
# 1. Build succeeds (catches TypeScript errors)
npm run build

# 2. No bracket imbalance
for f in app/page.tsx app/*/page.tsx components/*.tsx lib/*.tsx lib/*.ts; do
  node -e "const c=require('fs').readFileSync('$f','utf8');let b=0,p=0,k=0;for(const x of c){if(x==='{')b++;if(x==='}')b--;if(x==='(')p++;if(x===')')p--;if(x==='[')k++;if(x===']')k--;}if(b||p||k){console.log('FAIL: $f',b,p,k);process.exit(1);}else console.log('PASS: $f');"
done

# 3. No returnReact bug
grep -rn 'return(' app/ components/ lib/ --include='*.tsx' | grep -v 'return (' | grep -v '//' | grep -v 'returnType' && echo "FAIL: returnReact bug found" || echo "PASS"

# 4. No "Zain" references
grep -rn 'Zain' app/ components/ lib/ --include='*.tsx' --include='*.ts' && echo "FAIL" || echo "PASS"

# 5. No hardcoded chart data
grep -rn 'const MONTHLY\b\|const ACCT_DATA\b' app/ --include='*.tsx' && echo "FAIL" || echo "PASS"

# 6. All pages have "use client"
for f in app/page.tsx app/*/page.tsx; do head -1 "$f" | grep -q '"use client"' || echo "MISSING: $f"; done

# 7. All pages have default export
for f in app/page.tsx app/*/page.tsx; do grep -q 'export default' "$f" || echo "MISSING: $f"; done
```

### Manual Verification (check in browser)

#### Dashboard (`/`)
- [ ] All 6 KPI cards show numbers that match the demo count
- [ ] Changing date range filter updates KPI numbers
- [ ] Recent demos list shows correct status badges
- [ ] Activity feed shows recent entries
- [ ] "New demo review" button navigates to `/analyst`
- [ ] "Kanban board" button navigates to `/kanban`

#### Analyst Form (`/analyst`)
- [ ] Submitting with empty required fields shows red borders and error messages
- [ ] Teacher dropdown shows all 8 teachers with UIDs
- [ ] Checking a POUR category reveals the description input
- [ ] Unchecking a POUR category hides the description input
- [ ] Star rating responds to click and keyboard (arrow keys, Enter)
- [ ] Month badge shows derived month from date picker
- [ ] Student rating slider shows /10 → /5 conversion
- [ ] "Reset" button clears all fields and errors
- [ ] "Submit" creates a new demo and shows a toast
- [ ] After submit, the new demo appears on Dashboard and in Sales queue

#### Sales View (`/sales`)
- [ ] Status filter tabs (All/Pending/Converted/Not Converted) filter correctly
- [ ] Teacher, Agent, and Sort dropdowns filter/sort correctly
- [ ] "Clear all" button resets all filters
- [ ] "Export filtered CSV" exports only the currently visible demos
- [ ] Select-all checkbox toggles all visible demos
- [ ] Bulk action buttons show confirmation modal before executing
- [ ] Clicking a demo card opens the detail panel
- [ ] Detail panel shows analyst review, POUR issues with descriptions, ratings
- [ ] "Not Converted" status reveals Step 10 accountability section
- [ ] Accountability auto-suggestion matches the logic in CONTEXT.md
- [ ] "Update demo" button shows confirmation modal
- [ ] After update, status badge changes, toast appears, KPIs update

#### Kanban Board (`/kanban`)
- [ ] Cards appear in correct columns based on workflow state (not age)
- [ ] Dragging a card to a new column shows visual drop target
- [ ] Dropping to Converted or Not Converted shows confirmation modal
- [ ] After drop, card moves to new column
- [ ] Kanban reflects new demos added via Analyst form
- [ ] Age badges show correct day count
- [ ] POUR tags and star ratings display correctly on cards

#### Analytics (`/analytics`)
- [ ] Conversion funnel shows correct stage counts
- [ ] Monthly trend chart has data points matching actual demo dates
- [ ] POUR chart shows only categories that have issues (no zero-count bars)
- [ ] Accountability pie shows only types that have been assigned
- [ ] Pending aging histogram reflects actual pending demo ages
- [ ] Subject demand chart shows subjects present in demo data
- [ ] Agent leaderboard ranks by conversion rate
- [ ] All charts update when a demo is added or status changes
- [ ] All charts respond to global date range filter

#### Teachers (`/teachers`)
- [ ] Teacher cards show correct conversion rate, rating, demo count, POUR count
- [ ] Sort dropdown reorders cards correctly
- [ ] Clicking a card opens drill-down panel
- [ ] Drill-down rating chart uses actual demo dates on x-axis
- [ ] Drill-down POUR chart shows only that teacher's issues
- [ ] History table lists all demos for that teacher
- [ ] Clicking the close button dismisses the drill-down

#### Navigation (global)
- [ ] All 6 nav links navigate to correct routes
- [ ] Active link is highlighted white/bold
- [ ] Date range dropdown filters all views
- [ ] Search overlay opens on search icon click
- [ ] Search finds demos by student name, teacher, and subject
- [ ] Clicking a search result navigates to Sales with that demo selected
- [ ] ESC key closes search overlay
- [ ] Notification bell shows count badge when pending demos exist
- [ ] Notification dropdown lists pending demos aged 3+ days
- [ ] Clicking outside notification dropdown closes it
- [ ] CSV export downloads a file

## Data Integrity Tests

These verify that the app's data flow is consistent:

### Test 1: Add → Verify Everywhere
1. Go to Analyst, submit a new demo for "Test Student" with POUR issues
2. Verify it appears on Dashboard recent list
3. Verify Dashboard KPI total increments by 1
4. Verify it appears in Sales queue (under Pending)
5. Verify it appears on Kanban board (in correct column)
6. Verify Analytics charts update (total count, POUR chart, funnel)
7. Verify Teachers view shows updated stats for that teacher

### Test 2: Convert → Verify Consistency
1. In Sales, select a Pending demo and mark as Converted
2. Verify Dashboard KPI conversion rate updates
3. Verify Kanban board moves card to Converted column
4. Verify Analytics funnel Converted count increments
5. Verify Teacher conversion rate updates
6. Verify Activity feed shows the conversion entry

### Test 3: Not Convert → Verify Accountability
1. In Sales, select a Pending demo and mark as Not Converted
2. Verify Step 10 accountability section appears
3. Select an accountability type
4. Verify Analytics accountability pie chart updates
5. Verify Kanban board moves card to Not Converted column

### Test 4: Filter Isolation
1. Set date range to "7d"
2. Verify Dashboard KPIs show only last 7 days
3. Verify Sales queue shows only last 7 days
4. Verify Analytics charts reflect only last 7 days
5. Verify Teachers stats reflect only last 7 days
6. Set date range back to "All" and verify full data returns

## Performance Checks

- [ ] No page takes more than 2 seconds to render with 12 demos
- [ ] Kanban drag-and-drop has no visible lag
- [ ] Chart tooltips appear within 100ms of hover
- [ ] Search results appear as you type (no delay)
- [ ] Date range filter updates all views within 500ms
