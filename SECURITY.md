# SECURITY.md — Authentication, Authorization & Data Access

## Current State (Phase 1)

- No authentication — all views are publicly accessible
- No row-level security — all data is visible to everyone
- No API calls — data is in-memory only
- No sensitive data in the codebase (no API keys, no credentials)

## Phase 2: Supabase Auth

### Authentication Flow
```
User opens app → Middleware checks session →
  If valid session → Render page (role from user profile)
  If no session → Redirect to /login
```

### Implementation
```tsx
// middleware.ts (root level)
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";

export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session && !req.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
```

### Role-Based Route Protection
| Route | analyst | sales_agent | manager |
|-------|---------|-------------|---------|
| `/` (dashboard) | Read own stats | Read own stats | Read all stats |
| `/analyst` | Full access | No access | Full access |
| `/sales` | Read-only (own demos) | Full access | Full access |
| `/kanban` | Own columns | Own columns | All columns |
| `/analytics` | View only | View only | Full access |
| `/teachers` | View only | View only | Full access |
| `/admin/*` | No access | No access | Full access |

### Frontend Route Guard Pattern
```tsx
// In each protected page:
const { data: { user } } = await supabase.auth.getUser();
const profile = await supabase.from("users").select("role").eq("id", user.id).single();

if (profile.data.role !== "manager" && pathname.startsWith("/admin")) {
  redirect("/");
}
```

## Row-Level Security (RLS) Policies

### Table: demos
```sql
-- Enable RLS
ALTER TABLE demos ENABLE ROW LEVEL SECURITY;

-- Analysts: see only their assigned demos + unassigned pool
CREATE POLICY "Analysts read own and unassigned demos"
  ON demos FOR SELECT
  TO authenticated
  USING (
    analyst_id = auth.uid()
    OR analyst_id IS NULL
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
  );

-- Sales agents: see only their assigned demos
CREATE POLICY "Sales agents read own demos"
  ON demos FOR SELECT
  TO authenticated
  USING (
    sales_agent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('analyst', 'manager'))
  );

-- Analysts: update only their own assigned demos (review fields)
CREATE POLICY "Analysts update own reviews"
  ON demos FOR UPDATE
  TO authenticated
  USING (analyst_id = auth.uid())
  WITH CHECK (analyst_id = auth.uid());

-- Atomic claim: only claim if unassigned
CREATE POLICY "Claim unassigned demo"
  ON demos FOR UPDATE
  TO authenticated
  USING (analyst_id IS NULL)
  WITH CHECK (
    analyst_id = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'analyst')
  );

-- Sales agents: update only conversion fields on their demos
CREATE POLICY "Sales update own demos"
  ON demos FOR UPDATE
  TO authenticated
  USING (sales_agent_id = auth.uid())
  WITH CHECK (sales_agent_id = auth.uid());

-- Managers: full access
CREATE POLICY "Managers full access"
  ON demos FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));
```

### Table: users
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read all user profiles (for display names, avatars)
CREATE POLICY "Read all profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Only managers can create/update/delete users
CREATE POLICY "Managers manage users"
  ON users FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'));

-- Users can update their own profile (avatar, name)
CREATE POLICY "Update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

### Table: demo_drafts
```sql
ALTER TABLE demo_drafts ENABLE ROW LEVEL SECURITY;

-- Only the assigned analyst can see and review drafts for their demos
CREATE POLICY "Analyst reads own drafts"
  ON demo_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM demos
      WHERE demos.id = demo_drafts.demo_id
      AND demos.analyst_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager')
  );
```

## Environment Variable Security

### Rules
1. **NEVER commit `.env` or `.env.local`** — these contain secrets
2. `.env.example` contains variable names with placeholder values only
3. `NEXT_PUBLIC_` prefix means the variable is exposed to the browser — only use for non-sensitive values (Supabase URL, anon key)
4. Server-only secrets (service role key, API keys) must NEVER have the `NEXT_PUBLIC_` prefix
5. The Supabase anon key is safe to expose — RLS policies protect data, not the key

### Variable Classification
| Variable | Public? | Where used |
|----------|---------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser client (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO** | Server Actions only (bypasses RLS) |
| `NEXT_PUBLIC_AI_BACKEND_URL` | Yes | Browser (for status polling) |
| `AI_BACKEND_API_KEY` | **NO** | Server-to-server calls only |
| `ANTHROPIC_API_KEY` | **NO** | Python backend only |

## Data Privacy

### Personally Identifiable Information (PII) in the system
| Data | Classification | Handling |
|------|---------------|---------|
| Student names | PII | Display only, no export without manager approval |
| Parent phone numbers | PII | Encrypted at rest in Supabase, visible only to assigned sales agent |
| Teacher names | Business data | Visible to all authenticated users |
| Student feedback verbatim | PII | Visible to assigned analyst and sales agent |
| Demo recordings | PII | Stored in Supabase Storage with access policies |

### Data Retention
- Active demos: retained indefinitely
- Archived demos (> 12 months): moved to cold storage
- User accounts: soft-deleted (is_active = false), data preserved
- AI drafts: retained for 6 months for model improvement analysis
- Task queue logs: retained for 3 months, then purged
