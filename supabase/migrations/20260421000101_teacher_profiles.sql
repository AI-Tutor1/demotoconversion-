-- ============================================================
-- teacher_profiles — candidate & teacher master record
-- ============================================================
-- Single table, status-gated visibility. Mirrors the demos.status pattern
-- already present in the codebase. Candidates start as status='candidate';
-- transition through 'interview_scheduled' → 'pending' | 'approved' | 'rejected'.
-- Only status='approved' rows are visible to analyst / sales_agent (RLS
-- policy in 20260421000104).
--
-- The invariant "approved ⇔ tid IS NOT NULL" is enforced by the trigger
-- at the bottom of this file. The finalize_teacher_decision RPC is the
-- only sanctioned path to flip a row into the approved state.
-- ============================================================

CREATE TABLE public.teacher_profiles (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_application_number    TEXT         NOT NULL UNIQUE,
  phone_number             TEXT         NOT NULL,
  email                    TEXT,
  first_name               TEXT         NOT NULL,
  last_name                TEXT         NOT NULL,
  cv_link                  TEXT,
  qualification            TEXT,
  subjects_interested      TEXT[],
  teaching_matrix          JSONB,                  -- [{level, subject, curriculum}]
  interview_recording_link TEXT,
  interview_notes          TEXT,
  interview_rubric         JSONB,                 -- structured HR answers; see lib/types.ts HR_INTERVIEW_QUESTIONS
  status                   TEXT         NOT NULL DEFAULT 'candidate'
                           CHECK (status IN
                             ('candidate','interview_scheduled','pending','approved','rejected','archived')),
  tid                      BIGINT       UNIQUE,    -- Teacher User Number; NULL until approved
  approved_at              TIMESTAMPTZ,
  approved_by              UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at              TIMESTAMPTZ,
  rejected_by              UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  reject_reason            TEXT,
  created_by               UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_teacher_profiles_phone_app
  ON public.teacher_profiles (phone_number, hr_application_number);
CREATE INDEX idx_teacher_profiles_status ON public.teacher_profiles (status);
CREATE INDEX idx_teacher_profiles_tid
  ON public.teacher_profiles (tid) WHERE tid IS NOT NULL;
CREATE INDEX idx_teacher_profiles_names
  ON public.teacher_profiles (last_name, first_name);

-- Reuse the generic set_updated_at trigger function defined in the initial schema.
CREATE TRIGGER teacher_profiles_updated_at
  BEFORE UPDATE ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Invariant: status='approved' ⇔ tid IS NOT NULL ──────────
CREATE OR REPLACE FUNCTION public.teacher_profiles_enforce_approval_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.tid IS NULL THEN
    RAISE EXCEPTION 'teacher_profiles: status=approved requires tid (Teacher User Number) to be set';
  END IF;
  IF NEW.tid IS NOT NULL AND NEW.status NOT IN ('approved','archived') THEN
    RAISE EXCEPTION 'teacher_profiles: tid may only be set on approved/archived rows (got status=%)', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER teacher_profiles_approval_invariant
  BEFORE INSERT OR UPDATE ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.teacher_profiles_enforce_approval_invariant();
