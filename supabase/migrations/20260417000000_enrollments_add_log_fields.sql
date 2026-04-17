-- ============================================================
-- Enrollments — add LMS log fields
-- The enrollments page ingests the pause/resume log CSV, which
-- carries pause dates, permanence flag, action attribution, and
-- free-text notes alongside the enrollment metadata.
-- ============================================================

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS pause_starts     DATE,
  ADD COLUMN IF NOT EXISTS pause_ends       DATE,
  ADD COLUMN IF NOT EXISTS is_permanent     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS action_by        TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS additional_notes TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS log_id           BIGINT,
  ADD COLUMN IF NOT EXISTS log_created_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_enrollments_action_by ON public.enrollments(action_by);
CREATE INDEX IF NOT EXISTS idx_enrollments_log_id    ON public.enrollments(log_id);
