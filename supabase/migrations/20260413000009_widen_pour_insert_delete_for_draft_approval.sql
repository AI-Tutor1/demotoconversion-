-- Approving an AI draft triggers DELETE + INSERT on pour_issues via
-- firePourSync in lib/supabase-sync.ts. Both operations were gated on
-- demos.analyst_id = auth.uid(), so when the reviewing analyst isn't the
-- one originally assigned — or when analyst_id is NULL (seed rows,
-- unassigned demos) — RLS kicks the DELETE and the whole transaction
-- rolls back with: "new row violates row-level security policy for
-- table pour_issues".
--
-- Widen INSERT and DELETE to also allow:
--   - demos.analyst_id IS NULL (unassigned demos)
--   - current_user_role() = 'manager'
--
-- Sales-agent abuse risk is contained by the existing SELECT policy on
-- demos (sales can only see demos they're assigned to) and by /analyst
-- and /drafts being gated in middleware.ts to analyst + manager roles.

-- ─── INSERT ────────────────────────────────────────────────────

-- Names from initial_rls + the subsequent users_rls_recursion fix; drop
-- both defensively so this migration is idempotent across environments.
DROP POLICY IF EXISTS "Analysts create pour_issues"         ON public.pour_issues;
DROP POLICY IF EXISTS "Analysts insert POUR for own demos"  ON public.pour_issues;

CREATE POLICY "Authenticated users create pour_issues"
  ON public.pour_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = pour_issues.demo_id
      AND (
        demos.analyst_id = auth.uid()
        OR demos.analyst_id IS NULL
        OR public.current_user_role() = 'manager'
      )
    )
  );

-- ─── DELETE ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Analysts delete POUR for own demos"  ON public.pour_issues;

CREATE POLICY "Authenticated users delete pour_issues"
  ON public.pour_issues FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.demos
      WHERE demos.id = pour_issues.demo_id
      AND (
        demos.analyst_id = auth.uid()
        OR demos.analyst_id IS NULL
        OR public.current_user_role() = 'manager'
      )
    )
  );
