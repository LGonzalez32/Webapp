from supabase import Client
from ..core.supabase_client import get_supabase


def get_db() -> Client:
    return get_supabase()
