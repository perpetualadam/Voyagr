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
    """Strict signed-in identity + live session for all private location resources.

    No localhost/API-key/admin/query/body owner bypass. Necessary navigation does
    not use this decorator. Existing cloud data remains readable/deletable when
    optional new uploads are disabled.
    """
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        from flask import g, make_response
        from voyagr.utils.dashcam_auth import authenticate_dashcam_request
        denial = authenticate_dashcam_request()
        if denial is not None:
            response = make_response(denial)
        else:
            kwargs['_jwt_claims'] = dict(g.private_user_claims)
            response = make_response(f(*args, **kwargs))
        response.headers['Cache-Control'] = 'private, no-store'
        response.vary.add('Authorization')
        return response
    return decorated_function  # type: ignore
