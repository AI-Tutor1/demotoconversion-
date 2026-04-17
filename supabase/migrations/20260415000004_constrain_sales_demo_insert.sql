-- Migration: constrain sales_agent demos INSERT
-- Drops the unconstrained "Authenticated roles create demos" policy
-- from 20260415000000 and replaces it with two separate policies:
--   1. Analysts/managers: unrestricted INSERT (existing behaviour).
--   2. Sales agents: INSERT only allowed when the row satisfies all of:
--      is_draft=TRUE, analyst_id IS NULL, sales_agent_id=auth.uid(),
--      status='Pending', ai_draft_id IS NULL, ai_approval_rate IS NULL.
-- This prevents a sales_agent from inserting a non-draft row, claiming
-- a foreign analyst_id, or front-running AI analysis columns.

DROP POLICY IF EXISTS "Authenticated roles create demos" ON public.demos;

CREATE POLICY "Analysts/managers create demos"
  ON public.demos FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Sales agents create draft demos"
  ON public.demos FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'sales_agent'
    AND is_draft = TRUE
    AND analyst_id IS NULL
    AND sales_agent_id = auth.uid()
    AND status = 'Pending'
    AND ai_draft_id IS NULL
    AND ai_approval_rate IS NULL
  );
