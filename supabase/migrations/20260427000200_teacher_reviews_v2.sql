-- ─────────────────────────────────────────────────────────────────
--  teacher_reviews v2 — scope toggle + user-controlled review date.
--
--  Changes from 20260427000100:
--    1. ADD review_scope TEXT — 'general' (about the teacher overall)
--       or 'enrollment' (specific enrollment context). Student reviews
--       always 'enrollment' (it's the student's voice from a class).
--    2. ADD review_date DATE — date the review pertains to (the teaching
--       event, not the time the analyst logged it). Defaults to today.
--    3. REPLACE teacher_reviews_enrollment_required CHECK with a
--       scope-aware invariant.
--    4. RECREATE add_teacher_review with two new params (p_review_scope,
--       p_review_date). Old 10-arg signature dropped.
--
--  No data backfill needed — table is empty after Phase 0 testing.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.teacher_reviews
  ADD COLUMN review_scope TEXT NOT NULL DEFAULT 'enrollment'
    CHECK (review_scope IN ('general','enrollment')),
  ADD COLUMN review_date  DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX teacher_reviews_review_date_idx ON public.teacher_reviews (review_date DESC);
CREATE INDEX teacher_reviews_scope_idx       ON public.teacher_reviews (review_scope);

ALTER TABLE public.teacher_reviews
  DROP CONSTRAINT teacher_reviews_enrollment_required;

ALTER TABLE public.teacher_reviews
  ADD CONSTRAINT teacher_reviews_scope_invariants CHECK (
    (review_scope = 'enrollment' AND enrollment_id IS NOT NULL)
    OR
    (review_scope = 'general' AND enrollment_id IS NULL AND review_type <> 'student')
  );

-- Drop old RPC signature and recreate with two new parameters
DROP FUNCTION IF EXISTS public.add_teacher_review(
  TEXT, TEXT, TEXT, TEXT, BIGINT, INT, TEXT, TEXT, TEXT, JSONB
);

CREATE OR REPLACE FUNCTION public.add_teacher_review(
  p_review_type        TEXT,
  p_review_scope       TEXT,
  p_teacher_user_id    TEXT,
  p_teacher_user_name  TEXT,
  p_enrollment_id      TEXT,
  p_session_id         BIGINT,
  p_review_date        DATE,
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
  v_scope TEXT := COALESCE(p_review_scope, 'enrollment');
  v_date  DATE := COALESCE(p_review_date, CURRENT_DATE);
BEGIN
  IF v_role NOT IN ('analyst','manager','hr') THEN
    RAISE EXCEPTION 'Only analyst, manager, or hr may add a teacher review';
  END IF;

  IF p_review_type NOT IN ('product','student','excellence') THEN
    RAISE EXCEPTION 'Invalid review_type: %', p_review_type;
  END IF;

  IF v_scope NOT IN ('general','enrollment') THEN
    RAISE EXCEPTION 'Invalid review_scope: %', v_scope;
  END IF;

  IF p_review_type = 'student' AND v_scope <> 'enrollment' THEN
    RAISE EXCEPTION 'Student reviews must be about a specific enrollment';
  END IF;

  IF v_scope = 'enrollment' AND COALESCE(trim(p_enrollment_id), '') = '' THEN
    RAISE EXCEPTION 'Enrollment ID is required when review scope is enrollment';
  END IF;

  IF p_review_type = 'student' AND COALESCE(trim(p_student_verbatim), '') = '' THEN
    RAISE EXCEPTION 'Student verbatim quote is required for student reviews';
  END IF;

  IF p_overall_rating IS NOT NULL AND (p_overall_rating < 1 OR p_overall_rating > 5) THEN
    RAISE EXCEPTION 'Overall rating must be between 1 and 5';
  END IF;

  -- Snapshot enrollment context only for enrollment-scoped reviews.
  -- General reviews intentionally store NULL/empty for these fields so
  -- nothing stale leaks in if the user typed an enrollment then switched
  -- scope to General before submit.
  IF v_scope = 'enrollment' THEN
    SELECT * INTO v_enr FROM public.enrollments WHERE enrollment_id = p_enrollment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enrollment % not found', p_enrollment_id;
    END IF;
  END IF;

  SELECT full_name INTO v_uname FROM public.users WHERE id = v_uid;

  INSERT INTO public.teacher_reviews (
    review_type, review_scope, review_date,
    teacher_user_id, teacher_user_name,
    enrollment_id, student_user_id, student_user_name,
    session_id,
    subject, grade, curriculum, board,
    overall_rating, summary, improvement_notes, student_verbatim,
    review_data,
    created_by, created_by_name, created_by_role
  ) VALUES (
    p_review_type, v_scope, v_date,
    p_teacher_user_id, p_teacher_user_name,
    CASE WHEN v_scope = 'enrollment' THEN NULLIF(trim(p_enrollment_id), '') ELSE NULL END,
    CASE WHEN v_scope = 'enrollment' THEN v_enr.student_id ELSE NULL END,
    CASE WHEN v_scope = 'enrollment' THEN v_enr.student_name ELSE NULL END,
    CASE WHEN v_scope = 'enrollment' THEN p_session_id ELSE NULL END,
    CASE WHEN v_scope = 'enrollment' THEN COALESCE(v_enr.subject, '')   ELSE '' END,
    CASE WHEN v_scope = 'enrollment' THEN COALESCE(v_enr.grade, '')     ELSE '' END,
    CASE WHEN v_scope = 'enrollment' THEN COALESCE(v_enr.curriculum, '') ELSE '' END,
    CASE WHEN v_scope = 'enrollment' THEN COALESCE(v_enr.board, '')     ELSE '' END,
    p_overall_rating, COALESCE(p_summary, ''),
    COALESCE(p_improvement_notes, ''), COALESCE(p_student_verbatim, ''),
    COALESCE(p_review_data, '{}'::jsonb),
    v_uid, COALESCE(v_uname, ''), v_role
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.add_teacher_review(
  TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, DATE, INT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_teacher_review(
  TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, DATE, INT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;
