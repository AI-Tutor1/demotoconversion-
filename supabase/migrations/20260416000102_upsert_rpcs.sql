-- ============================================================
-- Product Review Workflow — Batch Upsert RPCs
-- SECURITY INVOKER so RLS policies apply to the calling user
-- ============================================================

-- ─── upsert_enrollments ─────────────────────────────────────
-- Accepts a JSON array of enrollment objects.
-- ON CONFLICT on enrollment_id → updates all mutable fields.
-- Returns: count of rows processed.
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
      enrollment_status, consumer_type
    ) VALUES (
      v_row->>'enrollment_id',
      v_row->>'teacher_id',
      v_row->>'student_id',
      v_row->>'teacher_name',
      v_row->>'student_name',
      COALESCE(v_row->>'subject', ''),
      COALESCE(v_row->>'grade', ''),
      COALESCE(v_row->>'board', ''),
      COALESCE(v_row->>'curriculum', ''),
      NULLIF(v_row->>'session_hourly_rate', '')::numeric,
      NULLIF(v_row->>'tutor_hourly_rate', '')::numeric,
      COALESCE(v_row->>'enrollment_status', ''),
      COALESCE(v_row->>'consumer_type', '')
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
      updated_at          = NOW();

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ─── upsert_sessions ────────────────────────────────────────
-- Accepts a JSON array of session objects.
-- ON CONFLICT on session_id → updates all mutable fields.
-- Returns: count of rows processed + array of internal IDs
-- for sessions that have a non-empty recording_link (for auto-trigger).
CREATE OR REPLACE FUNCTION public.upsert_sessions(payload jsonb)
RETURNS TABLE(upserted_count integer, auto_trigger_ids bigint[])
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_count       integer  := 0;
  v_row         jsonb;
  v_sid         bigint;
  v_trigger_ids bigint[] := '{}';
  v_has_link    boolean;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    v_has_link := COALESCE(NULLIF(TRIM(v_row->>'recording_link'), ''), NULL) IS NOT NULL;

    INSERT INTO public.sessions (
      session_id, enrollment_id, scheduled_time, tutor_name,
      expected_student_1, expected_student_2,
      subject, board, grade, curriculum, enrollment_name,
      tutor_class_time, tutor_scaled_class_time, class_scheduled_duration,
      student_1_class_time, student_2_class_time,
      session_date, class_status, notes,
      attended_student_1, attended_student_2,
      teacher_transaction_1, student_transaction_1, student_transaction_2,
      recording_link
    ) VALUES (
      v_row->>'session_id',
      v_row->>'enrollment_id',
      NULLIF(v_row->>'scheduled_time', '')::timestamptz,
      COALESCE(v_row->>'tutor_name', ''),
      COALESCE(v_row->>'expected_student_1', ''),
      COALESCE(v_row->>'expected_student_2', ''),
      COALESCE(v_row->>'subject', ''),
      COALESCE(v_row->>'board', ''),
      COALESCE(v_row->>'grade', ''),
      COALESCE(v_row->>'curriculum', ''),
      COALESCE(v_row->>'enrollment_name', ''),
      NULLIF(v_row->>'tutor_class_time', '')::numeric,
      NULLIF(v_row->>'tutor_scaled_class_time', '')::numeric,
      NULLIF(v_row->>'class_scheduled_duration', '')::numeric,
      NULLIF(v_row->>'student_1_class_time', '')::numeric,
      NULLIF(v_row->>'student_2_class_time', '')::numeric,
      NULLIF(v_row->>'session_date', '')::date,
      COALESCE(v_row->>'class_status', ''),
      COALESCE(v_row->>'notes', ''),
      NULLIF(v_row->>'attended_student_1', '')::boolean,
      NULLIF(v_row->>'attended_student_2', '')::boolean,
      COALESCE(v_row->>'teacher_transaction_1', ''),
      COALESCE(v_row->>'student_transaction_1', ''),
      COALESCE(v_row->>'student_transaction_2', ''),
      COALESCE(v_row->>'recording_link', '')
    )
    ON CONFLICT (session_id) DO UPDATE SET
      enrollment_id            = EXCLUDED.enrollment_id,
      scheduled_time           = EXCLUDED.scheduled_time,
      tutor_name               = EXCLUDED.tutor_name,
      expected_student_1       = EXCLUDED.expected_student_1,
      expected_student_2       = EXCLUDED.expected_student_2,
      subject                  = EXCLUDED.subject,
      board                    = EXCLUDED.board,
      grade                    = EXCLUDED.grade,
      curriculum               = EXCLUDED.curriculum,
      enrollment_name          = EXCLUDED.enrollment_name,
      tutor_class_time         = EXCLUDED.tutor_class_time,
      tutor_scaled_class_time  = EXCLUDED.tutor_scaled_class_time,
      class_scheduled_duration = EXCLUDED.class_scheduled_duration,
      student_1_class_time     = EXCLUDED.student_1_class_time,
      student_2_class_time     = EXCLUDED.student_2_class_time,
      session_date             = EXCLUDED.session_date,
      class_status             = EXCLUDED.class_status,
      notes                    = EXCLUDED.notes,
      attended_student_1       = EXCLUDED.attended_student_1,
      attended_student_2       = EXCLUDED.attended_student_2,
      teacher_transaction_1    = EXCLUDED.teacher_transaction_1,
      student_transaction_1    = EXCLUDED.student_transaction_1,
      student_transaction_2    = EXCLUDED.student_transaction_2,
      recording_link           = EXCLUDED.recording_link,
      updated_at               = NOW()
    RETURNING id INTO v_sid;

    v_count := v_count + 1;

    -- Collect IDs of sessions with recording links for auto-trigger
    IF v_has_link THEN
      v_trigger_ids := v_trigger_ids || v_sid;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, v_trigger_ids;
END;
$$;
