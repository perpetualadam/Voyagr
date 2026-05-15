"""
Authentication utilities for API endpoints.
"""

import logging
import os
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar

from flask import request, jsonify

from voyagr.config import VALID_API_KEYS
from voyagr.utils.client_ip import get_client_ip, is_local_client_request
from voyagr.utils.supabase_auth import verify_supabase_jwt

logger = logging.getLogger('voyagr_web')

F = TypeVar('F', bound=Callable[..., Any])


def require_auth(f: F) -> F:
    """Decorator for API key authentication."""
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        # Allow requests from localhost without auth (for development)
        if is_local_client_request():
            return f(*args, **kwargs)

        # Check for API key in header or query parameter
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key')

        if not api_key or api_key not in VALID_API_KEYS:
            logger.warning(f"Unauthorized API access attempt from {get_client_ip()}")
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        return f(*args, **kwargs)
    return decorated_function  # type: ignore


def _is_local_request() -> bool:
    """Loopback client, honoring X-Forwarded-For when VOYAGR_TRUST_PROXY=1."""
    return is_local_client_request()


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


def require_private_user(f: F) -> F:
    """
    Require a Supabase user for endpoints that read/write private location data.

    - Localhost requests are allowed for development (no auth) unless explicitly disabled.
    - Non-local requests require a valid Supabase Bearer token.
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        # Allow local dev calls without auth, unless disabled.
        if _is_local_request() and os.getenv("ALLOW_LOCAL_UNAUTH", "true").lower() == "true":
            kwargs["_jwt_claims"] = {"sub": "local", "email": None}
            return f(*args, **kwargs)

        token = _get_bearer_token()
        if not token:
            return jsonify({"success": False, "error": "Missing bearer token"}), 401

        try:
            claims: Dict[str, Any] = verify_supabase_jwt(token)
        except Exception as e:
            return jsonify({"success": False, "error": "Invalid token", "detail": str(e)}), 401

        kwargs["_jwt_claims"] = claims
        return f(*args, **kwargs)

    return decorated_function  # type: ignore

