-- ============================================================
-- Add tier column to teacher_profiles + update RPCs
-- ============================================================
-- 5 tiers: Tier 01 (highest) → Tier 05 (lowest).
-- NULL until explicitly set (supports legacy/backfilled rows).
-- ============================================================

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS tier TEXT
    CHECK (tier IN ('Tier 01','Tier 02','Tier 03','Tier 04','Tier 05'));

-- ─── upsert_teacher_candidate — add tier support ────────────
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
    cv_link, qualification, subjects_interested, tier, created_by
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
    NULLIF(payload->>'tier', ''),
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
    tier                = COALESCE(EXCLUDED.tier, teacher_profiles.tier),
    updated_at          = NOW()
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_teacher_candidate(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_teacher_candidate(jsonb) TO authenticated;


-- ─── update_teacher_profile — add tier to whitelist ─────────
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
    teaching_matrix     = CASE WHEN payload ? 'teaching_matrix'  THEN payload->'teaching_matrix'                ELSE teaching_matrix  END,
    interview_notes     = CASE WHEN payload ? 'interview_notes'  THEN NULLIF(payload->>'interview_notes','')    ELSE interview_notes  END,
    interview_rubric    = CASE WHEN payload ? 'interview_rubric' THEN payload->'interview_rubric'               ELSE interview_rubric END,
    tier                = CASE WHEN payload ? 'tier'             THEN NULLIF(payload->>'tier','')               ELSE tier             END,
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
