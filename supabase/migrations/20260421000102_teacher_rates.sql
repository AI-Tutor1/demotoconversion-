-- ============================================================
-- teacher_rates — per (curriculum, level, grade, subject) hourly rate matrix
-- ============================================================
-- A tutor can quote different rates for every grade of a subject (e.g. IGCSE
-- Biology Grade 9 and Grade 10 may be priced differently). Normalised so
-- that per-row validation and "find tutors <2000 PKR for IGCSE Bio Grade 9"
-- search are trivial. CASCADE on profile delete keeps the side-table in sync.
-- ============================================================

CREATE TABLE public.teacher_rates (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_profile_id  UUID         NOT NULL REFERENCES public.teacher_profiles(id) ON DELETE CASCADE,
  curriculum          TEXT         NOT NULL,
  level               TEXT         NOT NULL,
  grade               TEXT         NOT NULL,
  subject             TEXT         NOT NULL,
  rate_per_hour       NUMERIC(10,2) NOT NULL CHECK (rate_per_hour > 0),
  currency            TEXT         NOT NULL DEFAULT 'PKR',
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_profile_id, curriculum, level, grade, subject)
);

CREATE INDEX idx_teacher_rates_profile  ON public.teacher_rates (teacher_profile_id);
CREATE INDEX idx_teacher_rates_search   ON public.teacher_rates (curriculum, level, subject);

CREATE TRIGGER teacher_rates_updated_at
  BEFORE UPDATE ON public.teacher_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
