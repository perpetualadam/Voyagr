"""
Supabase JWT authentication utilities.

This project currently uses Supabase Auth for user identities.
Supabase access tokens are JWTs (typically HS256 signed with the project's JWT secret).

Environment variables:
- SUPABASE_JWT_SECRET: Supabase project's JWT secret (server-side only)
- SUPABASE_JWT_AUD: expected audience claim (default: "authenticated")
"""

from __future__ import annotations

import os
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar

try:
    import jwt  # type: ignore
except ImportError:  # pragma: no cover
    jwt = None  # type: ignore
from flask import jsonify, request

F = TypeVar("F", bound=Callable[..., Any])


def _get_bearer_token() -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts[0].strip().lower(), parts[1].strip()
    if scheme != "bearer" or not token:
        return None
    return token


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    if jwt is None:
        raise RuntimeError("PyJWT is not installed (pip install PyJWT)")

    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not set")

    expected_aud = os.getenv("SUPABASE_JWT_AUD", "authenticated").strip()

    # Supabase tokens are typically HS256 (JWT secret).
    # We enforce expiration and audience.
    return jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience=expected_aud,
        options={
            "require": ["exp", "iat", "sub"],
        },
    )


def require_supabase_user(f: F) -> F:
    """Require a valid Supabase Bearer token and expose JWT claims as kwargs."""

    @wraps(f)
    def decorated(*args: Any, **kwargs: Any) -> Any:
        token = _get_bearer_token()
        if not token:
            return jsonify({"success": False, "error": "Missing bearer token"}), 401
        try:
            claims = verify_supabase_jwt(token)
        except Exception as e:
            return jsonify({"success": False, "error": "Invalid token", "detail": str(e)}), 401

        # Attach claims to kwargs so handlers can use them
        kwargs["_jwt_claims"] = claims
        return f(*args, **kwargs)

    return decorated  # type: ignore

