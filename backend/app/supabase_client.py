from supabase import Client, create_client

from .config import settings


def get_supabase() -> Client:
    """Build a Supabase client with the service_role key. Bypasses RLS — never call from user-facing code."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
