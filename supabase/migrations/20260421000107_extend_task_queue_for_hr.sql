-- ============================================================
-- Extend task_queue for HR interview pipeline
-- ============================================================
-- Adds a nullable teacher_profile_id FK so the existing task_queue can
-- track hr_interview_ingest / hr_interview_analyst tasks without creating
-- a parallel queue. agent_name is already TEXT — no CHECK widening needed.
-- Existing demos / sessions tasks keep demo_id / session_id as before.
-- ============================================================

ALTER TABLE public.task_queue
  ADD COLUMN IF NOT EXISTS teacher_profile_id UUID
    REFERENCES public.teacher_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_teacher_profile
  ON public.task_queue (teacher_profile_id);

-- Extend SELECT RLS so hr can read their own pipeline tasks. We keep the
-- existing analyst/manager policies intact by adding a new policy rather
-- than editing in place. (Migration 20260415000007 widened task_queue
-- SELECT for analyst/manager — we mirror that pattern for hr.)

CREATE POLICY "hr read own hr_interview tasks"
  ON public.task_queue FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'hr'
    AND teacher_profile_id IS NOT NULL
  );
