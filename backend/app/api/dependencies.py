"""FastAPI dependencies — DB client + auth helper."""
from typing import Optional

from fastapi import Header, HTTPException
from supabase import Client

from ..core.supabase_client import get_supabase


def get_db() -> Client:
    return get_supabase()


def get_current_user(authorization: Optional[str] = Header(None)):
    """Validate Supabase JWT from `Authorization: Bearer <token>` header.

    Returns the user object from Supabase auth.
    Raises 401 if missing, malformed, or invalid token.

    Used by chat routes (Sprint I2) to gate access + identify quota holder.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    sb = get_supabase()
    try:
        resp = sb.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")

    user = getattr(resp, "user", None) if resp else None
    if not user:
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")
    return user
