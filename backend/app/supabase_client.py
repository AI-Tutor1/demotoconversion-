from functools import lru_cache

from supabase import Client, create_client

from .config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Build a Supabase client with the service_role key. Bypasses RLS — never call from user-facing code.

    Cached at module level so the long-running backend reuses one client rather
    than re-creating the HTTP session on every DB round-trip.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
