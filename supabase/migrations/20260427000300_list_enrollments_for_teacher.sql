-- ─────────────────────────────────────────────────────────────────
--  list_enrollments_for_teacher — drives the enrollment dropdown in
--  the manual-review drawer on /teachers. SECURITY DEFINER + role
--  check so HR (which lacks SELECT on enrollments per RLS) can list
--  enrollments without a broader RLS change.
--
--  Also promotes lookup_enrollment_for_review to SECURITY DEFINER for
--  the same reason — under INVOKER, an HR user's call to that function
--  silently returned {found: false} because the inner SELECT against
--  enrollments was RLS-blocked. Latent bug from migration 20260427000100.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_enrollments_for_teacher(
  p_teacher_id TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF public.current_user_role() NOT IN ('analyst','manager','hr') THEN
    RAISE EXCEPTION 'Only analyst, manager, or hr may list enrollments';
  END IF;

  IF p_teacher_id IS NULL OR trim(p_teacher_id) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(e ORDER BY (e->>'enrollment_id')), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'enrollment_id',     enrollment_id,
        'student_id',        student_id,
        'student_name',      student_name,
        'subject',           subject,
        'grade',             grade,
        'curriculum',        curriculum,
        'enrollment_status', enrollment_status
      ) AS e
      FROM public.enrollments
      WHERE teacher_id = p_teacher_id
      ORDER BY enrollment_id
    ) t;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.list_enrollments_for_teacher(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_enrollments_for_teacher(TEXT) TO authenticated;

-- Promote lookup_enrollment_for_review to DEFINER (same body; only the
-- security level changes). Under INVOKER, HR users hit RLS on the inner
-- SELECT and got back {found:false} regardless of whether the enrollment
-- existed. The function already enforces the analyst/manager/hr role
-- check inline, so DEFINER is safe.
CREATE OR REPLACE FUNCTION public.lookup_enrollment_for_review(
  p_enrollment_id TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
