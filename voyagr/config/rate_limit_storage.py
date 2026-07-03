"""
Resolve Flask-Limiter / custom rate limit storage with safe Redis fallback.

If RATELIMIT_STORAGE_URI points at Redis but the server is down, fall back to
memory:// so gunicorn workers still start and the PWA keeps working.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def rate_limit_storage_uri() -> str:
    raw = (os.getenv('RATELIMIT_STORAGE_URI') or 'memory://').strip() or 'memory://'
    if not raw.startswith('redis://'):
        return raw

    try:
        import redis  # type: ignore

        client = redis.from_url(raw, socket_connect_timeout=2, socket_timeout=2)
        client.ping()
        logger.info('[SECURITY] Redis rate-limit storage OK: %s', _safe_uri(raw))
        return raw
    except Exception as exc:
        logger.warning(
            '[SECURITY] RATELIMIT_STORAGE_URI Redis unreachable (%s); using memory:// per process',
            exc,
        )
        return 'memory://'


def _safe_uri(uri: str) -> str:
    """Hide password in redis://user:pass@host:port/db logs."""
    if '@' not in uri:
        return uri
    try:
        prefix, rest = uri.split('://', 1)
        if '@' in rest:
            _, hostpart = rest.rsplit('@', 1)
            return f'{prefix}://***@{hostpart}'
    except Exception:
        pass
    return 'redis://***'
