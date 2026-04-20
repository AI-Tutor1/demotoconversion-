-- ============================================================
-- Add `hr` to the allowed values of public.users.role
-- ============================================================
-- The CHECK constraint from 20260412112900_initial_schema.sql pinned role
-- to ('analyst','sales_agent','manager'). The HR onboarding pipeline
-- introduces a fourth role whose members create candidate profiles at
-- /hr, submit interviews, and finalise approvals. No new helper function
-- is needed — current_user_role() already returns the TEXT role verbatim,
-- and every existing policy uses `current_user_role() IN (...)`.
--
-- After this migration:
--   * Existing rows keep their role unchanged (data migration is a no-op).
--   * New rows may be inserted with role='hr'.
--   * The JWT hook (20260415000008) transparently propagates the value.
-- ============================================================

ALTER TABLE public.users DROP CONSTRAINT users_role_check;

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('analyst', 'sales_agent', 'manager', 'hr'));
