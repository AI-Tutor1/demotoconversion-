-- ============================================================
-- Row-level security for teacher_profiles, teacher_rates, teacher_availability
-- ============================================================
-- SELECT:
--   hr, manager               → ALL rows
--   analyst, sales_agent      → WHERE status='approved'
-- INSERT: hr, manager
-- UPDATE:
--   teacher_profiles → hr, manager (raw); analyst goes through
--     update_teacher_profile() RPC (whitelisted columns only, see 105)
--   teacher_rates, teacher_availability → hr, manager, analyst (but only
--     for rows belonging to an approved profile)
-- DELETE: manager only (+ CASCADE side tables)
-- ============================================================

ALTER TABLE public.teacher_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_availability  ENABLE ROW LEVEL SECURITY;

-- ─── teacher_profiles ──────────────────────────────────────

CREATE POLICY "hr+manager read all teacher_profiles"
  ON public.teacher_profiles FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "analyst+sales_agent read approved teacher_profiles"
  ON public.teacher_profiles FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('analyst','sales_agent')
    AND status = 'approved'
  );

CREATE POLICY "hr+manager insert teacher_profiles"
  ON public.teacher_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "hr+manager update teacher_profiles"
  ON public.teacher_profiles FOR UPDATE
  TO authenticated
  USING      (public.current_user_role() IN ('hr','manager'))
  WITH CHECK (public.current_user_role() IN ('hr','manager'));

-- Analyst UPDATE is NOT granted at table level — must go through
-- update_teacher_profile() RPC (SECURITY DEFINER). This prevents analysts
-- from mutating tid / status / approval columns even by accident.

CREATE POLICY "manager delete teacher_profiles"
  ON public.teacher_profiles FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'manager');

-- ─── teacher_rates ──────────────────────────────────────────

CREATE POLICY "hr+manager read all teacher_rates"
  ON public.teacher_rates FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "analyst read rates of approved teachers"
  ON public.teacher_rates FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('analyst','sales_agent')
    AND EXISTS (
      SELECT 1 FROM public.teacher_profiles tp
      WHERE tp.id = teacher_rates.teacher_profile_id
        AND tp.status = 'approved'
    )
  );

CREATE POLICY "hr+manager+analyst insert teacher_rates"
  ON public.teacher_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('hr','manager','analyst')
    AND (
      public.current_user_role() IN ('hr','manager')
      OR EXISTS (
        SELECT 1 FROM public.teacher_profiles tp
        WHERE tp.id = teacher_rates.teacher_profile_id
          AND tp.status = 'approved'
      )
    )
  );

CREATE POLICY "hr+manager+analyst update teacher_rates"
  ON public.teacher_rates FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() IN ('hr','manager','analyst')
    AND (
      public.current_user_role() IN ('hr','manager')
      OR EXISTS (
        SELECT 1 FROM public.teacher_profiles tp
        WHERE tp.id = teacher_rates.teacher_profile_id
          AND tp.status = 'approved'
      )
    )
  )
  WITH CHECK (public.current_user_role() IN ('hr','manager','analyst'));

CREATE POLICY "hr+manager+analyst delete teacher_rates"
  ON public.teacher_rates FOR DELETE
  TO authenticated
  USING (
    public.current_user_role() IN ('hr','manager','analyst')
    AND (
      public.current_user_role() IN ('hr','manager')
      OR EXISTS (
        SELECT 1 FROM public.teacher_profiles tp
        WHERE tp.id = teacher_rates.teacher_profile_id
          AND tp.status = 'approved'
      )
    )
  );

-- ─── teacher_availability ───────────────────────────────────

CREATE POLICY "hr+manager read all teacher_availability"
  ON public.teacher_availability FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('hr','manager'));

CREATE POLICY "analyst read availability of approved teachers"
  ON public.teacher_availability FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('analyst','sales_agent')
    AND EXISTS (
      SELECT 1 FROM public.teacher_profiles tp
      WHERE tp.id = teacher_availability.teacher_profile_id
        AND tp.status = 'approved'
    )
  );

CREATE POLICY "hr+manager+analyst insert teacher_availability"
  ON public.teacher_availability FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('hr','manager','analyst')
    AND (
      public.current_user_role() IN ('hr','manager')
      OR EXISTS (
        SELECT 1 FROM public.teacher_profiles tp
        WHERE tp.id = teacher_availability.teacher_profile_id
          AND tp.status = 'approved'
      )
    )
  );

CREATE POLICY "hr+manager+analyst update teacher_availability"
  ON public.teacher_availability FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() IN ('hr','manager','analyst')
    AND (
      public.current_user_role() IN ('hr','manager')
      OR EXISTS (
        SELECT 1 FROM public.teacher_profiles tp
        WHERE tp.id = teacher_availability.teacher_profile_id
          AND tp.status = 'approved'
      )
    )
  )
  WITH CHECK (public.current_user_role() IN ('hr','manager','analyst'));

CREATE POLICY "hr+manager+analyst delete teacher_availability"
  ON public.teacher_availability FOR DELETE
  TO authenticated
  USING (
    public.current_user_role() IN ('hr','manager','analyst')
    AND (
      public.current_user_role() IN ('hr','manager')
      OR EXISTS (
        SELECT 1 FROM public.teacher_profiles tp
        WHERE tp.id = teacher_availability.teacher_profile_id
          AND tp.status = 'approved'
      )
    )
  );
