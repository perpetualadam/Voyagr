"""Separate private-cache instance, reusing the actual app implementation only."""
import importlib.util
from pathlib import Path
import secrets
import time

from flask import has_request_context, request

IMPLEMENTATION = Path(__file__).resolve().parents[2]/'voyagr/services/routing/private_route_cache.py'


class PrivateCompleteCache:
    def __init__(self, *, clock=time.monotonic, start_sweeper=True):
        spec = importlib.util.spec_from_file_location('_gh11_cache_'+secrets.token_hex(8),IMPLEMENTATION)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        # Never use the UK module singleton, signing secret or cookie namespace.
        self.module.COOKIE = '__Host-voyagr-gh11-scope'
        self.store = self.module.RouteCache(max_size=8,ttl_seconds=30,max_bytes=2*1024*1024,
                                           clock=clock,sweep_seconds=5,start_sweeper=start_sweeper)
        self.module.route_cache = self.store

    def protect(self, handler):
        from functools import wraps
        scoped = self.module.private_route_session(handler)
        @wraps(handler)
        def secure_only(*args, **kwargs):
            if request.is_secure and request.path in ('/api/prototype/app-route','/api/prototype/app-restore'):
                return scoped(*args, **kwargs)
            return handler(*args, **kwargs)
        return secure_only

    def key(self, resolved, *, bypass=False):
        if not has_request_context() or not request.is_secure:
            return None
        return self.module.request_cache_key(resolved,bypass=bypass)
