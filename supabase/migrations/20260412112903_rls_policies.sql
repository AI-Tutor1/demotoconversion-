-- ============================================================
-- Phase 2 RLS Policies
-- ============================================================
-- Policies on demos/users/demo_drafts are verbatim from SECURITY.md.
-- Policies on pour_issues were requested by the user and mirror
-- demos visibility via an EXISTS check on the parent demo.
-- Policies on teachers/agent_configs/task_queue are minimal
-- supplementary policies so RLS default-deny does not break the
-- frontend in Step 4.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Table: users (SECURITY.md)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read all profiles"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers manage users"
  ON public.users FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));

CREATE POLICY "Update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Table: demos (SECURITY.md)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.demos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analysts read own and unassigned demos"
  ON public.demos FOR SELECT
  TO authenticated
  USING (
    analyst_id = auth.uid()
    OR analyst_id IS NULL
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Sales agents read own demos"
  ON public.demos FOR SELECT
  TO authenticated
  USING (
    sales_agent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('analyst', 'manager'))
  );

CREATE POLICY "Analysts update own reviews"
  ON public.demos FOR UPDATE
  TO authenticated
  USING (analyst_id = auth.uid())
  WITH CHECK (analyst_id = auth.uid());

CREATE POLICY "Claim unassigned demo"
  ON public.demos FOR UPDATE
  TO authenticated
  USING (analyst_id IS NULL)
  WITH CHECK (
    analyst_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'analyst')
  );

CREATE POLICY "Sales update own demos"
  ON public.demos FOR UPDATE
  TO authenticated
  USING (sales_agent_id = auth.uid())
  WITH CHECK (sales_agent_id = auth.uid());

CREATE POLICY "Managers full access demos"
  ON public.demos FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));

-- ─────────────────────────────────────────────────────────────
-- Table: demo_drafts (SECURITY.md)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.demo_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analyst reads own drafts"
  ON public.demo_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = demo_drafts.demo_id
      AND demos.analyst_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
  );

-- ─────────────────────────────────────────────────────────────
-- Table: pour_issues (new, requested by user — mirrors demos visibility)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.pour_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read POUR when demo visible"
  ON public.pour_issues FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.demos d WHERE d.id = pour_issues.demo_id));

CREATE POLICY "Analysts insert POUR for own demos"
  ON public.pour_issues FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.demos d
    WHERE d.id = pour_issues.demo_id AND d.analyst_id = auth.uid()
  ));

CREATE POLICY "Analysts update POUR for own demos"
  ON public.pour_issues FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.demos d
    WHERE d.id = pour_issues.demo_id AND d.analyst_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.demos d
    WHERE d.id = pour_issues.demo_id AND d.analyst_id = auth.uid()
  ));

CREATE POLICY "Analysts delete POUR for own demos"
  ON public.pour_issues FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.demos d
    WHERE d.id = pour_issues.demo_id AND d.analyst_id = auth.uid()
  ));

CREATE POLICY "Managers manage POUR"
  ON public.pour_issues FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));

-- ─────────────────────────────────────────────────────────────
-- Table: teachers (supplementary — lookup data readable by all)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read teachers"
  ON public.teachers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers manage teachers"
  ON public.teachers FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));

-- ─────────────────────────────────────────────────────────────
-- Table: agent_configs (supplementary — manager-only)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage agent configs"
  ON public.agent_configs FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));

-- ─────────────────────────────────────────────────────────────
-- Table: task_queue (supplementary — manager-read for monitoring)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.task_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read task queue"
  ON public.task_queue FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));
