"""
Promo entitlements stored in SQLite (`user_entitlements`): lifetime / trial windows.

Stripe subscription status is not stored locally yet — paid subscribers should either
receive a promo row via ops or a future webhook sync; see Voyagr docs.

Env:
  VOYAGR_ENFORCE_PROMO_PREMIUM=true — enable server-side gates on routes wrapped
  with ``require_promo_premium_if_enforced`` (default off so existing installs unchanged).
"""

from __future__ import annotations

import os
import time
from functools import wraps
from typing import Any, Callable, Dict, Optional

from flask import jsonify

from voyagr.models import get_db_connection, return_db_connection


def utc_now_timestamp() -> int:
    return int(time.time())


def get_promo_entitlement_dict(cursor: Any, user_id: str) -> Dict[str, Any]:
    """Same shape as GET /api/coupons/status (tier, lifetime, trial_*, timestamps in seconds)."""
    t = utc_now_timestamp()
    cursor.execute(
        "SELECT lifetime, trial_expires_at FROM user_entitlements WHERE user_id = ?",
        (user_id,),
    )
    row = cursor.fetchone()
    lifetime = False
    trial_until: Optional[int] = None
    tier = "free"
    trial_active = False

    if row:
        lifetime = bool(row[0])
        trial_until = row[1]
        if lifetime:
            tier = "lifetime"
        elif trial_until is not None and trial_until > t:
            tier = "trial"
            trial_active = True
        else:
            tier = "free"

    return {
        "tier": tier,
        "lifetime": lifetime,
        "trial_active": trial_active,
        "trial_expires_at": trial_until if trial_active else None,
    }


def user_has_active_promo_premium(user_id: str) -> bool:
    """Lifetime or active (non-expired) trial."""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        d = get_promo_entitlement_dict(cursor, user_id)
        return bool(d["lifetime"] or d["trial_active"])
    finally:
        if conn:
            return_db_connection(conn)


def promo_premium_enforcement_enabled() -> bool:
    return os.getenv("VOYAGR_ENFORCE_PROMO_PREMIUM", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def require_promo_premium_if_enforced(f: Callable[..., Any]) -> Callable[..., Any]:
    """
    Use below ``@require_private_user`` / ``@require_supabase_user`` so ``_jwt_claims`` exists.

    When enforcement is disabled (default), this is a no-op.
    Local dev bypass (`sub == "local"` from ALLOW_LOCAL_UNAUTH) skips the premium check.
    """

    @wraps(f)
    def decorated(*args: Any, **kwargs: Any) -> Any:
        if not promo_premium_enforcement_enabled():
            return f(*args, **kwargs)
        claims = kwargs.get("_jwt_claims")
        if not isinstance(claims, dict):
            return jsonify({"success": False, "error": "Unauthorized", "code": "unauthorized"}), 401
        uid = claims.get("sub")
        if uid == "local":
            return f(*args, **kwargs)
        if not uid:
            return jsonify({"success": False, "error": "Unauthorized", "code": "unauthorized"}), 401
        if user_has_active_promo_premium(uid):
            return f(*args, **kwargs)
        return jsonify(
            {
                "success": False,
                "error": "Premium access required (promo trial or lifetime)",
                "code": "premium_required",
            }
        ), 403

    return decorated
