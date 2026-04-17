-- ============================================================
-- Product Review Workflow — Extend task_queue for sessions
-- Add nullable session_id column alongside existing demo_id
-- ============================================================

ALTER TABLE public.task_queue
  ADD COLUMN session_id BIGINT REFERENCES public.sessions(id) ON DELETE CASCADE;

CREATE INDEX idx_tasks_session ON public.task_queue(session_id) WHERE session_id IS NOT NULL;
