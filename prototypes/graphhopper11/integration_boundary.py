"""Isolated synthetic integration contract. No web routes or production engine wiring.

Reuses the application's bounded memory-cache implementation, but owns a distinct
instance and per-session secret. Results can never authorize real navigation.
"""
import copy
import hashlib
import hmac
import json
import importlib.util
from pathlib import Path
import re
import secrets
import time

# Load just this pure implementation; importing the routing package would also
# initialize legacy engine/config modules, which is outside this offline harness.
_cache_path = Path(__file__).resolve().parents[2] / "voyagr/services/routing/private_route_cache.py"
_spec = importlib.util.spec_from_file_location("_gh11_private_cache_impl", _cache_path)
_cache_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cache_module)
RouteCache = _cache_module.RouteCache
from .adapter import UnverifiedRoute, number, validate_journey


class StrictPrototypeSession:
    def __init__(self, *, clock=time.monotonic):
        self.clock = clock
        self._secret = secrets.token_bytes(32)
        self.cache = RouteCache(max_size=8, ttl_seconds=60, max_bytes=1024*1024,
                                clock=clock, start_sweeper=False)

    def _key(self, request, policy):
        if not isinstance(request, dict) or set(request) != {"profile", "visits"} or request["profile"] != "car":
            raise UnverifiedRoute("unsupported_request")
        fields = {"graph_version", "source_version", "policy_version", "blocked_keys",
                  "forbidden_turn_pairs", "coverage", "checked_at", "valid_until"}
        if not isinstance(policy, dict) or set(policy) != fields:
            raise UnverifiedRoute("policy_contract")
        for field in ("graph_version", "source_version", "policy_version"):
            if not isinstance(policy[field], str) or not re.fullmatch(r"[0-9a-f]{64}", policy[field]):
                raise UnverifiedRoute("version_missing")
        now = self.clock()
        if (not number(policy["checked_at"]) or not number(policy["valid_until"])
                or not policy["checked_at"] <= now < policy["valid_until"]
                or policy["valid_until"] - policy["checked_at"] > 600):
            raise UnverifiedRoute("evidence_stale")
        if policy["coverage"] != "SYNTHETIC_COMPLETE":
            raise UnverifiedRoute("coverage_unverified")
        visits = request["visits"]
        if not isinstance(visits, list) or not 2 <= len(visits) <= 26:
            raise UnverifiedRoute("invalid_visits")
        for point in visits:
            if (not isinstance(point, list) or len(point) != 2 or not all(number(x) for x in point)
                    or abs(point[0]) > 180 or abs(point[1]) > 90):
                raise UnverifiedRoute("invalid_visits")
        blocks = policy["blocked_keys"]
        turns = policy["forbidden_turn_pairs"]
        if not isinstance(blocks, list) or any(type(k) is not int or k < 0 for k in blocks):
            raise UnverifiedRoute("invalid_exclusions")
        if not isinstance(turns, list) or any(not isinstance(p, list) or len(p) != 2
                or any(type(k) is not int or k < 0 for k in p) for p in turns):
            raise UnverifiedRoute("turn_evidence_missing")
        canonical = json.dumps([self.cache.epoch, request, policy], sort_keys=True,
                               separators=(",", ":"), allow_nan=False)
        return hmac.new(self._secret, canonical.encode(), hashlib.sha256).hexdigest()

    def _validate(self, raw, request, policy):
        if not isinstance(raw, dict) or raw.get("errors"):
            raise UnverifiedRoute("provider_error")
        if any(raw.get(field) != policy[field] for field in ("graph_version", "source_version", "policy_version")):
            raise UnverifiedRoute("version_mismatch")
        candidates = raw.get("candidates")
        if not isinstance(candidates, list) or not 1 <= len(candidates) <= 3:
            raise UnverifiedRoute("no_or_excess_candidates")
        rows = [validate_journey(legs, policy["blocked_keys"], visits=request["visits"],
                    forbidden_turn_pairs=policy["forbidden_turn_pairs"],
                    graph_version=policy["graph_version"], coverage=policy["coverage"])
                for legs in candidates]
        identities = [tuple(row["directed_edge_keys"]) for row in rows]
        if len(set(identities)) != len(identities):
            raise UnverifiedRoute("duplicate_candidate")
        return rows

    def calculate(self, request, policy, provider):
        # Freeze caller-owned state before invoking any injected provider.
        request, policy = copy.deepcopy(request), copy.deepcopy(policy)
        key = self._key(request, policy)
        raw = self.cache.get(key)
        cached = raw is not None
        if not cached:
            try:
                raw = copy.deepcopy(provider(copy.deepcopy(request), copy.deepcopy(policy)))
            except Exception as error:
                raise UnverifiedRoute("provider_failed_no_fallback") from error
        self._key(request, policy)  # Freshness may have changed during calculation.
        rows = self._validate(raw, request, policy)  # Also recheck every cache hit.
        if not cached and not self.cache.set(key, raw):
            raise UnverifiedRoute("prototype_result_not_retained")
        return {"handle": key, "cached": cached, "candidates": rows, "navigation_allowed": False}

    def select(self, handle, index, request, policy):
        request, policy = copy.deepcopy(request), copy.deepcopy(policy)
        key = self._key(request, policy)
        if not isinstance(handle, str) or not re.fullmatch(r"[0-9a-f]{64}", handle) or not hmac.compare_digest(handle, key):
            raise UnverifiedRoute("selection_context_changed")
        raw = self.cache.get(key)
        if raw is None:
            raise UnverifiedRoute("selection_expired")
        rows = self._validate(raw, request, policy)
        if type(index) is not int or not 0 <= index < len(rows):
            raise UnverifiedRoute("invalid_selection")
        return copy.deepcopy(rows[index])
