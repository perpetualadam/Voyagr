"""
Client IP detection for rate limiting and optional API-key auth.

When Voyagr sits behind a reverse proxy (Railway, nginx, Cloudflare), the TCP
peer may be the proxy, not the browser. Use VOYAGR_TRUST_PROXY=1 so we read
X-Forwarded-For (leftmost hop = original client when the edge proxy appends).
"""

from __future__ import annotations

import os

from flask import request


def get_client_ip() -> str:
    """Best-effort client IP for abuse controls (not for cryptographically strong identity)."""
    if os.getenv("VOYAGR_TRUST_PROXY", "").strip().lower() in ("1", "true", "yes"):
        xff = (request.headers.get("X-Forwarded-For") or "").strip()
        if xff:
            part = xff.split(",")[0].strip()
            if part:
                return part
    addr = request.remote_addr
    return addr if addr else "0.0.0.0"


def is_local_client_request() -> bool:
    """True when the apparent client is loopback (local dev convenience)."""
    ip = get_client_ip()
    return ip in ("127.0.0.1", "::1", "localhost")
