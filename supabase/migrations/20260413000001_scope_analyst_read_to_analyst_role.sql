-- ============================================================
-- Fix: scope "Analysts read own and unassigned demos" to analyst role
-- ============================================================
-- The policy (inherited verbatim from SECURITY.md) allowed ANY
-- authenticated user to read unassigned demos via `analyst_id IS NULL`.
-- Sales agents hit this branch on all 12 seed rows (analyst_id = NULL)
-- and saw the entire pool — breaking role isolation.
--
-- Tightening: the own-and-unassigned branch now requires analyst role;
-- managers remain covered by their separate FOR ALL policy.
-- ============================================================

DROP POLICY "Analysts read own and unassigned demos" ON public.demos;

CREATE POLICY "Analysts read own and unassigned demos"
  ON public.demos FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'manager'
    OR (
      public.current_user_role() = 'analyst'
      AND (analyst_id = auth.uid() OR analyst_id IS NULL)
    )
  );
