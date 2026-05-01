"""Quota management for chat endpoints (Sprint I2).

Architecture:
  - Admin bypass via ADMIN_EMAILS env var (comma-separated).
  - Plan limits via PLAN_<NAME>_DAILY / PLAN_<NAME>_MONTHLY env vars.
    'unlimited', '-1', or empty value = no limit.
  - Atomic check + consume via Postgres RPC `try_consume_chat_quota`
    (migration 011_chat_usage.sql).

To change pricing/limits at runtime: set env vars and restart backend.
No DB migration needed.

Defaults aligned with discussion in chat:
  - Trial         : 5/day, 50/month
  - Esencial      : 10/day, 200/month
  - Profesional   : 50/day, unlimited/month
  - Empresa       : unlimited / unlimited
"""
import json
import logging
import os
from typing import Optional

from fastapi import HTTPException

from ..core.supabase_client import get_supabase

logger = logging.getLogger(__name__)


# ─── Limit parsing ──────────────────────────────────────────────────────────

def _parse_limit(env_var: str, default: Optional[int]) -> Optional[int]:
    """Read an env var and interpret it as a quota limit.

    Returns None for 'unlimited' / 'inf' / '-1' / '' (= no limit).
    """
    raw = os.getenv(env_var, "").strip().lower()
    if raw == "":
        return default
    if raw in ("unlimited", "inf", "infinite", "-1", "none", "null"):
        return None
    try:
        n = int(raw)
        return None if n < 0 else n
    except ValueError:
        logger.warning(json.dumps({
            "evt": "quota_env_parse_failed",
            "env": env_var, "value": raw, "fallback": default,
        }))
        return default


# Default plan tiers. Override via env vars without redeploying schema.
PLAN_DEFAULTS: dict[str, tuple[Optional[int], Optional[int]]] = {
    # plan name (lowercase) → (daily, monthly). None = unlimited.
    "trial":       (5,    50),
    "esencial":    (10,   200),
    "profesional": (50,   None),
    "empresa":     (None, None),
}


def get_plan_limits(plan: str) -> tuple[Optional[int], Optional[int]]:
    """Returns (daily_limit, monthly_limit) for a plan name.

    Reads env vars PLAN_<UPPER>_DAILY and PLAN_<UPPER>_MONTHLY if set,
    else falls back to PLAN_DEFAULTS.
    """
    key = (plan or "trial").lower()
    default_d, default_m = PLAN_DEFAULTS.get(key, PLAN_DEFAULTS["trial"])
    upper = key.upper()
    return (
        _parse_limit(f"PLAN_{upper}_DAILY",   default_d),
        _parse_limit(f"PLAN_{upper}_MONTHLY", default_m),
    )


# ─── Admin bypass ───────────────────────────────────────────────────────────

def _admin_emails() -> set[str]:
    """Lowercased set of admin emails from ADMIN_EMAILS env var."""
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def is_admin(user) -> bool:
    """True if the user's email is in ADMIN_EMAILS."""
    email = (getattr(user, "email", "") or "").lower()
    if not email:
        return False
    return email in _admin_emails()


# ─── Plan resolution from subscriptions table ───────────────────────────────

_PLAN_PRIORITY = {"empresa": 4, "profesional": 3, "esencial": 2, "trial": 1}


def _resolve_user_plan(user_id: str) -> str:
    """Find the highest-tier plan across all orgs the user belongs to.

    Falls back to 'trial' if user has no orgs or no subscription.
    Defensive: any DB error → 'trial' (most restrictive).
    """
    sb = get_supabase()
    try:
        memberships = sb.table("organization_members") \
            .select("org_id") \
            .eq("user_id", user_id) \
            .execute()
        org_ids = [m["org_id"] for m in (memberships.data or []) if m.get("org_id")]
        if not org_ids:
            return "trial"

        subs = sb.table("subscriptions") \
            .select("plan") \
            .in_("organization_id", org_ids) \
            .execute()
        plans = [(s.get("plan") or "trial").lower() for s in (subs.data or [])]
        if not plans:
            return "trial"

        plans.sort(key=lambda p: _PLAN_PRIORITY.get(p, 0), reverse=True)
        return plans[0]
    except Exception as e:
        logger.warning(json.dumps({
            "evt": "plan_resolve_failed", "user_id": user_id, "error": type(e).__name__,
        }))
        return "trial"


# ─── Atomic check + consume ─────────────────────────────────────────────────

def consume_quota(user) -> None:
    """Check if user has quota; if yes, increment counter; if no, raise 429.

    Admin bypass: users in ADMIN_EMAILS skip all checks (and no counter
    is incremented for them — admins are invisible to billing).

    Side effect: on success, increments today's chat_usage count by 1.
    """
    if is_admin(user):
        return  # bypass

    user_id = str(getattr(user, "id", "") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")

    plan = _resolve_user_plan(user_id)
    daily_limit, monthly_limit = get_plan_limits(plan)

    sb = get_supabase()
    try:
        rpc = sb.rpc("try_consume_chat_quota", {
            "p_user_id":       user_id,
            "p_daily_limit":   daily_limit,
            "p_monthly_limit": monthly_limit,
        }).execute()
    except Exception as e:
        # RPC not deployed yet OR DB outage. Fail open (let chat through)
        # but log loudly so we notice. Fail closed would block all chat
        # if the migration is forgotten.
        logger.warning(json.dumps({
            "evt": "quota_rpc_failed",
            "user_id": user_id, "plan": plan, "error": type(e).__name__,
        }))
        return

    data = rpc.data or {}
    if not data.get("ok"):
        exceeded = data.get("exceeded") or "unknown"
        logger.info(json.dumps({
            "evt": "quota_blocked",
            "user_id": user_id, "plan": plan, "exceeded": exceeded,
            "daily_count":   data.get("daily_count"),
            "monthly_count": data.get("monthly_count"),
        }))
        raise HTTPException(
            status_code=429,
            detail=f"QUOTA_EXCEEDED_{exceeded.upper()}",
        )

    # Success path — quota consumed. Optional: log for ops visibility.
    logger.debug(json.dumps({
        "evt": "quota_consumed",
        "user_id": user_id, "plan": plan,
        "daily_count":   data.get("daily_count"),
        "monthly_count": data.get("monthly_count"),
    }))
