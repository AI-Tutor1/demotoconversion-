-- Widen the demos INSERT policy so sales agents can also log new demos.
-- Previously only analyst/manager could INSERT; sales now submit the initial
-- demo row and the analyst reviews/updates the scorecard later.

DROP POLICY IF EXISTS "Analysts create demos" ON public.demos;

CREATE POLICY "Authenticated roles create demos"
  ON public.demos FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'sales_agent', 'manager'));
