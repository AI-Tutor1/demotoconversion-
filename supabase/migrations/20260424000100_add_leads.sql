-- Migration: add leads table + FK on demos
--
-- A Lead groups one or more demo sessions for the same prospective student.
-- lead_number is auto-generated as LN-0001, LN-0002, … from a sequence.
-- demos.lead_id is nullable so existing seed rows are unaffected.

-- ─── Lead number sequence + generator ────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.lead_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_lead_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'LN-' || LPAD(nextval('public.lead_number_seq')::text, 4, '0');
END;
$$;

-- ─── leads table ─────────────────────────────────────────────
CREATE TABLE public.leads (
  id           BIGSERIAL    PRIMARY KEY,
  lead_number  TEXT         NOT NULL UNIQUE DEFAULT public.next_lead_number(),
  student_name TEXT         NOT NULL,
  created_by   UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_student_name ON public.leads (lower(student_name));
CREATE INDEX idx_leads_lead_number  ON public.leads (lead_number);

-- Reuse set_updated_at() trigger already present from initial schema
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── FK on demos ──────────────────────────────────────────────
ALTER TABLE public.demos
  ADD COLUMN lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX idx_demos_lead_id ON public.demos(lead_id) WHERE lead_id IS NOT NULL;

-- ─── RLS on leads ─────────────────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated roles read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager', 'sales_agent', 'hr'));

CREATE POLICY "Analysts and sales create leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager', 'sales_agent'));

CREATE POLICY "Analysts and managers update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('analyst', 'manager'))
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Managers delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (public.current_user_role() = 'manager');

-- ─── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- ─── create_lead RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_lead(p_student_name TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id          bigint;
  v_lead_number text;
BEGIN
  INSERT INTO public.leads (student_name, created_by)
  VALUES (p_student_name, auth.uid())
  RETURNING id, lead_number INTO v_id, v_lead_number;

  RETURN jsonb_build_object('id', v_id, 'lead_number', v_lead_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lead(TEXT) TO authenticated;

-- ─── Update create_demo_with_pour to include lead_id ─────────
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
  SELECT * INTO v_rec
  FROM jsonb_populate_record(NULL::public.demos, demo_payload);

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
    feedback_suggestions, feedback_comments,
    lead_id
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
    v_rec.feedback_suggestions, v_rec.feedback_comments,
    v_rec.lead_id
  )
  RETURNING id INTO v_demo_id;

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
