"""
Auth blueprint (Supabase).

This is intentionally minimal:
- /api/me: verify token and return user claims

Future work:
- Use these claims to enforce per-user access in other blueprints.
"""

from __future__ import annotations

from flask import Blueprint, jsonify

from voyagr.utils.supabase_auth import require_supabase_user

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/me", methods=["GET"])
@require_supabase_user
def me(_jwt_claims):  # type: ignore
    user_id = _jwt_claims.get("sub")
    email = _jwt_claims.get("email")
    return jsonify(
        {
            "success": True,
            "user": {
                "id": user_id,
                "email": email,
            },
        }
    )

