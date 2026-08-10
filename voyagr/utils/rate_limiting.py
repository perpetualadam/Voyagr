"""
Rate limiting utilities for API endpoints.

Uses Redis when RATELIMIT_STORAGE_URI=redis://... is reachable (shared across
gunicorn workers). Falls back to in-memory per process if Redis is unset or down.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

from flask import jsonify, request

from voyagr.utils.client_ip import get_client_ip

logger = logging.getLogger('voyagr_web')

F = TypeVar('F', bound=Callable[..., Any])

_redis_client = None
_redis_checked = False
_redis_lock = threading.Lock()


def _redis_uri() -> str:
    return (os.getenv('RATELIMIT_STORAGE_URI') or '').strip()


def get_rate_limit_redis():
    """Shared Redis client for counters, or None if unavailable."""
    global _redis_client, _redis_checked
    uri = _redis_uri()
    if not uri.startswith('redis://'):
        return None

    with _redis_lock:
        if _redis_checked:
            return _redis_client
        _redis_checked = True
        try:
            import redis  # type: ignore

            client = redis.from_url(uri, socket_connect_timeout=2, socket_timeout=2)
            client.ping()
            _redis_client = client
            logger.info('[SECURITY] Custom rate limiters using Redis storage')
        except Exception as exc:
            logger.warning(
                '[SECURITY] Custom rate limiters using in-memory fallback (%s)',
                exc,
            )
            _redis_client = None
        return _redis_client


def reset_rate_limit_redis_for_tests() -> None:
    """Test helper only."""
    global _redis_client, _redis_checked
    with _redis_lock:
        _redis_client = None
        _redis_checked = False


class RateLimiter:
    """Rate limiter with optional Redis backend (shared) or in-memory fallback."""

    def __init__(
        self,
        max_requests: int = 100,
        window_seconds: int = 60,
        *,
        key_prefix: str = 'voyagr:rl',
    ) -> None:
        self.max_requests: int = max_requests
        self.window_seconds: int = window_seconds
        self.key_prefix: str = key_prefix.rstrip(':')
        self.requests: Dict[str, List[Tuple[float, int]]] = {}
        self.lock: threading.Lock = threading.Lock()
        self._redis_failures: int = 0

    def _redis_key(self, ip: str) -> str:
        return f'{self.key_prefix}:{ip}'

    def _is_allowed_redis(self, ip: str) -> Optional[bool]:
        client = get_rate_limit_redis()
        if client is None:
            return None
        try:
            key = self._redis_key(ip)
            count = int(client.incr(key))
            if count == 1:
                client.expire(key, self.window_seconds)
            return count <= self.max_requests
        except Exception as exc:
            self._redis_failures += 1
            if self._redis_failures <= 3 or self._redis_failures % 100 == 0:
                logger.warning('[SECURITY] Redis rate limit error (%s); in-memory fallback', exc)
            return None

    def _is_allowed_memory(self, ip: str) -> bool:
        with self.lock:
            now: float = time.time()
            if ip not in self.requests:
                self.requests[ip] = []

            self.requests[ip] = [
                (ts, count) for ts, count in self.requests[ip]
                if now - ts < self.window_seconds
            ]

            total: int = sum(count for _, count in self.requests[ip])
            if total >= self.max_requests:
                return False

            if self.requests[ip] and self.requests[ip][-1][0] == now:
                ts, count = self.requests[ip][-1]
                self.requests[ip][-1] = (ts, count + 1)
            else:
                self.requests[ip].append((now, 1))

            return True

    def is_allowed(self, ip: str) -> bool:
        redis_result = self._is_allowed_redis(ip)
        if redis_result is not None:
            return redis_result
        return self._is_allowed_memory(ip)


def rate_limit(limiter: RateLimiter) -> Callable[[F], F]:
    """Decorator for rate limiting endpoints."""

    def decorator(f: F) -> F:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            ip: Optional[str] = get_client_ip()
            if ip and not limiter.is_allowed(ip):
                logger.warning('Rate limit exceeded for IP: %s', ip)
                return jsonify({
                    'success': False,
                    'error': 'Rate limit exceeded. Try again later.',
                }), 429
            return f(*args, **kwargs)

        return decorated_function  # type: ignore

    return decorator


def rate_limit_page(limiter: RateLimiter) -> Callable[[F], F]:
    """Decorator for rate limiting HTML page routes (plain 429, not JSON).

    Used for the PWA shell at GET / which is server-rendered and no-store —
    a flood of shell requests is a cheap application-layer DoS against gunicorn.
    Limits are intentionally looser than auth routes so normal reloads / tabs
    do not break the app.
    """

    def decorator(f: F) -> F:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            from flask import make_response

            ip: Optional[str] = get_client_ip()
            if ip and not limiter.is_allowed(ip):
                logger.warning('Page rate limit exceeded for IP: %s', ip)
                retry_after = max(1, int(limiter.window_seconds))
                response = make_response(
                    'Too Many Requests. Please wait a moment and try again.',
                    429,
                )
                response.headers['Retry-After'] = str(retry_after)
                response.headers['Cache-Control'] = 'no-store'
                response.mimetype = 'text/plain'
                return response
            return f(*args, **kwargs)

        return decorated_function  # type: ignore

    return decorator
