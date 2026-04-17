-- Migration: helper RPC for the smoke.sh manifest check.
--
-- Returns the set of public-schema functions. Called by
-- scripts/_migration-manifest-check.sh so the smoke script can diff
-- RPCs-called-from-frontend vs RPCs-deployed-in-DB reliably — i.e.
-- distinguish "function not deployed" from "function exists but I
-- called it with the wrong args" (both look identical via generic
-- PostgREST probes).
--
-- Security: SECURITY DEFINER + SET search_path so the function runs
-- with elevated privs needed to read information_schema. Anon can call
-- it — function names are not sensitive (you can already list them via
-- any RPC call that errors PGRST202).

CREATE OR REPLACE FUNCTION public.list_public_rpcs()
RETURNS TABLE(name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT routine_name::text
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
  ORDER BY routine_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_rpcs() TO anon, authenticated;
