-- Pin the search_path for set_updated_at so schema references are unambiguous
-- and cannot be shadowed by a user-controlled schema. Function body only uses
-- the NEW trigger variable and NOW(), which resolves from pg_catalog.
ALTER FUNCTION public.set_updated_at() SET search_path = '';
