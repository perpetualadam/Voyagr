"""
Auth blueprint (Supabase).

This is intentionally minimal:
- /api/me: verify token and return user claims

Also returns ``promo_entitlement`` (lifetime / trial from SQLite) when ``user.id`` is present.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils.entitlements import get_promo_entitlement_dict
from voyagr.utils.supabase_auth import require_supabase_user

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/me", methods=["GET"])
@require_supabase_user
def me(_jwt_claims):  # type: ignore
    user_id = _jwt_claims.get("sub")
    email = _jwt_claims.get("email")
    promo = {
        "tier": "free",
        "lifetime": False,
        "trial_active": False,
        "trial_expires_at": None,
    }
    if user_id:
        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            promo = get_promo_entitlement_dict(cursor, user_id)
        finally:
            if conn:
                return_db_connection(conn)
    return jsonify(
        {
            "success": True,
            "user": {
                "id": user_id,
                "email": email,
            },
            "promo_entitlement": promo,
        }
    )

