-- ============================================================
-- teacher_availability — weekly recurring day-of-week schedule
-- ============================================================
-- 0=Mon … 6=Sun. Multiple slots per day are allowed (a tutor may have
-- two slots bookending a break). Overlaps on the same day are allowed
-- in v1 — explicit overlap/merge validation is out-of-scope. Timezone
-- is stored per row so tutors in different zones interoperate cleanly.
-- ============================================================

CREATE TABLE public.teacher_availability (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_profile_id  UUID         NOT NULL REFERENCES public.teacher_profiles(id) ON DELETE CASCADE,
  day_of_week         SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time          TIME         NOT NULL,
  end_time            TIME         NOT NULL,
  timezone            TEXT         NOT NULL DEFAULT 'Asia/Karachi',
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_teacher_availability_profile
  ON public.teacher_availability (teacher_profile_id);
CREATE INDEX idx_teacher_availability_dow
  ON public.teacher_availability (day_of_week, start_time, end_time);

CREATE TRIGGER teacher_availability_updated_at
  BEFORE UPDATE ON public.teacher_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
