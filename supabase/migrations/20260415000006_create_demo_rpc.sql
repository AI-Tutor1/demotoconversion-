-- Migration: atomic demo+pour RPCs
--
-- Two SECURITY INVOKER functions so RLS still applies to the caller:
--
--   create_demo_with_pour(demo_payload jsonb, pour_payload jsonb) → bigint
--     Inserts a demos row (BIGSERIAL assigns id, not the caller) and its
--     pour_issues in a single transaction. Returns the server-assigned id.
--
--   update_demo_pour(demo_id bigint, next_pour jsonb) → void
--     Atomically replaces all pour_issues for a demo (DELETE + INSERT in one
--     call), eliminating the gap where the row had no issues between steps.
--
-- Both functions are idempotent to re-apply (CREATE OR REPLACE).

-- ─── create_demo_with_pour ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_demo_with_pour(
  demo_payload jsonb,
  pour_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_demo_id bigint;
  v_rec     public.demos%ROWTYPE;
BEGIN
  -- Coerce JSON to typed record (type-checks all columns against the table def).
  -- The id field in demo_payload is ignored — BIGSERIAL assigns the real id.
  SELECT * INTO v_rec
  FROM jsonb_populate_record(NULL::public.demos, demo_payload);

  -- Insert without id so BIGSERIAL fires.
  INSERT INTO public.demos (
    date, teacher, tid, student, level, grade, subject,
    review, methodology, engagement, student_raw, analyst_rating,
    status, suggestions, improvement,
    agent, comments, verbatim, acct_type, link, recording,
    topic_review, resources_review, effectiveness_review,
    marketing, ts, workflow_stage, sales_agent_id, analyst_id, is_draft,
    feedback_rating, feedback_explanation, feedback_explanation_comment,
    feedback_participation, feedback_participation_comment,
    feedback_confused, feedback_confused_detail,
    feedback_uncomfortable, feedback_uncomfortable_detail,
    feedback_positive_env, feedback_positive_env_comment,
    feedback_suggestions, feedback_comments
  ) VALUES (
    v_rec.date, v_rec.teacher, v_rec.tid, v_rec.student, v_rec.level, v_rec.grade, v_rec.subject,
    v_rec.review, v_rec.methodology, v_rec.engagement, v_rec.student_raw, v_rec.analyst_rating,
    v_rec.status, v_rec.suggestions, v_rec.improvement,
    v_rec.agent, v_rec.comments, v_rec.verbatim, v_rec.acct_type, v_rec.link, v_rec.recording,
    v_rec.topic_review, v_rec.resources_review, v_rec.effectiveness_review,
    v_rec.marketing, v_rec.ts, v_rec.workflow_stage, v_rec.sales_agent_id, v_rec.analyst_id, v_rec.is_draft,
    v_rec.feedback_rating, v_rec.feedback_explanation, v_rec.feedback_explanation_comment,
    v_rec.feedback_participation, v_rec.feedback_participation_comment,
    v_rec.feedback_confused, v_rec.feedback_confused_detail,
    v_rec.feedback_uncomfortable, v_rec.feedback_uncomfortable_detail,
    v_rec.feedback_positive_env, v_rec.feedback_positive_env_comment,
    v_rec.feedback_suggestions, v_rec.feedback_comments
  )
  RETURNING id INTO v_demo_id;

  -- Insert pour_issues if any were supplied.
  IF jsonb_array_length(pour_payload) > 0 THEN
    INSERT INTO public.pour_issues (demo_id, category, description)
    SELECT
      v_demo_id,
      (p->>'category'),
      (p->>'description')
    FROM jsonb_array_elements(pour_payload) AS p
    WHERE (p->>'category') IS NOT NULL;
  END IF;

  RETURN v_demo_id;
END;
$$;

-- ─── update_demo_pour ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_demo_pour(
  p_demo_id bigint,
  next_pour jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Atomic DELETE + INSERT — no window where the demo has zero issues.
  DELETE FROM public.pour_issues
  WHERE pour_issues.demo_id = p_demo_id;

  IF jsonb_array_length(next_pour) > 0 THEN
    INSERT INTO public.pour_issues (demo_id, category, description)
    SELECT
      p_demo_id,
      (p->>'category'),
      (p->>'description')
    FROM jsonb_array_elements(next_pour) AS p
    WHERE (p->>'category') IS NOT NULL;
  END IF;
END;
$$;
