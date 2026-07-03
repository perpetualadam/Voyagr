"""
Optional admin gate for ops/debug/write routes.

When ``VOYAGR_ADMIN_SECRET`` is unset, protected routes behave exactly as before
(PWA unchanged). When set, callers must send::

    X-Voyagr-Admin-Key: <same value>

Use for monitoring, cache control, debug routing probes, and other endpoints
that normal navigation clients must not depend on.
"""

from __future__ import annotations

import logging
import os
from functools import wraps
from typing import Any, Callable, Optional, Set, TypeVar

from flask import jsonify, request

logger = logging.getLogger(__name__)

F = TypeVar('F', bound=Callable[..., Any])

_ADMIN_HEADER = 'X-Voyagr-Admin-Key'


def admin_secret() -> str:
    return os.getenv('VOYAGR_ADMIN_SECRET', '').strip()


def admin_auth_enabled() -> bool:
    return bool(admin_secret())


def check_admin_request() -> Optional[Any]:
    """
    Return a Flask response tuple if the request should be denied, else None.
    No-op when VOYAGR_ADMIN_SECRET is not configured.
    """
    secret = admin_secret()
    if not secret:
        return None

    provided = request.headers.get(_ADMIN_HEADER, '').strip()
    if provided and provided == secret:
        return None

    logger.warning(
        '[SECURITY] Admin route denied for %s %s (ip=%s)',
        request.method,
        request.path,
        request.headers.get('X-Forwarded-For') or request.remote_addr,
    )
    return jsonify({'success': False, 'error': 'Unauthorized'}), 401


def require_admin_if_configured(f: F) -> F:
    """Decorator: require admin header when VOYAGR_ADMIN_SECRET is set."""

    @wraps(f)
    def decorated(*args: Any, **kwargs: Any) -> Any:
        denial = check_admin_request()
        if denial is not None:
            return denial
        return f(*args, **kwargs)

    return decorated  # type: ignore


def require_admin_if_configured_methods(*methods: str) -> Callable[[F], F]:
    """Like require_admin_if_configured but only for listed HTTP methods."""

    method_set = {m.upper() for m in methods}

    def decorator(f: F) -> F:
        @wraps(f)
        def decorated(*args: Any, **kwargs: Any) -> Any:
            if request.method.upper() in method_set:
                denial = check_admin_request()
                if denial is not None:
                    return denial
            return f(*args, **kwargs)

        return decorated  # type: ignore

    return decorator


def register_admin_before_request(
    blueprint,
    *,
    url_prefix: str = '/api',
    exact_paths: Optional[Set[str]] = None,
    path_prefixes: Optional[tuple] = None,
) -> None:
    """
    Blueprint before_request hook for groups of admin-only paths.

    ``url_prefix`` must match how the blueprint is registered on the app
    (typically ``/api``). ``exact_paths`` and ``path_prefixes`` are relative
    to that prefix, e.g. ``/cache-clear`` → ``/api/cache-clear``.
    """

    exact = exact_paths or set()
    prefixes = path_prefixes or ()
    base = (url_prefix or blueprint.url_prefix or '').rstrip('/')

    @blueprint.before_request
    def _admin_gate():  # type: ignore[misc]
        path = request.path or ''
        rel = path
        if base and path.startswith(base):
            rel = path[len(base):] or '/'
            if not rel.startswith('/'):
                rel = '/' + rel

        if rel in exact or any(rel.startswith(p) for p in prefixes):
            return check_admin_request()
        return None
