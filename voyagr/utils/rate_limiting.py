"""
Rate limiting utilities for API endpoints.
"""

import time
import threading
import logging
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

from flask import request, jsonify

logger = logging.getLogger('voyagr_web')

F = TypeVar('F', bound=Callable[..., Any])


class RateLimiter:
    """Simple in-memory rate limiter for API endpoints."""
    
    def __init__(self, max_requests: int = 100, window_seconds: int = 60) -> None:
        self.max_requests: int = max_requests
        self.window_seconds: int = window_seconds
        self.requests: Dict[str, List[Tuple[float, int]]] = {}  # {ip: [(timestamp, count)]}
        self.lock: threading.Lock = threading.Lock()

    def is_allowed(self, ip: str) -> bool:
        """Check if IP is allowed to make a request."""
        with self.lock:
            now: float = time.time()
            if ip not in self.requests:
                self.requests[ip] = []

            # Remove old requests outside the window
            self.requests[ip] = [
                (ts, count) for ts, count in self.requests[ip]
                if now - ts < self.window_seconds
            ]

            # Count total requests in window
            total: int = sum(count for _, count in self.requests[ip])

            if total >= self.max_requests:
                return False

            # Add new request
            if self.requests[ip] and self.requests[ip][-1][0] == now:
                # Same second, increment count
                ts, count = self.requests[ip][-1]
                self.requests[ip][-1] = (ts, count + 1)
            else:
                self.requests[ip].append((now, 1))

            return True


def rate_limit(limiter: RateLimiter) -> Callable[[F], F]:
    """Decorator for rate limiting endpoints using in-memory limiter."""
    def decorator(f: F) -> F:
        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Any:
            ip: Optional[str] = request.remote_addr
            if ip and not limiter.is_allowed(ip):
                logger.warning(f"Rate limit exceeded for IP: {ip}")
                return jsonify({'success': False, 'error': 'Rate limit exceeded. Try again later.'}), 429
            return f(*args, **kwargs)
        return decorated_function  # type: ignore
    return decorator

