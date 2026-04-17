-- Sales agents need SELECT on demo_drafts for demos they own.
-- The original "Analyst reads own drafts" policy checks demos.analyst_id = auth.uid(),
-- but sales-created demos start with analyst_id IS NULL — so the policy never matched,
-- silently blocking sales agents from seeing the AI analysis of their own submissions.
--
-- Secondary fix: widen the analyst policy to cover unassigned demos (analyst_id IS NULL),
-- mirroring the "Analysts read own and unassigned demos" policy on the demos table.

-- 1. Grant sales agents read access to drafts for demos assigned to them
CREATE POLICY "Sales agents read drafts for own demos"
  ON public.demo_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = demo_drafts.demo_id
        AND demos.sales_agent_id = auth.uid()
    )
  );

-- 2. Widen analyst policy to include unassigned demos (analyst_id IS NULL)
DROP POLICY IF EXISTS "Analyst reads own drafts" ON public.demo_drafts;

CREATE POLICY "Analyst reads own and unassigned drafts"
  ON public.demo_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demos
      JOIN public.users ON users.id = auth.uid()
      WHERE demos.id = demo_drafts.demo_id
        AND users.role IN ('analyst', 'manager')
        AND (demos.analyst_id = auth.uid() OR demos.analyst_id IS NULL)
    )
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
  );
