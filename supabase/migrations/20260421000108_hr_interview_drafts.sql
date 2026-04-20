-- ============================================================
-- hr_interview_drafts — AI scorecard output (mirrors session_drafts)
-- ============================================================
-- Populated by the hr_interview_analyst backend agent once the recording
-- has been transcribed. HR / manager review the draft in the Scorecard
-- tab of the interview drawer and accept / edit / reject each field.
-- ============================================================

CREATE TABLE public.hr_interview_drafts (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_profile_id  UUID         NOT NULL REFERENCES public.teacher_profiles(id) ON DELETE CASCADE,
  transcript          TEXT,
  agent_name          TEXT         NOT NULL DEFAULT 'hr_interview_analyst',
  draft_data          JSONB        NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'pending_review'
                      CHECK (status IN ('pending_review','approved','partially_edited','rejected')),
  approval_rate       FLOAT        CHECK (approval_rate IS NULL OR approval_rate BETWEEN 0 AND 1),
  reviewed_by         UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hr_interview_drafts_profile ON public.hr_interview_drafts (teacher_profile_id);
CREATE INDEX idx_hr_interview_drafts_status  ON public.hr_interview_drafts (status);

CREATE TRIGGER hr_interview_drafts_updated_at
  BEFORE UPDATE ON public.hr_interview_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────

ALTER TABLE public.hr_interview_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr+manager read hr_interview_drafts"
  ON public.hr_interview_drafts FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "hr+manager insert hr_interview_drafts"
  ON public.hr_interview_drafts FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "hr+manager update hr_interview_drafts"
  ON public.hr_interview_drafts FOR UPDATE
  TO authenticated
  USING      (public.current_user_role() IN ('hr','manager'))
  WITH CHECK (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "manager delete hr_interview_drafts"
  ON public.hr_interview_drafts FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'manager');

-- ─── Realtime ─────────────────────────────────────────────
-- Add to supabase_realtime publication so the interview drawer can
-- reactively show the scorecard as soon as the agent finishes.

ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_interview_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_rates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_availability;
