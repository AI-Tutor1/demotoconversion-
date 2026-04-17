-- Migration: widen task_queue SELECT to all authenticated users.
-- Previously only managers could SELECT task_queue. Analysts need to read
-- it to check whether a demo is already being processed (running/queued)
-- before auto-triggering a new AI pipeline run on the dashboard — this is
-- the gate that prevents the "thundering herd" cost bomb on page load.

DROP POLICY IF EXISTS "Managers read task queue" ON public.task_queue;

CREATE POLICY "Authenticated users read task queue"
  ON public.task_queue FOR SELECT
  TO authenticated
  USING (true);
