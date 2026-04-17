-- Migration: custom_access_token_hook — inject app_role into JWT.
--
-- Creates a PostgreSQL function that Supabase Auth calls whenever it mints
-- a new access token. The hook reads the user's role from public.users and
-- injects it as the `app_role` claim so middleware can read it without a
-- DB round-trip on every protected route navigation.
--
-- ⚠️  MANUAL STEP REQUIRED after applying this migration:
--   1. Go to Supabase Dashboard → Authentication → Hooks
--   2. Add hook: "custom_access_token" → select function "public.custom_access_token_hook"
--   3. Save. The hook only applies to tokens minted AFTER registration.
--      Existing sessions keep the old token until they refresh (≤1h by default).
--
-- Until the hook is registered, the `app_role` claim will be absent and the
-- transitional DB fallback in middleware.ts will continue to work.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims   jsonb;
  app_role text;
BEGIN
  -- Look up the user's app role. Use SECURITY DEFINER so this function can
  -- bypass RLS on public.users (it runs as the function owner, not the caller).
  SELECT role INTO app_role
  FROM public.users
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- Inject role as `app_role` claim. If the user has no profile row the
  -- claim is omitted (null) — the middleware falls back to DB lookup.
  IF app_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_role}', to_jsonb(app_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute to the Supabase auth service so the hook fires correctly.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from public — only the auth service should invoke this.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
