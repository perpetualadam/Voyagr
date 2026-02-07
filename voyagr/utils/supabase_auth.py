"""
Supabase JWT authentication utilities.

Supabase access tokens are JWTs. Depending on project configuration / Supabase rollout,
they may be signed with:
- HS256 (shared JWT secret)
- RS256 (asymmetric keys; verify via JWKS)

Environment variables:
- SUPABASE_URL: Supabase project URL (used to derive issuer/JWKS for RS256)
- SUPABASE_JWT_SECRET: Supabase JWT secret (HS256 verification only; server-side)
- SUPABASE_JWT_AUD: expected audience claim (default: "authenticated")
- SUPABASE_JWT_ISS: override issuer (default: "{SUPABASE_URL}/auth/v1")
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

_JWKS_CLIENT = None


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

    expected_aud = os.getenv("SUPABASE_JWT_AUD", "authenticated").strip()

    # Determine algorithm from token header
    header = jwt.get_unverified_header(token)
    alg = (header.get("alg") or "").strip()

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    issuer = os.getenv("SUPABASE_JWT_ISS", "").strip().rstrip("/")
    if not issuer and supabase_url:
        issuer = f"{supabase_url}/auth/v1"

    options = {"require": ["exp", "iat", "sub"]}

    # RS256: verify using JWKS from Supabase
    if alg.upper().startswith("RS"):
        if not supabase_url:
            raise RuntimeError("SUPABASE_URL is required for RS256 verification")

        global _JWKS_CLIENT
        if _JWKS_CLIENT is None:
            jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
            _JWKS_CLIENT = jwt.PyJWKClient(jwks_url)

        signing_key = _JWKS_CLIENT.get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=expected_aud,
            issuer=issuer or None,
            options=options,
        )

    # HS256: verify using shared secret
    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is not set (required for HS256 tokens)")

    return jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience=expected_aud,
        issuer=issuer or None,
        options=options,
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

