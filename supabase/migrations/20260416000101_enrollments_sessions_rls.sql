-- ============================================================
-- Product Review Workflow — RLS Policies
-- Analyst + Manager only access (uses current_user_role() helper)
-- ============================================================

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_drafts ENABLE ROW LEVEL SECURITY;

-- ─── Enrollments ────────────────────────────────────────────

CREATE POLICY "Analysts and managers read enrollments"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers insert enrollments"
  ON public.enrollments FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers update enrollments"
  ON public.enrollments FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'))
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers delete enrollments"
  ON public.enrollments FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'));

-- ─── Sessions ───────────────────────────────────────────────

CREATE POLICY "Analysts and managers read sessions"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers insert sessions"
  ON public.sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers update sessions"
  ON public.sessions FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'))
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers delete sessions"
  ON public.sessions FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'));

-- ─── Session Drafts ─────────────────────────────────────────

CREATE POLICY "Analysts and managers read session drafts"
  ON public.session_drafts FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers insert session drafts"
  ON public.session_drafts FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers update session drafts"
  ON public.session_drafts FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'))
  WITH CHECK (public.current_user_role() IN ('analyst', 'manager'));

CREATE POLICY "Analysts and managers delete session drafts"
  ON public.session_drafts FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('analyst', 'manager'));
