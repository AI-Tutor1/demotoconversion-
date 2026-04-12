-- ============================================================
-- Fix: break infinite recursion in public.users RLS
-- ============================================================
-- The "Managers manage users" FOR ALL policy on public.users used
--   USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'))
-- which caused Postgres 42P17 on every authenticated read of users:
-- evaluating the USING expression queries users, triggering policy
-- evaluation, ad infinitum.
--
-- That break cascaded:
--   * middleware profile lookup → no role → role-gate denied all auth routes
--   * store syncUserProfile → null user → no nav badge, no sign-out
--   * "Managers full access demos" USING (EXISTS … users …) subquery
--     failed → manager saw 0 demos
--
-- Standard Supabase fix: introduce a SECURITY DEFINER helper that reads
-- role bypassing RLS. All policies that previously did EXISTS-into-users
-- now call the helper — same semantics, no recursion, fewer subqueries.
-- ============================================================

-- ─── 1. Helper that bypasses RLS for role lookup only ─────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

-- ─── 2. users: drop recursive policy, recreate via helper ────

DROP POLICY "Managers manage users" ON public.users;

CREATE POLICY "Managers manage users"
  ON public.users FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'manager')
  WITH CHECK (public.current_user_role() = 'manager');

-- ─── 3. demos: rewrite EXISTS-users patterns ─────────────────

DROP POLICY "Analysts read own and unassigned demos" ON public.demos;
CREATE POLICY "Analysts read own and unassigned demos"
  ON public.demos FOR SELECT
  TO authenticated
  USING (
    analyst_id = auth.uid()
    OR analyst_id IS NULL
    OR public.current_user_role() = 'manager'
  );

DROP POLICY "Claim unassigned demo" ON public.demos;
CREATE POLICY "Claim unassigned demo"
  ON public.demos FOR UPDATE
  TO authenticated
  USING (analyst_id IS NULL)
  WITH CHECK (
    analyst_id = auth.uid()
    AND public.current_user_role() = 'analyst'
  );

DROP POLICY "Managers full access demos" ON public.demos;
CREATE POLICY "Managers full access demos"
  ON public.demos FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'manager')
  WITH CHECK (public.current_user_role() = 'manager');

DROP POLICY "Analysts create demos" ON public.demos;
CREATE POLICY "Analysts create demos"
  ON public.demos FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

-- ─── 4. pour_issues: rewrite manager patterns ────────────────

DROP POLICY "Managers manage POUR" ON public.pour_issues;
CREATE POLICY "Managers manage POUR"
  ON public.pour_issues FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'manager')
  WITH CHECK (public.current_user_role() = 'manager');

DROP POLICY "Analysts create pour_issues" ON public.pour_issues;
CREATE POLICY "Analysts create pour_issues"
  ON public.pour_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = pour_issues.demo_id
      AND demos.analyst_id = auth.uid()
    )
    OR public.current_user_role() = 'manager'
  );

-- ─── 5. demo_drafts / teachers / agent_configs / task_queue ──

DROP POLICY "Analyst reads own drafts" ON public.demo_drafts;
CREATE POLICY "Analyst reads own drafts"
  ON public.demo_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = demo_drafts.demo_id
      AND demos.analyst_id = auth.uid()
    )
    OR public.current_user_role() = 'manager'
  );

DROP POLICY "Managers manage teachers" ON public.teachers;
CREATE POLICY "Managers manage teachers"
  ON public.teachers FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'manager')
  WITH CHECK (public.current_user_role() = 'manager');

DROP POLICY "Managers manage agent configs" ON public.agent_configs;
CREATE POLICY "Managers manage agent configs"
  ON public.agent_configs FOR ALL
  TO authenticated
  USING      (public.current_user_role() = 'manager')
  WITH CHECK (public.current_user_role() = 'manager');

DROP POLICY "Managers read task queue" ON public.task_queue;
CREATE POLICY "Managers read task queue"
  ON public.task_queue FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'manager');
