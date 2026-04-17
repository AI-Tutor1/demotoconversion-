-- Migration: narrow public.users SELECT policy
-- Replaces the wildcard "Read all profiles USING (true)" policy with
-- three targeted policies so each role can only see what it needs:
--
--   - Any user can always read their own row (needed for session hydration).
--   - Managers can read all rows (admin needs).
--   - Analysts can read active sales_agent rows (needed for round-robin
--     assignment in app/analyst/page.tsx and app/analyst/[id]/page.tsx).
--   - Sales agents get self-only via the first policy; no extra grant needed.
--
-- The existing policy name is "Read all profiles" (set in
-- 20260412112903_rls_policies.sql).  Use DROP POLICY IF EXISTS so this
-- migration is idempotent on re-apply.

DROP POLICY IF EXISTS "Read all profiles" ON public.users;

-- 1. Every authenticated user can read their own row.
CREATE POLICY "Users read self"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 2. Managers can read all rows.
CREATE POLICY "Managers read all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'manager');

-- 3. Analysts can read active sales-agent rows (for auto-assign round-robin).
CREATE POLICY "Analysts read active sales agents"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'analyst'
    AND role = 'sales_agent'
    AND is_active = TRUE
  );
