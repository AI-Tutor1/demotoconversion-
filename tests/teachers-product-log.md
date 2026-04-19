# Teachers Product Log — Manual Test Cases

**Scope:** `/teachers` drill-down → Product log tab, plus the planned `/students/[id]` surface that reuses the same `TeacherProductLog` component ([components/teacher-product-log.tsx](../components/teacher-product-log.tsx)).

**Definition of "reflected":** a session appears on /teachers Product log iff BOTH
- `sessions.processing_status = 'approved'`, AND
- `session_drafts.status IN ('approved','partially_edited')`.

This doc is a **manual checklist**, not an automated test suite. It pairs with the automated probe in [scripts/smoke.sh](../scripts/smoke.sh) (step F, "Teacher roster coverage"), which catches only one of the failure modes below.

**Related docs (authoritative):**
- Data-model invariant (teachers/students loosely coupled): `memory/project_entities_loosely_coupled.md`
- Linkage design: `memory/project_session_to_profile_linkage.md`
- Negative-test philosophy: `memory/feedback_negative_tests_for_joined_surfaces.md`
- SQL probe discipline (one statement per MCP call): `memory/reference_supabase_mcp_single_statement.md`

---

## Audit findings (as of 2026-04-19)

### What works today

- Live DB has 22 sessions across 15 distinct `teacher_user_name` values. Every name is present in the `TEACHERS` roster. Zero silent drops right now.
- Five sessions are approved across four tutors: Inayat Karim (2), Vivek Madan (1), Hira Saeed (1), Afroze Zaidi (1). All render on /teachers for analyst + manager roles.
- No whitespace corruption, no case variants, no mismatched `teacher_user_id`/`teacher_user_name` pairs in the current data.
- RLS correctly blocks sales-agent reads on `sessions` and `session_drafts`; the store short-circuits the fetch entirely for that role ([lib/store.tsx:200-204](../lib/store.tsx#L200-L204)).
- Realtime channel ([lib/store.tsx:436-458](../lib/store.tsx#L436-L458)) covers BOTH `sessions` and `session_drafts`, so any approve/revert propagates.

### Structural fragilities (the reason this checklist exists)

Each of these has produced a user-visible "teacher is missing" or "sessions not showing" complaint before, or will if the roster/data drifts:

1. **Roster silent-drop.** [app/teachers/page.tsx:48](../app/teachers/page.tsx#L48) does `if (!tid) return` when a session's `teacher_user_name` isn't in the hardcoded `TEACHERS` array ([lib/types.ts:144](../lib/types.ts#L144)). New hires, typos, case drift in CSV ingest all trigger this. **Automated probe added in smoke.sh step F.**
2. **Dedup-by-name collapse.** [app/teachers/page.tsx:42-46](../app/teachers/page.tsx#L42-L46) uses `seenNames: Set<string>` keyed by lowercased name. Two distinct tutors sharing a display name (the roster contains duplicates — see the defensive comment at [app/teachers/page.tsx:25-26](../app/teachers/page.tsx#L25-L26) noting two "Muhammad Ebraheem" at uid 768 and 396) will collapse into one card.
3. **Product log tab name-join fragility.** [components/teacher-product-log.tsx:24-26](../components/teacher-product-log.tsx#L24-L26) matches `s.teacherUserName.toLowerCase() === teacherUserName.toLowerCase()` with **no `.trim()`**. If the session row has leading/trailing whitespace, the card may synthesize (because tStats synth *does* trim) but the Product log tab inside that card will render empty.
4. **Demos/sessions name drift creates duplicate cards.** `demos.teacher` is a free-text string; `sessions.teacher_user_name` is denormalized from `enrollments.teacher_name`. If a human is "Vivek Madan" in demos but "Vivek K Madan" in enrollments, /teachers renders two cards for the same person — one with demos + empty Product log, one with zero demos + populated Product log.
5. **Trigger is snapshot, not cascade.** [supabase/migrations/20260417000100_sessions_user_linkage.sql](../supabase/migrations/20260417000100_sessions_user_linkage.sql) only fills NULLs on INSERT/UPDATE-of-enrollment_id. If `enrollments.teacher_name` is edited after sessions reference it, the session row stays stale. By design (documented in `memory/project_session_to_profile_linkage.md`), but worth testing explicitly so the behavior doesn't silently change.
6. **Draft-status gate subtlety.** A session can have `processing_status='approved'` AND a `session_drafts` row in `pending_review` simultaneously — the Product log will *not* show it. Analysts sometimes expect visibility after only one of the two gates flips.
7. **CLAUDE.md staleness.** CLAUDE.md line 134 still says "`TEACHERS` — 8 teachers". It's actually 171. Not a test case per se — filed here as a follow-up to prevent future confusion.

---

## How to run this checklist

**Prerequisites:**
- Backend running locally: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload`
- Frontend running locally: `npm run dev` — gate everything through `http://localhost:3000` per `memory/feedback_local_before_domain.md`. Do NOT rely on the production domain.
- Supabase MCP available for SQL probes; run one statement per call per `memory/reference_supabase_mcp_single_statement.md`.
- Test accounts for each role: analyst, manager, sales agent. Seed via `scripts/seed-dev-users.sh` if needed.

**Per-case schema** (every test below uses these fields):
- **Why this matters** — one line; the specific regression it catches.
- **Preconditions** — role logged in, data state required.
- **Steps** — numbered, concrete, with real SQL or UI clicks. Uses real prod fixtures from the appendix where possible.
- **Expected** — the correct outcome.
- **Fails when** — regression symptoms.
- **Code path** — `file:line` reference so a failure is instantly traceable.

**Pass rule.** A section is green only when every case in it passes. Sections A and F are hard gates: if either fails, every other case in the doc is moot.

---

## Section A — Happy path

Sanity before anything else. These must pass against current prod data with no fixtures added.

### A.1 — Manager sees all four approved tutors
- **Why this matters:** Basic end-to-end; catches any regression that silently empties `approvedSessions`.
- **Preconditions:** Logged in as manager. Global date range covers ≥ last 90 days.
- **Steps:**
  1. Navigate to `/teachers`.
  2. Locate cards for Inayat Karim, Vivek Madan, Hira Saeed, Afroze Zaidi.
  3. For each, click the card → Product log tab.
- **Expected:** All four cards present; each Product log tab lists ≥1 approved session.
- **Fails when:** Any of the four tutors has no card, or Product log tab renders "No approved sessions yet."
- **Code path:** [lib/store.tsx:200-222](../lib/store.tsx#L200-L222), [app/teachers/page.tsx:40-51](../app/teachers/page.tsx#L40-L51).

### A.2 — Analyst sees the same four
- **Why this matters:** Roles analyst + manager must be identical for this surface (RLS treats them the same).
- **Preconditions:** Logged in as analyst.
- **Steps:** Repeat A.1.
- **Expected:** Identical result to A.1.
- **Fails when:** Any discrepancy between analyst and manager view.
- **Code path:** [supabase/migrations/20260416000101_enrollments_sessions_rls.sql](../supabase/migrations/20260416000101_enrollments_sessions_rls.sql) (sessions + session_drafts policies).

### A.3 — Multi-row Product log, sorted descending
- **Why this matters:** Catches broken sort or truncation at the 500-row limit.
- **Preconditions:** Analyst or manager. Inayat Karim has 2 approved sessions in prod.
- **Steps:** `/teachers` → Inayat Karim card → Product log.
- **Expected:** Exactly 2 rows. Top row's session_date ≥ bottom row's session_date.
- **Fails when:** 1 row shown, wrong order, or >2 rows (would indicate approval of pending sessions).
- **Code path:** [components/teacher-product-log.tsx:29-32](../components/teacher-product-log.tsx#L29-L32) (sort).

### A.4 — Row click navigates to session detail
- **Why this matters:** Dead links break the analyst review loop.
- **Preconditions:** A.3 passed.
- **Steps:** Click any row in Inayat Karim's Product log.
- **Expected:** Lands on `/sessions/{id}` with the scorecard rendered.
- **Fails when:** 404, white screen, or scorecard empty.
- **Code path:** [components/teacher-product-log.tsx:51-53](../components/teacher-product-log.tsx#L51-L53) (Link href).

### A.5 — Scorecard total matches draft source of truth
- **Why this matters:** If the transform drifts, analysts see wrong numbers and lose trust.
- **Preconditions:** A.4 passed.
- **Steps:**
  1. Note the scorecardTotal shown in Inayat Karim's Product log row.
  2. Via Supabase MCP: `SELECT sd.draft_data->'total_score' FROM session_drafts sd JOIN sessions s ON sd.session_id=s.id WHERE s.teacher_user_name='Inayat Karim' AND s.processing_status='approved' ORDER BY s.session_date DESC LIMIT 1;`
- **Expected:** Both numbers identical.
- **Fails when:** Off by one, zero, or showing SCORECARD_MAX when score is lower.
- **Code path:** [lib/review-transforms.ts](../lib/review-transforms.ts) `dbRowToApprovedSession`.

---

## Section B — Silent-drop (roster gap)

The core failure mode. Covered by the automated probe in `scripts/smoke.sh` step F, but manual cases verify the end-to-end UI symptom.

### B.1 — Session with out-of-roster teacher name → invisible
- **Why this matters:** This is the single most common silent-drop. New tutor CSV → backend ingests sessions → tutor never appears on /teachers because `lib/types.ts` wasn't updated.
- **Preconditions:** Analyst. A temporary test enrollment + session is acceptable (clean up after).
- **Steps:**
  1. Via Supabase MCP, insert an enrollment with `teacher_name='Totally New Tutor'` (one statement).
  2. Insert a session referencing that enrollment_id with `processing_status='approved'` (trigger populates `teacher_user_name`).
  3. Insert a session_drafts row with `status='approved'`, non-null `draft_data.total_score`.
  4. Reload `/teachers`.
  5. Run `./scripts/smoke.sh` locally; the "teacher roster coverage" step must fail and print the name.
- **Expected:** `Totally New Tutor` does **not** appear on /teachers. Smoke fails loudly.
- **Fails when:** A card appears (means drop logic removed), or smoke passes silently (means probe is broken).
- **Cleanup:** `DELETE FROM session_drafts WHERE session_id=...; DELETE FROM sessions WHERE teacher_user_name='Totally New Tutor'; DELETE FROM enrollments WHERE teacher_name='Totally New Tutor';`
- **Code path:** [app/teachers/page.tsx:47-48](../app/teachers/page.tsx#L47-L48) (`if (!tid) return`).

### B.2 — Accidental roster deletion locally
- **Why this matters:** Catches a dev removing a TEACHERS entry by mistake.
- **Preconditions:** Analyst. A.1 passed.
- **Steps:**
  1. Comment out the `Inayat Karim` line in `lib/types.ts`.
  2. Reload `/teachers`.
  3. Revert the edit before committing anything.
- **Expected:** Inayat Karim's card disappears; two approved sessions become unreachable from /teachers.
- **Fails when:** Card still visible (would indicate an unknown fallback source).
- **Code path:** [lib/types.ts:144](../lib/types.ts#L144) TEACHERS array.

### B.3 — Diacritic mismatch between sessions and roster
- **Why this matters:** CSV ingestion often strips or adds diacritics. `"Zaïnab"` in sessions vs `"Zainab"` in roster → silent drop.
- **Preconditions:** Analyst. Temporary test data.
- **Steps:**
  1. Insert a session whose `teacher_user_name='Aliza Shâkeel'` (note the `â` — the roster has `"Aliza Shakeel"`).
  2. Approve draft.
  3. Reload `/teachers`.
- **Expected:** No card synthesized from that session. Existing `Aliza Shakeel` card (if any) unaffected.
- **Fails when:** Either card merges the rows (would indicate fuzzy match — not current behavior, good to confirm).
- **Cleanup:** Remove the test row.
- **Code path:** [app/teachers/page.tsx:41](../app/teachers/page.tsx#L41) `nameToTid` map uses exact lowercased string key.

### B.4 — Middle-initial drift
- **Why this matters:** Roster canonical name `"Syed Zain Ali Akbar"` vs sessions carrying `"Zain Akbar"`. Documents the expected (silent-drop) behavior.
- **Preconditions:** Analyst. Temporary test data.
- **Steps:** Insert a session with `teacher_user_name='Zain Akbar'` and approved draft. Reload `/teachers`.
- **Expected:** No card. The `Syed Zain Ali Akbar` card exists independently.
- **Fails when:** Card appears — means a loose-match was added and now middle initials collapse onto one card (which would also risk false positives).
- **Cleanup:** Remove test row.
- **Code path:** Same as B.3.

---

## Section C — Name-join fragility (card exists but Product log empty)

Different from Section B. In these cases a card *does* render; the Product log tab is where the join breaks.

### C.1 — Demo-teacher vs session-teacher string drift → two cards for one human
- **Why this matters:** Highest-severity UX bug that is currently unfixed. A tutor with demos *and* approved sessions ends up with **two cards** on /teachers when the strings differ.
- **Preconditions:** Analyst. A tutor must exist in BOTH `demos` and `sessions` with a slight name drift. Use test data: copy an existing Vivek Madan demo but change `demos.teacher` to `"Vivek K Madan"`.
- **Steps:**
  1. `UPDATE demos SET teacher='Vivek K Madan' WHERE id=<some demo id for Vivek>;`
  2. Reload `/teachers` as manager.
  3. Count cards containing "Vivek".
- **Expected (current behavior, documents the bug):** Two cards — one `"Vivek K Madan"` with demos + empty Product log, one `"Vivek Madan"` with zero demos + 1 approved session.
- **Fails when:** One merged card appears (would indicate an unintentional fuzzy-match regression). A future fix should collapse to one card; update this case then.
- **Cleanup:** `UPDATE demos SET teacher='Vivek Madan' WHERE id=...;`
- **Code path:** [app/teachers/page.tsx:29-34](../app/teachers/page.tsx#L29-L34) tStats keyed by tid from demos; [components/teacher-product-log.tsx:24-26](../components/teacher-product-log.tsx#L24-L26) exact (case-insensitive) match.

### C.2 — Exact-case match → one card, populated log
- **Why this matters:** Control for C.1.
- **Preconditions:** Production-default state (no demo name edits).
- **Steps:** `/teachers` → Vivek Madan card → Product log.
- **Expected:** One card, one row in Product log.
- **Fails when:** Duplicate cards (means demos.teacher drifted) or empty log (means ApprovedSession transform broken).
- **Code path:** Same as C.1.

### C.3 — Leading/trailing whitespace in sessions.teacher_user_name
- **Why this matters:** `tStats` synth does `(s.teacherUserName ?? "").trim()` ([app/teachers/page.tsx:44](../app/teachers/page.tsx#L44)); `matchByTeacher` in the Product log filter does **not** trim. Result: a card synthesizes, the tab is empty. Known gap.
- **Preconditions:** Analyst. Temporary test data.
- **Steps:**
  1. `UPDATE sessions SET teacher_user_name=' Hira Saeed ' WHERE teacher_user_name='Hira Saeed' AND processing_status='approved';` (note leading + trailing spaces).
  2. Reload `/teachers`.
  3. Click the Hira Saeed card → Product log.
- **Expected (current behavior, documents the bug):** Card shows Hira Saeed correctly (trim at synth). Product log tab is empty (no trim at filter).
- **Fails when:** Tab is populated (trim was added — good, update this test to positive assertion) or card is missing (trim regressed at synth).
- **Cleanup:** `UPDATE sessions SET teacher_user_name='Hira Saeed' WHERE teacher_user_name=' Hira Saeed ';`
- **Code path:** [app/teachers/page.tsx:44](../app/teachers/page.tsx#L44) (trim); [components/teacher-product-log.tsx:24-26](../components/teacher-product-log.tsx#L24-L26) (no trim).

### C.4 — Mixed case both sides → one card
- **Why this matters:** Control; confirms case-insensitive match works end-to-end.
- **Preconditions:** Analyst. Temporary test.
- **Steps:**
  1. `UPDATE sessions SET teacher_user_name='vivek madan' WHERE teacher_user_name='Vivek Madan';`
  2. Reload /teachers → Vivek Madan card → Product log.
- **Expected:** One card with display name sourced from the session row (`vivek madan`), Product log populated. (Card rendering uses `s.teacherUserName` verbatim; it preserves the lowercased form.)
- **Fails when:** No card (means lowercasing broke), or Product log empty (means filter broke).
- **Cleanup:** Revert the UPDATE.
- **Code path:** [app/teachers/page.tsx:47](../app/teachers/page.tsx#L47) `nameToTid.get(nm.toLowerCase())`; [components/teacher-product-log.tsx:26](../components/teacher-product-log.tsx#L26).

### C.5 — Null teacher_user_name → silent skip, no crash
- **Why this matters:** Trigger gap or direct insert with NULL could leave bad rows. UI must not crash.
- **Preconditions:** Analyst. Temporary test.
- **Steps:**
  1. Insert an approved session with `teacher_user_name=NULL` (bypass the trigger by also setting `teacher_user_id=NULL` and `enrollment_id` to a non-existent value).
  2. Reload /teachers.
- **Expected:** No card for the NULL row. No error in browser console. No crash on render.
- **Fails when:** Browser console shows `Cannot read properties of null`, or a blank card renders.
- **Cleanup:** Delete the test session + draft.
- **Code path:** [app/teachers/page.tsx:44-45](../app/teachers/page.tsx#L44-L45) (`!nm` early return).

---

## Section D — Draft + status state machine

Both `sessions.processing_status` and `session_drafts.status` must be aligned. Most analyst confusion lives here.

### D.1 — scored + pending_review → hidden
- **Why this matters:** 17 of 22 sessions in prod are `scored`. They should NOT show on /teachers.
- **Steps:** Via MCP: `SELECT COUNT(*) FROM sessions WHERE processing_status='scored';` Note the count. Then load /teachers as manager; sum entries across all Product logs.
- **Expected:** Sum of Product log entries ≤ approved count (currently 5). Scored ones invisible.
- **Fails when:** Product log shows more entries than approved count.
- **Code path:** [lib/store.tsx:210-211](../lib/store.tsx#L210-L211) (`.eq('processing_status','approved')` + `.in('session_drafts.status',...)`).

### D.2 — approved processing + pending_review draft → **still hidden**
- **Why this matters:** Most common confusion. Approving in the /sessions UI flips ONE of the two fields; the other must also transition.
- **Preconditions:** Analyst. A session currently in this exact state, or create one temporarily.
- **Steps:**
  1. Pick an approved session, e.g. Inayat Karim's latest. Note its ID.
  2. `UPDATE session_drafts SET status='pending_review' WHERE session_id=<that-id>;`
  3. Wait 2s for realtime. Reload /teachers if needed.
- **Expected:** The row disappears from Inayat Karim's Product log.
- **Fails when:** Row still present (means INNER JOIN gate failing).
- **Cleanup:** `UPDATE session_drafts SET status='approved' WHERE session_id=<that-id>;`
- **Code path:** Same as D.1.

### D.3 — scored processing + approved draft → hidden
- **Why this matters:** Reverse of D.2; also common right after AI scoring completes.
- **Preconditions:** Analyst. Temporary state change.
- **Steps:**
  1. Pick a scored session. `UPDATE session_drafts SET status='approved' WHERE session_id=<id>;`
  2. Reload /teachers.
- **Expected:** Session does NOT appear — processing_status gate blocks it.
- **Fails when:** Session appears.
- **Cleanup:** Revert draft status.
- **Code path:** Same as D.1.

### D.4 — Approve → visible → revert → must drop within ~2s
- **Why this matters:** Realtime propagation on revert; catches session_drafts channel regressions.
- **Preconditions:** Two tabs, both as analyst. Tab A = /sessions/[id]; Tab B = /teachers with Hira Saeed card open, Product log tab active.
- **Steps:**
  1. Tab A: revert Hira Saeed's approved draft back to `pending_review` (use the Reject button if available, else SQL).
  2. Watch Tab B.
- **Expected:** Tab B's Product log empties within ~2s (realtime refetch fires). No manual refresh needed.
- **Fails when:** Row persists > 5s. Indicates `session_drafts` realtime channel is not triggering refetch.
- **Code path:** [lib/store.tsx:447-453](../lib/store.tsx#L447-L453) (`session_drafts` channel).

### D.5 — Re-approve → reappears within ~2s
- **Steps:** Reverse D.4. Approve the draft; confirm Tab B reflects within ~2s.
- **Expected:** Row reappears.
- **Fails when:** Stale empty state.
- **Code path:** Same as D.4.

### D.6 — partially_edited draft → visible, interpretation badge renders
- **Why this matters:** `partially_edited` is included in the `.in(...)` filter — confirm the UI still renders the score and badge correctly.
- **Preconditions:** Analyst. Pick any approved session.
- **Steps:**
  1. `UPDATE session_drafts SET status='partially_edited' WHERE session_id=<id>;`
  2. Reload /teachers → tutor's Product log.
- **Expected:** Row shown. Score badge (Needs improvement / Satisfactory / Excellent) renders correctly per `interpretationBadge(scorecardTotal)`.
- **Fails when:** Row missing, or badge reads NaN/undefined.
- **Cleanup:** Revert status.
- **Code path:** [components/teacher-product-log.tsx:48](../components/teacher-product-log.tsx#L48) (`interpretationBadge`).

---

## Section E — Denormalization trigger `trg_populate_session_user_fields`

The trigger lives in [supabase/migrations/20260417000100_sessions_user_linkage.sql](../supabase/migrations/20260417000100_sessions_user_linkage.sql). BEFORE INSERT + BEFORE UPDATE-OF-enrollment_id.

### E.1 — INSERT with NULL linkage fields → trigger populates all four
- **Why this matters:** Backend session-ingest flow depends on this (it only writes `enrollment_id`, not the denormalized fields).
- **Preconditions:** An enrollment row with known teacher_name, teacher_id, student_name, student_id.
- **Steps (one MCP call each):**
  1. `INSERT INTO sessions (session_id, enrollment_id, processing_status, created_at, updated_at) VALUES ('test-trg-e1', '<existing enrollment_id>', 'pending', NOW(), NOW()) RETURNING teacher_user_id, teacher_user_name, student_user_id, student_user_name;`
  2. Inspect RETURNING.
- **Expected:** All four fields non-null, matching the enrollment.
- **Fails when:** Any field still NULL.
- **Cleanup:** `DELETE FROM sessions WHERE session_id='test-trg-e1';`
- **Code path:** [supabase/migrations/20260417000100_sessions_user_linkage.sql:32-51](../supabase/migrations/20260417000100_sessions_user_linkage.sql#L32-L51).

### E.2 — INSERT with one field already set → set field preserved
- **Why this matters:** Documents that trigger does NOT overwrite.
- **Steps:**
  1. `INSERT INTO sessions (session_id, enrollment_id, teacher_user_name, processing_status, created_at, updated_at) VALUES ('test-trg-e2', '<enrollment_id>', 'Manually Set', 'pending', NOW(), NOW()) RETURNING teacher_user_id, teacher_user_name;`
- **Expected:** `teacher_user_name = 'Manually Set'` (preserved); `teacher_user_id` NULL (trigger short-circuits because *any* of the four being non-null blocks it — re-read the trigger).
- **Caveat:** The trigger condition is `IF … IS NULL OR … IS NULL OR …`. It fires if ANY of the four is NULL — meaning it WILL overwrite the NULL ones but may overwrite even the manually-set `teacher_user_name` from the SELECT. **Run this probe and document the actual behavior in the PASS/FAIL note.** If the manually-set value is overwritten, the trigger is more aggressive than the memory doc claims; file as an inconsistency.
- **Cleanup:** `DELETE FROM sessions WHERE session_id='test-trg-e2';`
- **Code path:** Same as E.1, especially the `SELECT … INTO NEW.teacher_user_id, NEW.teacher_user_name, …` which unconditionally overwrites all four once the condition fires.

### E.3 — Edit enrollment.teacher_name after session exists → session snapshot stays stale
- **Why this matters:** Intentional design (snapshot, not cascade) per `memory/project_session_to_profile_linkage.md`. Testing so the behavior doesn't silently change.
- **Steps:**
  1. Pick a session whose enrollment.teacher_name matches. Note both values.
  2. `UPDATE enrollments SET teacher_name='Renamed For Test' WHERE enrollment_id=<id>;`
  3. `SELECT teacher_user_name FROM sessions WHERE enrollment_id=<id>;`
- **Expected:** Session's `teacher_user_name` is UNCHANGED (old value). /teachers still shows old name.
- **Fails when:** Session reflects the rename — means a cascade trigger was added, contradicting the documented design. If that becomes intentional, update this test + the memory doc.
- **Cleanup:** Revert `enrollments.teacher_name` to original.
- **Code path:** Trigger fires on `INSERT OR UPDATE OF enrollment_id` — not on downstream enrollment changes.

### E.4 — INSERT with enrollment_id pointing at a deleted enrollment → fields remain NULL, no crash
- **Why this matters:** The backend could theoretically race: enrollment deleted between CSV upload and session creation.
- **Steps:**
  1. Pick a non-existent enrollment_id (e.g. `'never-existed-42'`).
  2. `INSERT INTO sessions (session_id, enrollment_id, processing_status, created_at, updated_at) VALUES ('test-trg-e4', 'never-existed-42', 'pending', NOW(), NOW()) RETURNING teacher_user_id, teacher_user_name;`
- **Expected:** Row created, all four linkage fields NULL. No error raised.
- **Fails when:** Insert errors out (would indicate a NOT NULL constraint on those columns was added) or any field is non-null.
- **Cleanup:** `DELETE FROM sessions WHERE session_id='test-trg-e4';`
- **Code path:** Trigger's SELECT returns no row → fields stay NULL.

---

## Section F — Role & RLS gating

### F.1 — Sales agent: Product log tab HIDDEN, not just empty
- **Why this matters:** Empty-vs-hidden is a real distinction. Empty hints that data might exist but you can't see it. Hidden says "not for you".
- **Preconditions:** Logged in as a sales_agent.
- **Steps:**
  1. Navigate to /teachers.
  2. Click any teacher card (one with demos — sales can still drill down).
  3. Observe the tab bar.
  4. Open DevTools → Network → filter for `sessions`. Do NOT refresh data; just observe.
- **Expected:**
  - Tab bar shows only: Dashboard, Demo logs, Reviews. **No Product log tab.**
  - Network tab shows no `sessions` or `session_drafts` request initiated by the approved-sessions fetch. (Store short-circuits for non-analyst/manager roles.)
- **Fails when:** Product log tab is visible (even if empty), or the query is made but RLS rejects it (wasted round-trip).
- **Code path:** [app/teachers/page.tsx:21](../app/teachers/page.tsx#L21) (`canSeeProductLog`); [lib/store.tsx:200-204](../lib/store.tsx#L200-L204) (store short-circuit); [supabase/migrations/20260416000101_enrollments_sessions_rls.sql](../supabase/migrations/20260416000101_enrollments_sessions_rls.sql).

### F.2 — Analyst: full Product log visibility
- **Steps:** A.2 effectively covers this.
- **Expected:** All approved rows visible.
- **Fails when:** Rows missing or Product log tab hidden.

### F.3 — Manager: identical to analyst
- **Steps:** A.1 effectively covers this.
- **Expected:** Matches F.2.
- **Fails when:** Any divergence between the two.

---

## Section G — Realtime propagation

Two tabs, same role (analyst). Channel: `approved-sessions-sync` at [lib/store.tsx:438-454](../lib/store.tsx#L438-L454).

### G.1 — Approve in Tab A → Product log updates in Tab B within ~2s
- **Preconditions:** A scored session with a draft in pending_review (or use a fresh one).
- **Steps:**
  1. Tab A: navigate to /sessions/[id] for a scored session.
  2. Tab B: navigate to /teachers, drill down to that teacher's Product log (currently without this row).
  3. Tab A: approve (flips both `sessions.processing_status` and `session_drafts.status`).
- **Expected:** Tab B's Product log shows the new row within ~2s. Timestamp and score match.
- **Fails when:** Row absent after 5s (realtime broken or refetch not triggered).
- **Code path:** [lib/store.tsx:438-454](../lib/store.tsx#L438-L454).

### G.2 — Reject in Tab A → Tab B drops the row
- Covered by D.4 with a realtime lens.

### G.3 — Single logical approve triggers no thrashing
- **Why this matters:** The approve flow updates BOTH `sessions` and `session_drafts`. Each channel fires — and each fires a full `fetchApprovedSessions` with `limit(500)`. We expect two refetches; we do NOT expect eight.
- **Preconditions:** DevTools Network open. Analyst.
- **Steps:**
  1. Tab A: single approve action.
  2. Count REST calls to `/rest/v1/sessions?…inner…session_drafts…`.
- **Expected:** 1–2 calls. A brief debounce would be nice but isn't implemented.
- **Fails when:** >3 calls per single approve — indicates a subscription leak or retry loop.
- **Code path:** Same as G.1.

---

## Section H — Future `/students/[id]` surface

The same component renders for students via `<TeacherProductLog studentUserId={...} />`. When that page is built, run these.

### H.1 — Student with ≥2 approved sessions renders them
- **Preconditions:** A student whose `student_user_id` appears in ≥2 approved sessions.
- **Steps:** `/students/<student_user_id>`.
- **Expected:** All matching approved sessions listed, sorted desc by session_date.
- **Fails when:** Missing rows or wrong sort.
- **Code path:** [components/teacher-product-log.tsx:27-28](../components/teacher-product-log.tsx#L27-L28) (`matchByStudent`).

### H.2 — Student with only unapproved sessions → empty state
- **Steps:** Pass a `studentUserId` whose sessions are all `scored` or `pending`.
- **Expected:** "No approved sessions yet." empty state.
- **Fails when:** Unapproved rows leak through.

### H.3 — studentUserId with trailing space or case variant does NOT match
- **Why this matters:** Unlike teacher match, student match is **exact string equality on UUID** ([components/teacher-product-log.tsx:28](../components/teacher-product-log.tsx#L28)) — no trim, no lowercasing.
- **Steps:** Pass `' <uuid>'` (leading space) or uppercased UUID.
- **Expected:** No match; empty state.
- **Fails when:** Matches anyway (would indicate fuzzy match on UUIDs, bad).

### H.4 — Session with NULL student_user_id → skipped
- **Steps:** Insert an approved session with `student_user_id=NULL` (bypass trigger via a deleted enrollment). Load /students/<some-id>.
- **Expected:** NULL row is not surfaced regardless of `studentUserId` passed.
- **Fails when:** Crash or NULL pollution in the list.

---

## Section I — Data integrity SQL probes

Run each as a **single statement** via Supabase MCP per `memory/reference_supabase_mcp_single_statement.md`. Each probe's pass rule is "zero rows returned" (except I.0 which is informational).

### I.0 — Status inventory (informational baseline)
```sql
SELECT processing_status, COUNT(*) FROM sessions GROUP BY 1 ORDER BY 2 DESC;
```
Record the numbers; the other probes use them as the denominator.

### I.1 — Approved sessions with NULL teacher_user_name
```sql
SELECT id, session_id, enrollment_id
FROM sessions
WHERE processing_status='approved' AND teacher_user_name IS NULL;
```
**Pass:** zero rows. Any row = invisible on /teachers.

### I.2 — Approved sessions whose teacher_user_name is not in TEACHERS roster
Because the roster is in TS source, run this as two steps:

(a) Get distinct names currently in the approved set:
```sql
SELECT DISTINCT teacher_user_name
FROM sessions
WHERE processing_status='approved' AND teacher_user_name IS NOT NULL
ORDER BY 1;
```

(b) Locally, diff that list (lowercased) against `TEACHERS[].name.toLowerCase()` from [lib/types.ts:144](../lib/types.ts#L144).

Any name in (a) but not in (b) = silent drop on /teachers. **Pass:** empty diff. This is the same probe automated in `scripts/smoke.sh` step F — if smoke passes, this passes.

### I.3 — Approved sessions whose draft is not in (approved, partially_edited)
```sql
SELECT s.id, sd.status
FROM sessions s
JOIN session_drafts sd ON sd.session_id=s.id
WHERE s.processing_status='approved'
  AND sd.status NOT IN ('approved','partially_edited');
```
**Pass:** zero rows. (The INNER JOIN in the store should make this impossible to surface on /teachers anyway — this probe confirms no stray state.)

### I.4 — teacher_user_id set but teacher_user_name NULL, or vice versa
```sql
SELECT id, teacher_user_id, teacher_user_name
FROM sessions
WHERE (teacher_user_id IS NULL) != (teacher_user_name IS NULL);
```
**Pass:** zero rows. Any row = trigger gap or hand-written bad data.

### I.5 — Name collisions across different tids
```sql
SELECT LOWER(teacher_user_name) AS lower_name,
       ARRAY_AGG(DISTINCT teacher_user_id) AS ids,
       COUNT(DISTINCT teacher_user_id)     AS n_ids
FROM sessions
WHERE teacher_user_name IS NOT NULL
GROUP BY 1
HAVING COUNT(DISTINCT teacher_user_id) > 1;
```
**Pass:** zero rows. Any row = two humans sharing a display name in the actual session data, which will collapse to one card on /teachers.

### I.6 — Sessions whose enrollment_id points at a deleted enrollment
```sql
SELECT s.id, s.enrollment_id
FROM sessions s
LEFT JOIN enrollments e ON e.enrollment_id=s.enrollment_id
WHERE e.enrollment_id IS NULL;
```
**Pass:** zero rows. Any row = orphaned session.

### I.7 — Approved sessions whose reviewed_at is NULL
```sql
SELECT s.id
FROM sessions s
JOIN session_drafts sd ON sd.session_id=s.id
WHERE s.processing_status='approved'
  AND sd.status IN ('approved','partially_edited')
  AND sd.reviewed_at IS NULL;
```
**Pass:** zero rows. Any row = approved without an analyst timestamp, either direct SQL tampering or a bug in the approve flow.

### I.8 — Whitespace corruption in teacher_user_name
```sql
SELECT DISTINCT teacher_user_name
FROM sessions
WHERE teacher_user_name IS NOT NULL
  AND teacher_user_name <> TRIM(teacher_user_name);
```
**Pass:** zero rows. Any row = ingestion bug; will cause C.3 symptom.

---

## Appendix 1 — Real prod fixtures (as of 2026-04-19)

| Tutor                | tid (uid) | Approved sessions | Use in tests                          |
|----------------------|-----------|-------------------|---------------------------------------|
| Inayat Karim         | 543       | 2                 | A.3 multi-row, A.5 scorecard, D.2     |
| Vivek Madan          | 66        | 1                 | A.1, C.1 name-drift, C.2 control, C.4 |
| Hira Saeed           | 670       | 1                 | D.4/D.5 revert-and-return             |
| Afroze Zaidi         | 46        | 1                 | A.1 (originally the 2026-04-17 session-only card synthesis bug; still the canonical test) |

Always re-confirm these counts via `SELECT teacher_user_name, COUNT(*) FROM sessions WHERE processing_status='approved' GROUP BY 1;` before running, since prod data evolves.

## Appendix 2 — Code-path map

| Concern                                    | File : line                                                                                                |
|--------------------------------------------|------------------------------------------------------------------------------------------------------------|
| tStats synthesis + roster drop             | [app/teachers/page.tsx:23-61](../app/teachers/page.tsx#L23-L61)                                            |
| Product log tab render                     | [app/teachers/page.tsx:206-209](../app/teachers/page.tsx#L206-L209)                                        |
| TeacherProductLog name/student match       | [components/teacher-product-log.tsx:19-32](../components/teacher-product-log.tsx#L19-L32)                  |
| approvedSessions store fetch + role gate   | [lib/store.tsx:197-222](../lib/store.tsx#L197-L222)                                                        |
| Realtime channel (sessions + drafts)       | [lib/store.tsx:432-458](../lib/store.tsx#L432-L458)                                                        |
| TEACHERS roster (171 entries)              | [lib/types.ts:144](../lib/types.ts#L144)                                                                   |
| Denormalization trigger                    | [supabase/migrations/20260417000100_sessions_user_linkage.sql](../supabase/migrations/20260417000100_sessions_user_linkage.sql) |
| RLS for sessions + session_drafts          | [supabase/migrations/20260416000101_enrollments_sessions_rls.sql](../supabase/migrations/20260416000101_enrollments_sessions_rls.sql) |
| ApprovedSession transform                  | [lib/review-transforms.ts](../lib/review-transforms.ts) `dbRowToApprovedSession`                           |
| Smoke probe (automated)                    | [scripts/smoke.sh](../scripts/smoke.sh) step F                                                             |

## Appendix 3 — Follow-ups (out of scope for this doc)

These are product fixes the audit surfaced. They are deliberately NOT fixed here (per user scope). File each as a separate ticket when ready:

1. **Roster fallback.** The 171-entry hardcoded `TEACHERS` list is the single point of silent drop. Candidate fix: resolve tid from a live `users` table query at render time, using `TEACHERS` only as a cache. Blast radius: moderate (store changes).
2. **Trim in matchByTeacher.** [components/teacher-product-log.tsx:26](../components/teacher-product-log.tsx#L26) should mirror the `.trim()` applied in tStats synth to close the C.3 asymmetry.
3. **Dedup collision.** [app/teachers/page.tsx:42-46](../app/teachers/page.tsx#L42-L46) dedup key should be `${tid}` not `name.toLowerCase()` — two tutors sharing a name would then get two cards.
4. **Duplicate cards for name-drifted humans.** Design-level decision needed: should /teachers attempt to merge `demos.teacher` and `sessions.teacher_user_name` by tid rather than by string? (Would require resolving demos.teacher → tid via `TEACHERS` as well, and merging after.)
5. **CLAUDE.md stale line.** "TEACHERS — 8 teachers" should be updated to "171 teachers" to match reality.
6. **Trigger E.2 unexpected overwrite.** If E.2 shows the trigger overwriting a manually-set `teacher_user_name`, the trigger's condition needs tightening (per-field check rather than OR'd null check).
