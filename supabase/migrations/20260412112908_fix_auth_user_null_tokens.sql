-- ============================================================
-- Hotfix: populate NULL auth.users token columns with ''
-- ============================================================
-- Migration 20260412112906_seed_initial_users inserted auth.users with
-- the documented minimum columns, but GoTrue expects several string
-- columns to be '' (not NULL). Raw-SQL-seeded users fail sign-in with:
--   "Database error querying schema"
-- because GoTrue concatenates/compares these fields during token
-- verification. Applying empty-string defaults fixes login without
-- needing to drop and re-create the users.
--
-- Fresh installs should use the updated 20260412112906 which sets these
-- columns directly. This hotfix exists for the already-applied seed.
-- ============================================================

UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token,         ''),
  recovery_token             = COALESCE(recovery_token,             ''),
  email_change_token_new     = COALESCE(email_change_token_new,     ''),
  email_change               = COALESCE(email_change,               '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL;
