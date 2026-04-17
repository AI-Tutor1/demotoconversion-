-- ============================================================
-- upsert_enrollments v2 — handles the LMS log CSV fields:
--   pause_starts, pause_ends, is_permanent, action_by,
--   additional_notes, log_id, log_created_at
-- Same signature (payload jsonb) -> integer; replaces the v1
-- function from 20260416000102_upsert_rpcs.sql in place.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_enrollments(payload jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row   jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    INSERT INTO public.enrollments (
      enrollment_id, teacher_id, student_id, teacher_name, student_name,
      subject, grade, board, curriculum,
      session_hourly_rate, tutor_hourly_rate,
      enrollment_status, consumer_type,
      pause_starts, pause_ends, is_permanent,
      action_by, additional_notes,
      log_id, log_created_at
    ) VALUES (
      v_row->>'enrollment_id',
      COALESCE(v_row->>'teacher_id', ''),
      COALESCE(v_row->>'student_id', ''),
      COALESCE(v_row->>'teacher_name', ''),
      COALESCE(v_row->>'student_name', ''),
      COALESCE(v_row->>'subject', ''),
      COALESCE(v_row->>'grade', ''),
      COALESCE(v_row->>'board', ''),
      COALESCE(v_row->>'curriculum', ''),
      NULLIF(v_row->>'session_hourly_rate', '')::numeric,
      NULLIF(v_row->>'tutor_hourly_rate', '')::numeric,
      COALESCE(v_row->>'enrollment_status', ''),
      COALESCE(v_row->>'consumer_type', ''),
      NULLIF(v_row->>'pause_starts', '')::date,
      NULLIF(v_row->>'pause_ends', '')::date,
      COALESCE(NULLIF(v_row->>'is_permanent', '')::boolean, FALSE),
      COALESCE(v_row->>'action_by', ''),
      COALESCE(v_row->>'additional_notes', ''),
      NULLIF(v_row->>'log_id', '')::bigint,
      NULLIF(v_row->>'log_created_at', '')::timestamptz
    )
    ON CONFLICT (enrollment_id) DO UPDATE SET
      teacher_id          = EXCLUDED.teacher_id,
      student_id          = EXCLUDED.student_id,
      teacher_name        = EXCLUDED.teacher_name,
      student_name        = EXCLUDED.student_name,
      subject             = EXCLUDED.subject,
      grade               = EXCLUDED.grade,
      board               = EXCLUDED.board,
      curriculum          = EXCLUDED.curriculum,
      session_hourly_rate = EXCLUDED.session_hourly_rate,
      tutor_hourly_rate   = EXCLUDED.tutor_hourly_rate,
      enrollment_status   = EXCLUDED.enrollment_status,
      consumer_type       = EXCLUDED.consumer_type,
      pause_starts        = EXCLUDED.pause_starts,
      pause_ends          = EXCLUDED.pause_ends,
      is_permanent        = EXCLUDED.is_permanent,
      action_by           = EXCLUDED.action_by,
      additional_notes    = EXCLUDED.additional_notes,
      log_id              = EXCLUDED.log_id,
      log_created_at      = EXCLUDED.log_created_at,
      updated_at          = NOW();

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
