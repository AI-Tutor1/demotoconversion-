-- ============================================================
-- Accountability Allocation (Product-analyst finalisation)
-- ============================================================
-- Layers a multi-select product-analyst finalisation on top of
-- demos.acct_type (which becomes a sales *suggestion*). The
-- finalised allocation lives in demo_accountability (join table);
-- finalisation metadata (who, when) lives on demos.
--
-- No backfill: existing demos.acct_type values are sales
-- suggestions, not finalisations. All existing Not-Converted
-- demos surface as "Awaiting accountability" until an analyst
-- finalises them via the /conducted drawer.
--
-- Correctness invariants (enforced via RPCs + trigger below):
--   accountability_final_at IS NOT NULL  ⇔  finalisation occurred
--   accountability_final_at IS NULL      ⇒  zero rows in demo_accountability
--   finalize RPC requires ≥1 category (cannot finalise-to-none)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Join table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.demo_accountability (
  demo_id   BIGINT      NOT NULL REFERENCES public.demos(id) ON DELETE CASCADE,
  category  TEXT        NOT NULL CHECK (category IN ('Product', 'Sales', 'Consumer')),
  set_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (demo_id, category)
);

CREATE INDEX idx_demo_accountability_demo_id ON public.demo_accountability(demo_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Finalisation metadata on demos
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.demos
  ADD COLUMN accountability_final_at TIMESTAMPTZ,
  ADD COLUMN accountability_final_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_demos_accountability_final_at
  ON public.demos(accountability_final_at)
  WHERE accountability_final_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Realtime
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.demo_accountability;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS — mirrors pour_issues pattern
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.demo_accountability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read accountability when demo visible"
  ON public.demo_accountability FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.demos d WHERE d.id = demo_accountability.demo_id));

CREATE POLICY "Analysts write accountability for own demos"
  ON public.demo_accountability FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.demos d
    WHERE d.id = demo_accountability.demo_id AND d.analyst_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.demos d
    WHERE d.id = demo_accountability.demo_id AND d.analyst_id = auth.uid()
  ));

CREATE POLICY "Managers manage accountability"
  ON public.demo_accountability FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager'));

-- ─────────────────────────────────────────────────────────────
-- 5. Atomic RPCs
-- ─────────────────────────────────────────────────────────────

-- Commits a finalisation + its category set atomically.
-- Requires p_categories to be non-empty; enforces the V1 invariant
-- that finalised demos must carry at least one category.
CREATE OR REPLACE FUNCTION public.finalize_demo_accountability(
  p_demo_id    BIGINT,
  p_categories TEXT[]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_categories IS NULL OR array_length(p_categories, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one category required';
  END IF;

  DELETE FROM public.demo_accountability WHERE demo_id = p_demo_id;

  INSERT INTO public.demo_accountability (demo_id, category)
    SELECT DISTINCT p_demo_id, unnest(p_categories);

  UPDATE public.demos
    SET accountability_final_at = NOW(),
        accountability_final_by = auth.uid(),
        updated_at              = NOW()
    WHERE id = p_demo_id;
END;
$$;

-- Clears finalisation atomically: removes all categories + nulls metadata.
CREATE OR REPLACE FUNCTION public.clear_demo_accountability(
  p_demo_id BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.demo_accountability WHERE demo_id = p_demo_id;

  UPDATE public.demos
    SET accountability_final_at = NULL,
        accountability_final_by = NULL,
        updated_at              = NOW()
    WHERE id = p_demo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_demo_accountability(BIGINT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_demo_accountability(BIGINT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Trigger: lock acct_type after analyst finalisation
--
-- Sales suggestion (demos.acct_type) is authoritative until an
-- analyst finalises. Post-finalisation, only managers may change
-- acct_type — the sales agent's client will go read-only, this
-- trigger is the DB-level enforcement.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_demos_lock_acct_after_final()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.accountability_final_at IS NOT NULL
     AND NEW.acct_type IS DISTINCT FROM OLD.acct_type
     AND NOT EXISTS (
       SELECT 1 FROM public.users
       WHERE id = auth.uid() AND role = 'manager'
     ) THEN
    RAISE EXCEPTION 'acct_type is locked after analyst finalisation (demo_id=%)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER zzz_demos_lock_acct_after_final
  BEFORE UPDATE ON public.demos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_demos_lock_acct_after_final();
