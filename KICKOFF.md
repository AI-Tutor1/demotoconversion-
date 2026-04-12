# KICKOFF.md — What to Say to Claude Code

## How It Works

You use TWO prompts in sequence:

1. **First message:** Copy the content from `PROMPT.md` (everything below the `---` line). This loads the rules, constraints, and context into Claude Code's memory.

2. **Second message:** Copy ONE of the kickoff prompts below depending on what you want Claude Code to do.

---

## Kickoff Prompt A: Full Project Bootstrap

Use this when starting fresh. Claude Code will read all docs, verify the project compiles, and report what it finds.

```
Read all documentation files in this order: CLAUDE.md, MEMORY.md, CONTEXT.md, DESIGN.md, CONVENTIONS.md, ARCHITECTURE.md. After reading each one, confirm you've read it with a one-line summary.

Then:
1. Run `npm install`
2. Run `npm run build` and fix any TypeScript errors
3. Run the full verification suite from TOOLS.md
4. Report: which files exist, which pages are complete, and what needs work

Do not write any new code yet. Just read, build, verify, and report.
```

---

## Kickoff Prompt B: Continue Development

Use this when the project is already set up and you want Claude Code to build or fix something specific. Replace `[TASK]` with your actual request.

```
Read CLAUDE.md and MEMORY.md first. Then do the following:

[TASK]

Follow the workflow: UNDERSTAND → LOCATE → PLAN → IMPLEMENT → VERIFY → REPORT.

Before writing code, tell me which files you'll change and why. After writing code, run the Four Laws verification checks from PROMPT.md and confirm all pass.
```

### Example tasks to paste as [TASK]:

**Add a new feature:**
```
Add a date picker filter to the Analytics page that lets users select a custom date range (start date + end date) instead of only the preset 7d/30d/90d options. The custom range should filter all charts on the page. Follow DESIGN.md for input styling.
```

**Fix a bug:**
```
When I submit a new demo from the Analyst form and then navigate to the Kanban board, the new demo doesn't appear. Diagnose why and fix it. Check MEMORY.md BUG-004 for a similar issue that was fixed before.
```

**Connect Supabase (Phase 2):**
```
Read ARCHITECTURE.md "Phase 2 Migration Plan" section. Create lib/supabase.ts with the client setup. Then update lib/store.tsx to fetch demos from Supabase on mount instead of using seed data. Follow the exact migration steps documented in ARCHITECTURE.md. Do not change any page components.
```

**Add authentication (Phase 2):**
```
Read SECURITY.md completely. Implement Supabase Auth with email/password login. Create app/login/page.tsx with the Apple design system styling from DESIGN.md. Add middleware.ts for session checking. Add the route protection matrix from SECURITY.md. Follow the implementation pattern documented in SECURITY.md "Phase 2: Supabase Auth" section.
```

**Build an AI agent (Phase 3):**
```
Read PROMPTS.md "Demo Analyst Agent" section. Read ARCHITECTURE.md for the Python backend structure. Create a new Python FastAPI project in a /backend directory with:
- main.py with the /api/v1/demos/{id}/analyze endpoint
- agents/demo_analyst.py with the LangGraph node using the system prompt from PROMPTS.md
- requirements.txt with fastapi, uvicorn, langchain, langgraph, anthropic
Do not modify the Next.js frontend. The agent writes results to Supabase demo_drafts table.
```

**Add a new page:**
```
Create app/admin/page.tsx — a manager-only admin panel that shows:
1. All users (analysts + sales agents) with their current_load and max_capacity
2. Agent configuration cards (from PROMPTS.md agent registry)
3. System health metrics (task queue depth, AI approval rates)
Follow the page pattern from CLAUDE.md. Use the Apple design system from DESIGN.md. Use existing components from components/ui.tsx.
```

---

## Kickoff Prompt C: Code Review

Use this when you want Claude Code to audit existing code before making changes.

```
Read CLAUDE.md, MEMORY.md, and TESTING.md. Then:

1. Run `npm run build` — report any errors
2. Run the full verification suite from TOOLS.md — report results
3. Open each page file (app/page.tsx, app/*/page.tsx) and check:
   - Does it use `rangedDemos` (not `demos`) for display?
   - Does every `setDemos` call have a matching `logActivity`?
   - Does every destructive action go through `setConfirm`?
   - Are all chart data arrays computed via `useMemo` from state?
4. Check globals.css for any CSS classes that are defined but never used, or used but never defined
5. Report all findings with file names and line numbers
```

---

## Kickoff Prompt D: Deploy Preparation

Use this when you're ready to deploy.

```
Read ARCHITECTURE.md "Deployment Architecture" section. Then:

1. Run `npm run build` — must succeed with zero errors
2. Run `npm run lint` — fix any warnings
3. Run the full verification suite from TOOLS.md
4. Check that .env.example lists all required environment variables
5. Check that .gitignore covers node_modules, .next, .env files
6. Verify no hardcoded localhost URLs exist in the codebase
7. Verify no console.log statements exist in production code
8. Create a Vercel-ready configuration if missing
9. Report deployment readiness with a checklist
```

---

## Tips for Best Results

1. **One task per message.** Don't ask Claude Code to "add auth, connect Supabase, and build the admin panel" in one prompt. Break it into three sequential prompts.

2. **Reference the docs explicitly.** Instead of "make it look nice," say "follow DESIGN.md section Typography for font sizes and DESIGN.md section Spacing for padding values."

3. **Name the guardrails.** Instead of "be careful with state," say "check MEMORY.md BUG-004 about useState vs useMemo for derived state."

4. **Ask for verification.** End every prompt with "run the Four Laws checks and confirm all pass." This catches 90% of errors before you see them.

5. **Start read-only.** For complex tasks, first ask Claude Code to "read the relevant files and tell me your plan before writing any code." Review the plan, then say "proceed."
