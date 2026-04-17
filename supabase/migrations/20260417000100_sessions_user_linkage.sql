-- ============================================================
-- Sessions ← User Linkage (teacher + student user_id/user_name)
-- Denormalizes enrollment identity onto sessions so:
--   1. /teachers Product log can filter by teacher_user_name
--   2. future /students/[id] can filter by student_user_id
-- ============================================================

-- 1. Nullable columns (backwards compatible with upsert_sessions RPC)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS teacher_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS teacher_user_name   TEXT,
  ADD COLUMN IF NOT EXISTS student_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS student_user_name   TEXT;

-- 2. Indexes for the two join paths we'll actually use
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_user_name ON public.sessions(teacher_user_name);
CREATE INDEX IF NOT EXISTS idx_sessions_student_user_id   ON public.sessions(student_user_id);

-- 3. One-time backfill from enrollments (denormalize)
UPDATE public.sessions s
   SET teacher_user_id   = e.teacher_id,
       teacher_user_name = e.teacher_name,
       student_user_id   = e.student_id,
       student_user_name = e.student_name
  FROM public.enrollments e
 WHERE s.enrollment_id = e.enrollment_id
   AND (s.teacher_user_id IS NULL OR s.teacher_user_name IS NULL
        OR s.student_user_id IS NULL OR s.student_user_name IS NULL);

-- 4. Trigger: keep sessions in sync on INSERT or enrollment_id UPDATE.
--    Only fills missing fields — caller can still override by providing values.
CREATE OR REPLACE FUNCTION public.populate_session_user_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.teacher_user_id IS NULL OR NEW.teacher_user_name IS NULL
     OR NEW.student_user_id IS NULL OR NEW.student_user_name IS NULL THEN
    SELECT teacher_id, teacher_name, student_id, student_name
      INTO NEW.teacher_user_id, NEW.teacher_user_name,
           NEW.student_user_id, NEW.student_user_name
      FROM public.enrollments
     WHERE enrollment_id = NEW.enrollment_id
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_session_user_fields ON public.sessions;
CREATE TRIGGER trg_populate_session_user_fields
  BEFORE INSERT OR UPDATE OF enrollment_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.populate_session_user_fields();
