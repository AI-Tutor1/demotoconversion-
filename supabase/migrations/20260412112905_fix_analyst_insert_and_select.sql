-- ============================================================
-- Fix: add analyst INSERT policy, tighten analyst SELECT scope
-- ============================================================
-- Two corrections to the Step 2 RLS baseline:
--   1. Without an INSERT policy on demos, the analyst form in Step 4 would
--      fail to create new demos (only managers could via "Managers full access").
--   2. The "Sales agents read own demos" SELECT policy contained a blanket
--      `role IN ('analyst', 'manager')` clause that gave analysts read access
--      to every demo in the system, defeating multi-user data isolation.
--      Replaced with `sales_agent_id = auth.uid()` so sales agents see only
--      their own leads. Managers remain covered by "Managers full access demos"
--      (FOR ALL). Analysts still see their own + unassigned via the existing
--      "Analysts read own and unassigned demos" policy.
-- ============================================================

-- ─── Fix 1: INSERT policies ───────────────────────────────────

CREATE POLICY "Analysts create demos"
  ON public.demos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('analyst', 'manager'))
  );

CREATE POLICY "Analysts create pour_issues"
  ON public.pour_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = pour_issues.demo_id
      AND demos.analyst_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
  );

-- ─── Fix 2: tighten sales SELECT (removes the blanket analyst pass) ───────

DROP POLICY "Sales agents read own demos" ON public.demos;

CREATE POLICY "Sales agents read own demos"
  ON public.demos FOR SELECT
  TO authenticated
  USING (sales_agent_id = auth.uid());
