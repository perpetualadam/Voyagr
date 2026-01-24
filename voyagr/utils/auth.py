"""
Authentication utilities for API endpoints.
"""

import logging
from functools import wraps
from typing import Any, Callable, TypeVar

from flask import request, jsonify

from voyagr.config import VALID_API_KEYS

logger = logging.getLogger('voyagr_web')

F = TypeVar('F', bound=Callable[..., Any])


def require_auth(f: F) -> F:
    """Decorator for API key authentication."""
    @wraps(f)
    def decorated_function(*args: Any, **kwargs: Any) -> Any:
        # Allow requests from localhost without auth (for development)
        if request.remote_addr in ['127.0.0.1', 'localhost']:
            return f(*args, **kwargs)

        # Check for API key in header or query parameter
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key')

        if not api_key or api_key not in VALID_API_KEYS:
            logger.warning(f"Unauthorized API access attempt from {request.remote_addr}")
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        return f(*args, **kwargs)
    return decorated_function  # type: ignore

