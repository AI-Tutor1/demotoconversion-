-- Migration: tighten pour_issues INSERT/DELETE
-- Drops the overly-broad "Authenticated users" policies added by
-- 20260413000009 (which allowed any authenticated role to mutate
-- pour_issues on any demo where analyst_id IS NULL) and replaces them
-- with policies that restrict mutations to analyst + manager only.
-- sales_agent is explicitly excluded.

DROP POLICY IF EXISTS "Authenticated users create pour_issues" ON public.pour_issues;
DROP POLICY IF EXISTS "Authenticated users delete pour_issues" ON public.pour_issues;

CREATE POLICY "Analysts/managers create pour_issues"
  ON public.pour_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'manager'
    OR (
      public.current_user_role() = 'analyst'
      AND EXISTS (
        SELECT 1 FROM public.demos d
        WHERE d.id = pour_issues.demo_id
          AND (d.analyst_id = auth.uid() OR d.analyst_id IS NULL)
      )
    )
  );

CREATE POLICY "Analysts/managers delete pour_issues"
  ON public.pour_issues FOR DELETE
  TO authenticated
  USING (
    public.current_user_role() = 'manager'
    OR (
      public.current_user_role() = 'analyst'
      AND EXISTS (
        SELECT 1 FROM public.demos d
        WHERE d.id = pour_issues.demo_id
          AND (d.analyst_id = auth.uid() OR d.analyst_id IS NULL)
      )
    )
  );
