"""Private, bounded, process-only route responses; no database or account identity.

HTTPS host-only HttpOnly capabilities isolate browsers. Keys are process-keyed
MACs of complete resolved requests. Worker changes/restarts simply miss the cache.
"""
from collections import OrderedDict
from functools import wraps
import hashlib
import hmac
import json
import secrets
import threading
import time

from flask import g, has_request_context, make_response, request

COOKIE = '__Host-voyagr-route-scope'
SCOPE_SECONDS = 900
_SECRET = secrets.token_bytes(32)


def _mac(value):
    return hmac.new(_SECRET, value.encode(), hashlib.sha256).hexdigest()


def _new_scope():
    value = f'{secrets.token_hex(32)}.{int(time.time())}'
    return value + '.' + _mac(value)


def _valid_scope(token):
    if not isinstance(token, str) or len(token) > 160:
        return False
    try:
        nonce, issued, signature = token.split('.')
        age = time.time() - int(issued)
        return (len(nonce) == 64 and all(c in '0123456789abcdef' for c in nonce)
                and 0 <= age < SCOPE_SECONDS
                and hmac.compare_digest(signature, _mac(nonce + '.' + issued)))
    except (ValueError, TypeError):
        return False


def private_route_session(handler):
    """A missing/invalid capability causes a fresh scope, never a routing refusal."""
    @wraps(handler)
    def wrapped(*args, **kwargs):
        token = request.cookies.get(COOKIE)
        fresh = not _valid_scope(token)
        g.private_route_scope = _new_scope() if fresh else token
        g.private_route_key = None
        g.private_route_cache_written = False
        response = make_response(handler(*args, **kwargs))
        response.headers['Cache-Control'] = 'private, no-store'
        response.vary.add('Cookie')
        # Never set a cache capability on invalid/failed route requests.
        payload = response.get_json(silent=True)
        if (fresh and g.private_route_cache_written and response.status_code == 200
                and isinstance(payload, dict) and payload.get('success') is True):
            response.set_cookie(COOKIE, g.private_route_scope, max_age=SCOPE_SECONDS,
                                secure=True, httponly=True, samesite='Strict', path='/')
        return response
    return wrapped


def request_cache_key(resolved_request, cost_fingerprint='', *, bypass=False):
    """Include all inputs, including exact fixes, waypoints, time windows and cost.

    Caller-supplied account IDs are ignored, not used to partition/cache identity.
    No valid capability/context -> no cache access. JSON problems bypass caching.
    """
    if not has_request_context():
        return None
    token = getattr(g, 'private_route_scope', None)
    if bypass or not _valid_scope(token):
        return None
    try:
        data = {k: v for k, v in resolved_request.items() if k not in ('user_id', 'account_id')}
        canonical = json.dumps([data, cost_fingerprint], sort_keys=True, allow_nan=False,
                               separators=(',', ':'))
        key = _mac(token + '\0' + route_cache.epoch + '\0' + canonical)
        g.private_route_key = key
        return key
    except (TypeError, ValueError):
        return None


class RouteCache:
    """14-minute serving lifetime + <=60s sweep, bounded count/bytes, no sliding TTL.

    The cap is a normal-running retention target, not secure RAM/swap erasure.
    Idle expired entries are removed without requiring a subsequent cache lookup.
    """
    def __init__(self, max_size=1000, ttl_seconds=840, max_bytes=32*1024*1024,
                 *, clock=time.monotonic, sweep_seconds=60, start_sweeper=True):
        self.max_size = max(1, min(1000, max_size))
        self.ttl_seconds = max(0, min(840, ttl_seconds))
        self.max_bytes = max(0, min(32*1024*1024, max_bytes))
        self.clock = clock
        self.sweep_seconds = max(.01, min(60, sweep_seconds))
        self.cache = OrderedDict()
        self.lock = threading.RLock()
        self.hits = self.misses = self.bytes = 0
        self._timer = None
        self.epoch = secrets.token_hex(16)
        self._start_sweeper = start_sweeper

    def _remove(self, key):
        entry = self.cache.pop(key)
        self.bytes -= len(entry[1])

    def _expire_locked(self):
        now = self.clock()
        for key, (expires, _) in list(self.cache.items()):
            if now >= expires:
                self._remove(key)

    def expire(self):
        with self.lock:
            self._expire_locked()

    def _sweep(self):
        with self.lock:
            self._timer = None
            self._expire_locked()
            if self.cache:
                self._schedule_locked()

    def _schedule_locked(self):
        if self._start_sweeper and self._timer is None:
            self._timer = threading.Timer(self.sweep_seconds, self._sweep)
            self._timer.daemon = True
            self._timer.start()

    def get(self, key, *legacy, **kwargs):
        if legacy or kwargs:
            return None  # Unscoped coordinate-based callers must calculate afresh.
        with self.lock:
            self._expire_locked()
            if not key or key not in self.cache:
                self.misses += 1
                return None
            self.hits += 1
            self.cache.move_to_end(key)
            return json.loads(self.cache[key][1])  # independent response per request

    def set(self, key, route_data, *legacy, **kwargs):
        if legacy or kwargs:
            return False  # Compatibility bypass, never a shared location cache.
        if not key:
            return False
        try:
            body = json.dumps(route_data, allow_nan=False, separators=(',', ':')).encode()
        except (ValueError, TypeError):
            return False
        if len(body) > min(self.max_bytes, 4*1024*1024):
            return False  # cache failure must never fail navigation
        with self.lock:
            self._expire_locked()
            if key in self.cache:
                return False  # replacement/hits cannot extend the original lifetime
            while self.cache and (len(self.cache) >= self.max_size or self.bytes + len(body) > self.max_bytes):
                self._remove(next(iter(self.cache)))
            self.cache[key] = (self.clock() + self.ttl_seconds, body)
            self.bytes += len(body)
            if has_request_context() and key == getattr(g, 'private_route_key', None):
                g.private_route_cache_written = True
            self._schedule_locked()
            return True

    def clear(self):
        with self.lock:
            self.cache.clear()
            self.epoch = secrets.token_hex(16)
            self.bytes = 0
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None

    def get_stats(self):
        # Operator-only; never attach shared counters to a public route response.
        with self.lock:
            self._expire_locked()
            total = self.hits + self.misses
            return dict(hits=self.hits, misses=self.misses, total=total,
                        hit_rate=f'{self.hits / total * 100 if total else 0:.1f}%',
                        size=len(self.cache), max_size=self.max_size, bytes=self.bytes,
                        ttl_seconds=self.ttl_seconds)


# One singleton shared by compatibility exports and the active web application.
route_cache = RouteCache()
