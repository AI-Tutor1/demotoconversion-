-- ============================================================
-- RPCs for the HR / Teacher Onboarding pipeline
-- ============================================================
-- All four are SECURITY INVOKER so the caller's RLS applies. Role-specific
-- checks are inside the function body for fields that need finer-grained
-- rules than row-level policies can express (e.g. analyst may call
-- update_teacher_profile but may not mutate tid/status/approval columns).
-- ============================================================

-- ─── upsert_teacher_candidate(payload) ─────────────────────
-- HR / manager only. INSERT or UPDATE by hr_application_number.
-- Returns { id, status }. Called by the New Candidate form.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_teacher_candidate(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id     uuid;
  v_status text;
BEGIN
  IF public.current_user_role() NOT IN ('hr','manager') THEN
    RAISE EXCEPTION 'Only hr or manager may create teacher candidates';
  END IF;

  INSERT INTO public.teacher_profiles (
    hr_application_number, phone_number, email, first_name, last_name,
    cv_link, qualification, subjects_interested, created_by
  ) VALUES (
    payload->>'hr_application_number',
    payload->>'phone_number',
    NULLIF(payload->>'email', ''),
    payload->>'first_name',
    payload->>'last_name',
    NULLIF(payload->>'cv_link', ''),
    NULLIF(payload->>'qualification', ''),
    CASE
      WHEN payload ? 'subjects_interested'
        THEN ARRAY(SELECT jsonb_array_elements_text(payload->'subjects_interested'))
      ELSE NULL
    END,
    auth.uid()
  )
  ON CONFLICT (hr_application_number) DO UPDATE SET
    phone_number        = EXCLUDED.phone_number,
    email               = EXCLUDED.email,
    first_name          = EXCLUDED.first_name,
    last_name           = EXCLUDED.last_name,
    cv_link             = EXCLUDED.cv_link,
    qualification       = EXCLUDED.qualification,
    subjects_interested = EXCLUDED.subjects_interested,
    updated_at          = NOW()
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_teacher_candidate(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_teacher_candidate(jsonb) TO authenticated;


-- ─── submit_interview(...) ─────────────────────────────────
-- HR / manager only. Sets interview fields, transitions candidate ↦
-- interview_scheduled, enqueues the Groq transcription task.
-- ============================================================

-- NOTE: parameter names use `p_*` prefix to avoid PL/pgSQL identifier
-- collision with the `teaching_matrix` column inside the UPDATE.
-- SECURITY DEFINER: the function INSERTs into task_queue, which has no
-- role-scoped INSERT policy (service_role bypasses RLS for normal writes).
-- The function body role-checks at the top, so DEFINER is safe.
CREATE OR REPLACE FUNCTION public.submit_interview(
  p_id               uuid,
  p_recording_link   text,
  p_teaching_matrix  jsonb,
  p_notes            text,
  p_interview_rubric jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.current_user_role() NOT IN ('hr','manager') THEN
    RAISE EXCEPTION 'Only hr or manager may submit an interview';
  END IF;

  -- Do NOT enqueue a task_queue row here. The backend POST
  -- /api/v1/hr-interviews/{id}/process-recording owns task_queue
  -- lifecycle for HR interviews (mirrors how sessions work). Pre-enqueueing
  -- a 'queued' row caused the backend's idempotency check to 409 every
  -- time a user clicked "Transcribe + Analyze" (2026-04-20).
  --
  -- Also: only move 'candidate' → 'interview_scheduled'. Otherwise leave
  -- status alone so re-saving an already-approved profile doesn't demote it.
  UPDATE public.teacher_profiles
  SET interview_recording_link = p_recording_link,
      teaching_matrix          = p_teaching_matrix,
      interview_notes          = p_notes,
      interview_rubric         = COALESCE(p_interview_rubric, interview_rubric),
      status                   = CASE
                                   WHEN status = 'candidate' THEN 'interview_scheduled'
                                   ELSE status
                                 END,
      updated_at               = NOW()
  WHERE id = p_id
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'teacher_profiles row % not found', p_id;
  END IF;

  RETURN jsonb_build_object('id', p_id, 'status', v_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_interview(uuid, text, jsonb, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_interview(uuid, text, jsonb, text) TO authenticated;


-- ─── finalize_teacher_decision(...) ────────────────────────
-- HR / manager only. Atomic transition to approved / pending / rejected.
-- approved REQUIRES a non-null p_tid (enforced both here and by the
-- teacher_profiles_approval_invariant trigger).
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_teacher_decision(
  p_id             uuid,
  outcome          text,
  p_tid            bigint,
  p_reject_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('hr','manager') THEN
    RAISE EXCEPTION 'Only hr or manager may finalise a teacher decision';
  END IF;

  IF outcome NOT IN ('approved','pending','rejected') THEN
    RAISE EXCEPTION 'Invalid outcome: % (expected approved|pending|rejected)', outcome;
  END IF;

  IF outcome = 'approved' AND p_tid IS NULL THEN
    RAISE EXCEPTION 'Approval requires a Teacher User Number (p_tid)';
  END IF;

  IF outcome = 'approved' THEN
    UPDATE public.teacher_profiles
    SET status       = 'approved',
        tid          = p_tid,
        approved_at  = NOW(),
        approved_by  = auth.uid(),
        updated_at   = NOW()
    WHERE id = p_id;
  ELSIF outcome = 'pending' THEN
    UPDATE public.teacher_profiles
    SET status      = 'pending',
        updated_at  = NOW()
    WHERE id = p_id;
  ELSIF outcome = 'rejected' THEN
    UPDATE public.teacher_profiles
    SET status         = 'rejected',
        reject_reason  = p_reject_reason,
        rejected_at    = NOW(),
        rejected_by    = auth.uid(),
        updated_at     = NOW()
    WHERE id = p_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'teacher_profiles row % not found', p_id;
  END IF;

  RETURN jsonb_build_object('id', p_id, 'outcome', outcome);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_teacher_decision(uuid, text, bigint, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.finalize_teacher_decision(uuid, text, bigint, text) TO authenticated;


-- ─── update_teacher_profile(payload) ───────────────────────
-- HR / manager / ANALYST. Whitelists non-sensitive columns. Silently
-- ignores any attempt to mutate tid / status / approval / rejection fields
-- — callers cannot bypass the finalize RPC by sending extra payload keys.
-- SECURITY DEFINER so analyst (who has no raw UPDATE grant) can still
-- edit their whitelisted columns via this path.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_teacher_profile(
  p_id     uuid,
  payload  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role();
  IF v_role NOT IN ('hr','manager','analyst') THEN
    RAISE EXCEPTION 'Role % may not edit teacher profiles', v_role;
  END IF;

  UPDATE public.teacher_profiles SET
    first_name          = COALESCE(payload->>'first_name',          first_name),
    last_name           = COALESCE(payload->>'last_name',           last_name),
    email               = CASE WHEN payload ? 'email'         THEN NULLIF(payload->>'email','')         ELSE email         END,
    phone_number        = COALESCE(payload->>'phone_number',        phone_number),
    cv_link             = CASE WHEN payload ? 'cv_link'       THEN NULLIF(payload->>'cv_link','')       ELSE cv_link       END,
    qualification       = CASE WHEN payload ? 'qualification' THEN NULLIF(payload->>'qualification','') ELSE qualification END,
    subjects_interested = CASE
      WHEN payload ? 'subjects_interested'
        THEN ARRAY(SELECT jsonb_array_elements_text(payload->'subjects_interested'))
      ELSE subjects_interested
    END,
    teaching_matrix     = CASE WHEN payload ? 'teaching_matrix' THEN payload->'teaching_matrix' ELSE teaching_matrix END,
    interview_notes     = CASE WHEN payload ? 'interview_notes' THEN NULLIF(payload->>'interview_notes','') ELSE interview_notes END,
    interview_rubric    = CASE WHEN payload ? 'interview_rubric' THEN payload->'interview_rubric' ELSE interview_rubric END,
    updated_at          = NOW()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'teacher_profiles row % not found', p_id;
  END IF;

  RETURN jsonb_build_object('id', p_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_teacher_profile(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_teacher_profile(uuid, jsonb) TO authenticated;
