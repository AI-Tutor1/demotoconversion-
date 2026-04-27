-- ─────────────────────────────────────────────────────────────────
--  teacher_reviews — manually-authored reviews about a teacher,
--  independent of the demo pipeline. Three review types:
--    product     — free-form QA review of teaching quality
--    student     — analyst transcribes student-voiced feedback
--                  (verbatim + structured ratings the student gave)
--    excellence  — scheduling / punctuality / attendance /
--                  professional reliability
--
--  Single table, polymorphic via review_type + review_data (jsonb).
--  Stable FK: teacher_user_id (TEXT), matches sessions / enrollments.
--  RPC-only writes (analyst/manager/hr can insert; manager-only delete).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE public.teacher_reviews (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  review_type         TEXT         NOT NULL
                                   CHECK (review_type IN ('product','student','excellence')),

  -- Stable teacher FK + denormalised display name
  teacher_user_id     TEXT         NOT NULL,
  teacher_user_name   TEXT         NOT NULL,

  -- Enrollment context (required for student + excellence)
  enrollment_id       TEXT         NULL REFERENCES public.enrollments(enrollment_id)
                                        ON DELETE SET NULL,
  student_user_id     TEXT         NULL,
  student_user_name   TEXT         NULL,

  -- Optional pin to a specific session (excellence reviews often cite one)
  session_id          BIGINT       NULL REFERENCES public.sessions(id)
                                        ON DELETE SET NULL,

  -- Snapshot of enrollment context at time of review (so display
  -- doesn't break if the enrollment is later edited / paused)
  subject             TEXT         NOT NULL DEFAULT '',
  grade               TEXT         NOT NULL DEFAULT '',
  curriculum          TEXT         NOT NULL DEFAULT '',
  board               TEXT         NOT NULL DEFAULT '',

  -- Common, structured fields
  overall_rating      INT          NULL CHECK (overall_rating BETWEEN 1 AND 5),
  summary             TEXT         NOT NULL DEFAULT '',
  improvement_notes   TEXT         NOT NULL DEFAULT '',

  -- Student review only — required when review_type='student'
  student_verbatim    TEXT         NOT NULL DEFAULT '',

  -- Type-specific rubric answers (see RUBRICS in lib/types.ts)
  -- Shape: { [questionKey]: { value: number|boolean|string|null, note?: string } }
  review_data         JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- Authorship
  created_by          UUID         NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name     TEXT         NOT NULL DEFAULT '',
  created_by_role     TEXT         NOT NULL DEFAULT '',

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Invariants
  CONSTRAINT teacher_reviews_enrollment_required
    CHECK (review_type = 'product' OR enrollment_id IS NOT NULL),
  CONSTRAINT teacher_reviews_student_verbatim_required
    CHECK (review_type <> 'student' OR length(trim(student_verbatim)) > 0)
);

CREATE INDEX teacher_reviews_teacher_idx       ON public.teacher_reviews (teacher_user_id);
CREATE INDEX teacher_reviews_enrollment_idx    ON public.teacher_reviews (enrollment_id);
CREATE INDEX teacher_reviews_session_idx       ON public.teacher_reviews (session_id);
CREATE INDEX teacher_reviews_type_idx          ON public.teacher_reviews (review_type);
CREATE INDEX teacher_reviews_created_at_idx    ON public.teacher_reviews (created_at DESC);

-- Touch updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_teacher_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

CREATE TRIGGER teacher_reviews_touch
  BEFORE UPDATE ON public.teacher_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_teacher_reviews_updated_at();

-- RLS: read-all-authenticated; writes only via SECURITY DEFINER RPCs
ALTER TABLE public.teacher_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_reviews_select_authenticated
  ON public.teacher_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Realtime publication — UI reactivity is non-negotiable
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_reviews;

-- ─── RPCs ─────────────────────────────────────────────────────────

-- 1. Look up an enrollment + recent sessions for the form prefill
CREATE OR REPLACE FUNCTION public.lookup_enrollment_for_review(
  p_enrollment_id TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_enr  RECORD;
  v_sess jsonb;
BEGIN
  IF public.current_user_role() NOT IN ('analyst','manager','hr') THEN
    RAISE EXCEPTION 'Only analyst, manager, or hr may look up enrollments for review';
  END IF;

  SELECT enrollment_id, teacher_id, teacher_name, student_id, student_name,
         subject, grade, board, curriculum, enrollment_status,
         pause_starts, pause_ends, is_permanent, additional_notes
    INTO v_enr
    FROM public.enrollments
   WHERE enrollment_id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- 5 most recent sessions for context
  SELECT COALESCE(jsonb_agg(s ORDER BY (s->>'session_date') DESC NULLS LAST), '[]'::jsonb)
    INTO v_sess
    FROM (
      SELECT jsonb_build_object(
               'id', id,
               'session_id', session_id,
               'session_date', session_date,
               'scheduled_time', scheduled_time,
               'class_status', class_status,
               'attended_student_1', attended_student_1,
               'attended_student_2', attended_student_2,
               'notes', notes,
               'recording_link', recording_link
             ) AS s
        FROM public.sessions
       WHERE enrollment_id = p_enrollment_id
       ORDER BY session_date DESC NULLS LAST, scheduled_time DESC NULLS LAST
       LIMIT 5
    ) t;

  RETURN jsonb_build_object(
    'found', true,
    'enrollment', to_jsonb(v_enr),
    'recent_sessions', COALESCE(v_sess, '[]'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.lookup_enrollment_for_review(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_enrollment_for_review(TEXT) TO authenticated;

-- 2. Insert a manual review
CREATE OR REPLACE FUNCTION public.add_teacher_review(
  p_review_type        TEXT,
  p_teacher_user_id    TEXT,
  p_teacher_user_name  TEXT,
  p_enrollment_id      TEXT,
  p_session_id         BIGINT,
  p_overall_rating     INT,
  p_summary            TEXT,
  p_improvement_notes  TEXT,
  p_student_verbatim   TEXT,
  p_review_data        JSONB
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  TEXT := public.current_user_role();
  v_uid   UUID := auth.uid();
  v_uname TEXT;
  v_enr   RECORD;
  v_id    UUID;
BEGIN
  IF v_role NOT IN ('analyst','manager','hr') THEN
    RAISE EXCEPTION 'Only analyst, manager, or hr may add a teacher review';
  END IF;

  IF p_review_type NOT IN ('product','student','excellence') THEN
    RAISE EXCEPTION 'Invalid review_type: %', p_review_type;
  END IF;

  IF p_review_type IN ('student','excellence') AND COALESCE(trim(p_enrollment_id), '') = '' THEN
    RAISE EXCEPTION 'Enrollment ID is required for % reviews', p_review_type;
  END IF;

  IF p_review_type = 'student' AND COALESCE(trim(p_student_verbatim), '') = '' THEN
    RAISE EXCEPTION 'Student verbatim quote is required for student reviews';
  END IF;

  IF p_overall_rating IS NOT NULL AND (p_overall_rating < 1 OR p_overall_rating > 5) THEN
    RAISE EXCEPTION 'Overall rating must be between 1 and 5';
  END IF;

  -- Snapshot enrollment context (subject/grade/curriculum/board + student)
  IF p_enrollment_id IS NOT NULL AND trim(p_enrollment_id) <> '' THEN
    SELECT * INTO v_enr FROM public.enrollments WHERE enrollment_id = p_enrollment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enrollment % not found', p_enrollment_id;
    END IF;
  END IF;

  -- Reviewer display name
  SELECT full_name INTO v_uname FROM public.users WHERE id = v_uid;

  INSERT INTO public.teacher_reviews (
    review_type, teacher_user_id, teacher_user_name,
    enrollment_id, student_user_id, student_user_name,
    session_id,
    subject, grade, curriculum, board,
    overall_rating, summary, improvement_notes, student_verbatim,
    review_data,
    created_by, created_by_name, created_by_role
  ) VALUES (
    p_review_type, p_teacher_user_id, p_teacher_user_name,
    NULLIF(trim(p_enrollment_id), ''), v_enr.student_id, v_enr.student_name,
    p_session_id,
    COALESCE(v_enr.subject, ''), COALESCE(v_enr.grade, ''),
    COALESCE(v_enr.curriculum, ''), COALESCE(v_enr.board, ''),
    p_overall_rating, COALESCE(p_summary, ''),
    COALESCE(p_improvement_notes, ''), COALESCE(p_student_verbatim, ''),
    COALESCE(p_review_data, '{}'::jsonb),
    v_uid, COALESCE(v_uname, ''), v_role
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.add_teacher_review(
  TEXT, TEXT, TEXT, TEXT, BIGINT, INT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_teacher_review(
  TEXT, TEXT, TEXT, TEXT, BIGINT, INT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

-- 3. Manager-only delete
CREATE OR REPLACE FUNCTION public.delete_teacher_review(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'manager' THEN
    RAISE EXCEPTION 'Only manager may delete a teacher review';
  END IF;
  DELETE FROM public.teacher_reviews WHERE id = p_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.delete_teacher_review(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_teacher_review(UUID) TO authenticated;
