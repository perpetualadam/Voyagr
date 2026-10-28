"""Bounded process-local Overpass acquisition. Accepted data is not coverage proof."""

from collections import OrderedDict
import copy
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
import hashlib
import ipaddress
import json
import math
import os
import re
import threading
import time
from urllib.parse import urlsplit
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests
from voyagr.utils import request_budget as route_transport
from voyagr.utils import overpass_audit as audit

PUBLIC_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
CUSTOM_OVERPASS_URL = (os.getenv("OVERPASS_API_URL") or "").strip()
# Existing mirrors remain the explicit default allowlist. Env may select a subset.
_public_config = os.getenv("OVERPASS_PUBLIC_ENDPOINTS")
_public = (
    list(PUBLIC_ENDPOINTS)
    if _public_config is None
    else [e.strip() for e in _public_config.split(",") if e.strip()]
)
if any(endpoint not in PUBLIC_ENDPOINTS for endpoint in _public):
    raise ValueError("public_endpoint_not_allowlisted")
OVERPASS_ENDPOINTS = list(
    dict.fromkeys(([CUSTOM_OVERPASS_URL] if CUSTOM_OVERPASS_URL else []) + _public)
)
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_ELEMENTS = 20000
SCHEMA_VERSION = 1


def category(query):
    return (
        "traffic_signals"
        if "traffic_signals" in query
        else (
            "railway_crossings"
            if "level_crossing" in query
            else (
                "parking"
                if "parking" in query
                else "road_attributes" if "highway" in query else "poi_or_other"
            )
        )
    )


def canonical_query(query):
    """Remove insignificant whitespace outside strings; preserve numbers/order/quoted text.

    Comments and escaped strings are preserved verbatim; no risky algebraic QL rewrite.
    """
    if not isinstance(query, str) or len(query.encode()) > 65536:
        raise ValueError("query_limit")
    if "//" in query or "/*" in query:
        return query
    tokens = re.findall(
        r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_][A-Za-z_0-9]*|[0-9]+(?:\.[0-9]+)?|==|!=|<=|>=|->|[^\s]',
        query,
    )
    return " ".join(tokens)


def unavailable(reason, state="UNAVAILABLE"):
    return {
        "success": False,
        "elements": [],
        "error": reason,
        "response_state": state,
        "coverage_status": "UNKNOWN",
        "cached": False,
    }


class OverpassCache:
    """Bounded, locked LRU with monotonic TTL and full evidence envelopes."""

    def __init__(self, default_ttl=300, max_entries=128, max_bytes=16 * 1024 * 1024):
        self.default_ttl = default_ttl
        self.max_entries = max(1, min(128, max_entries))
        self.max_bytes = max(0, min(16 * 1024 * 1024, max_bytes))
        self._cache = OrderedDict()
        self._lock = threading.RLock()
        self._hits = 0
        self._misses = 0

    def _generate_key(self, query, extra_key=""):
        return hashlib.sha256((query + "\0" + extra_key).encode()).hexdigest()

    def lookup(self, key):
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return None, "MISS"
            if (
                time.monotonic() >= entry["expires"]
                or not 0 <= time.time() - entry["data"]["retrieved_at"] <= 300
            ):
                del self._cache[key]
                self._misses += 1
                return None, "STALE"
            self._hits += 1
            self._cache.move_to_end(key)
            return copy.deepcopy(entry["data"]), "HIT"

    def get(self, key):
        return self.lookup(key)[0]

    def set(self, key, data, ttl=None):
        if (
            not isinstance(data, dict)
            or not data.get("success")
            or data.get("response_state") not in ("VALID_EMPTY", "VALID_WITH_DATA")
            or not isinstance(data.get("retrieved_at"), (int, float))
        ):
            return
        ttl = min(300, max(0, self.default_ttl if ttl is None else ttl))
        size = len(json.dumps(data, separators=(",", ":")).encode())
        if not ttl or size > self.max_bytes:
            return
        with self._lock:
            self.cleanup_expired()
            snapshot = copy.deepcopy(data)
            route_transport.check_budget()
            self._cache[key] = {
                "data": snapshot,
                "expires": time.monotonic() + ttl,
                "size": size,
            }
            self._cache.move_to_end(key)
            while (
                len(self._cache) > self.max_entries
                or sum(e["size"] for e in self._cache.values()) > self.max_bytes
            ):
                self._cache.popitem(last=False)

    def invalidate(self, key):
        with self._lock:
            return self._cache.pop(key, None) is not None

    def clear(self):
        with self._lock:
            n = len(self._cache)
            self._cache.clear()
            return n

    def cleanup_expired(self):
        with self._lock:
            keys = [
                k for k, v in self._cache.items() if time.monotonic() >= v["expires"]
            ]
            for k in keys:
                del self._cache[k]
            return len(keys)

    @property
    def stats(self):
        with self._lock:
            return {
                "size": len(self._cache),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": self._hits / max(1, self._hits + self._misses),
            }


_overpass_cache = OverpassCache()


def _finite(value, limit):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and abs(value) <= limit
    )


def validate_payload(raw):
    """Byte-bounded parse + OSM envelope/structure validation; never interpret remark as empty."""
    if len(raw) > MAX_RESPONSE_BYTES:
        return unavailable("response_size_limit", "PARTIAL")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        return unavailable("invalid_json", "INVALID_RESPONSE")
    if not isinstance(data, dict) or not isinstance(data.get("elements"), list):
        return unavailable("invalid_schema", "INVALID_RESPONSE")
    if "remark" in data or "error" in data:
        return unavailable(
            "runtime_error", "PARTIAL" if data["elements"] else "INVALID_RESPONSE"
        )
    elements = data["elements"]
    if len(elements) > MAX_ELEMENTS:
        return unavailable("element_limit", "PARTIAL")
    for i, e in enumerate(elements):
        if i % 256 == 0:
            route_transport.check_budget()
        if not isinstance(e, dict) or e.get("type") not in (
            "node",
            "way",
            "relation",
            "area",
            "count",
        ):
            return unavailable("invalid_element", "INVALID_RESPONSE")
        if e["type"] != "count" and (
            not isinstance(e.get("id"), int)
            or isinstance(e["id"], bool)
            or e["id"] <= 0
        ):
            return unavailable("invalid_element", "INVALID_RESPONSE")
        if "tags" in e and (
            not isinstance(e["tags"], dict)
            or not all(
                isinstance(k, str) and isinstance(v, str) for k, v in e["tags"].items()
            )
        ):
            return unavailable("invalid_tags", "INVALID_RESPONSE")
        for point in (
            [e]
            + ([e["center"]] if "center" in e else [])
            + (e.get("geometry") if isinstance(e.get("geometry"), list) else [])
        ):
            if not isinstance(point, dict):
                return unavailable("invalid_geometry", "INVALID_RESPONSE")
            if "lat" in point or "lon" in point:
                if not (
                    _finite(point.get("lat"), 90) and _finite(point.get("lon"), 180)
                ):
                    return unavailable("invalid_coordinates", "INVALID_RESPONSE")
        if "geometry" in e and not isinstance(e["geometry"], list):
            return unavailable("invalid_geometry", "INVALID_RESPONSE")
        if "nodes" in e and (
            not isinstance(e["nodes"], list)
            or not all(
                isinstance(n, int) and not isinstance(n, bool) and n > 0
                for n in e["nodes"]
            )
        ):
            return unavailable("invalid_nodes", "INVALID_RESPONSE")
    timestamp = (
        (data.get("osm3s") or {}).get("timestamp_osm_base")
        if isinstance(data.get("osm3s", {}), dict)
        else None
    )
    return {
        "success": True,
        "elements": elements,
        "response_state": "VALID_WITH_DATA" if elements else "VALID_EMPTY",
        "coverage_status": "PARTIAL",
        "dataset_coverage": "UNVERIFIED",
        "dataset_timestamp": timestamp if isinstance(timestamp, str) else None,
        "retrieved_at": time.time(),
        "cached": False,
    }


@dataclass
class Flight:
    done: threading.Event = field(default_factory=threading.Event)
    result: dict = field(default_factory=lambda: unavailable("owner_failed"))


class OverpassClient:
    def __init__(
        self,
        endpoints=None,
        timeout=20,
        max_retries=3,
        base_delay=1.0,
        max_delay=30.0,
        cache=None,
        max_elapsed=12,
        max_inflight=32,
        max_concurrent=2,
        dataset_revision="unknown",
        clock=None,
    ):
        self.endpoints = list(
            dict.fromkeys(OVERPASS_ENDPOINTS if endpoints is None else endpoints)
        )
        if len(self.endpoints) > 5:
            raise ValueError("endpoint_limit")
        for ep in self.endpoints:
            u = urlsplit(ep)
            if (
                u.scheme not in ("http", "https")
                or not u.hostname
                or u.username
                or u.password
                or u.query
                or u.fragment
            ):
                raise ValueError("invalid_overpass_endpoint")
            try:
                is_local = ipaddress.ip_address(u.hostname).is_private
            except ValueError:
                is_local = u.hostname in ("localhost", "overpass")
            if (
                not is_local
                and ep not in PUBLIC_ENDPOINTS
                and ep != CUSTOM_OVERPASS_URL
            ):
                raise ValueError("public_endpoint_not_allowlisted")
        self.timeout = min(20, max(0.05, timeout))
        self.max_retries = min(3, max(1, max_retries))
        self.base_delay = max(0, base_delay)
        self.max_delay = min(30, max_delay)
        self.max_elapsed = min(30, max(0.05, max_elapsed))
        self.cache = cache if cache is not None else _overpass_cache
        self.dataset_revision = dataset_revision
        self.clock = clock or time.monotonic
        self._lock = threading.RLock()
        self._health = {}
        self._flights = {}
        self.max_inflight = max(1, min(32, max_inflight))
        self._permits = threading.BoundedSemaphore(max(1, min(2, max_concurrent)))

    def _class(self, ep):
        return "PUBLIC" if ep in PUBLIC_ENDPOINTS else "LOCAL"

    def _get_next_endpoint(self):
        with self._lock:
            return next(
                (e for e in self.endpoints if self._health.get(e, 0) <= self.clock()),
                None,
            )

    def _calculate_delay(self, attempt):
        return min(self.base_delay * 2**attempt, self.max_delay)

    def _key(self, query):
        # Caller labels never override actual QL/source/schema identity. Digest stays private.
        return self.cache._generate_key(
            canonical_query(query),
            json.dumps(
                [self.endpoints, category(query), self.dataset_revision, SCHEMA_VERSION]
            ),
        )

    def query(
        self, query, cache_key=None, cache_ttl=None, skip_cache=False, cancel_event=None
    ):
        operation = uuid.uuid4().hex
        kind = category(query)
        budget = route_transport.WorkBudget(
            self.max_elapsed,
            parent=route_transport.current_budget(),
            cancel_event=cancel_event,
            expiry_exception=route_transport.AcquisitionDeadlineExceeded,
        )
        outcome = "exception"
        classification = "UNKNOWN"
        coverage_status = "UNKNOWN"
        with route_transport.use_budget(budget):
            try:
                budget.check()
                key = self._key(query)
                audit.emit(
                    "query_started",
                    operation=operation,
                    query_kind=kind,
                    budget_present=True,
                    remaining_ms=round(budget.remaining() * 1000, 3),
                )
                cache_state = "BYPASS" if skip_cache else "MISS"
                if not skip_cache:
                    cached, cache_state = self.cache.lookup(key)
                    if cached is not None:
                        budget.check()
                        cached["cached"] = True
                        outcome = "cache_hit"
                        classification = cached.get("response_state", "UNKNOWN")
                        coverage_status = cached.get("coverage_status", "UNKNOWN")
                        return cached
                with self._lock:
                    # Close the miss/owner-completion race under the flight lock.
                    cached = None if skip_cache else self.cache.get(key)
                    if cached is not None:
                        budget.check()
                        cached["cached"] = True
                        outcome = "cache_hit"
                        classification = cached.get("response_state", "UNKNOWN")
                        coverage_status = cached.get("coverage_status", "UNKNOWN")
                        return cached
                    flight = self._flights.get(key)
                    owner = flight is None
                    if owner:
                        if len(self._flights) >= self.max_inflight:
                            return unavailable("inflight_limit")
                        flight = Flight()
                        self._flights[key] = flight
                if not owner:
                    audit.emit("inflight_wait", operation=operation)
                    while not flight.done.wait(min(0.05, budget.remaining())):
                        budget.check()
                    budget.check()
                    shared = copy.deepcopy(flight.result)
                    budget.check()
                    outcome = "shared"
                    classification = shared.get("response_state", "UNKNOWN")
                    coverage_status = shared.get("coverage_status", "UNKNOWN")
                    return shared
                try:
                    if not self._permits.acquire(blocking=False):
                        result = unavailable("acquisition_busy")
                    else:
                        try:
                            result = self._acquire(query, operation, budget)
                        finally:
                            self._permits.release()
                    budget.check()
                    if not result["success"] and cache_state == "STALE":
                        result["previous_evidence_state"] = "STALE"
                    # Cancellation and cache publication have a defined local ordering.
                    with budget.publish_lock:
                        budget.check()
                        if result["success"]:
                            self.cache.set(key, result, cache_ttl)
                    flight.result = copy.deepcopy(result)
                    outcome = result["response_state"]
                    classification = result["response_state"]
                    coverage_status = result.get("coverage_status", "UNKNOWN")
                    return result
                except route_transport.RoutingDeadlineExceeded as error:
                    reason = (
                        "owner_cancelled"
                        if isinstance(error, route_transport.RoutingCancelled)
                        else (
                            "acquisition_deadline_exceeded"
                            if isinstance(
                                error, route_transport.AcquisitionDeadlineExceeded
                            )
                            else "owner_request_deadline"
                        )
                    )
                    flight.result = unavailable(reason)
                    raise
                finally:
                    with self._lock:
                        self._flights.pop(key, None)
                        flight.done.set()
            except route_transport.AcquisitionDeadlineExceeded:
                outcome = "acquisition_deadline_exceeded"
                return unavailable(outcome)
            except route_transport.RoutingCancelled:
                outcome = "cancelled"
                raise
            except route_transport.RoutingDeadlineExceeded:
                outcome = "deadline_exceeded"
                raise
            finally:
                audit.emit(
                    "query_finished",
                    operation=operation,
                    outcome=outcome,
                    response_state=classification,
                    coverage_status=coverage_status,
                    duration_ms=round((budget.clock() - budget.started) * 1000, 3),
                )

    def _acquire(self, query, operation, budget):
        last = unavailable("no_available_endpoint")
        public_attempts = 0
        for slot, ep in enumerate(self.endpoints):
            budget.check()
            with self._lock:
                if self._health.get(ep, 0) > self.clock():
                    continue
            epclass = self._class(ep)
            if epclass == "PUBLIC":
                if public_attempts >= 2:
                    break
                public_attempts += 1
            attempts = self.max_retries if epclass == "LOCAL" else 1
            for attempt in range(attempts):
                budget.check()
                response = None
                retry_after = 0
                try:
                    audit.emit(
                        "attempt_started",
                        operation=operation,
                        query_kind=category(query),
                        endpoint_class=epclass,
                        endpoint_slot=slot,
                        attempt=attempt + 1,
                    )
                    response = route_transport.post(
                        ep,
                        data={"data": query},
                        timeout=self.timeout,
                        headers={"User-Agent": "Voyagr-PWA/1.0"},
                        stream=True,
                        allow_redirects=False,
                    )
                    budget.check()
                    status = response.status_code
                    audit.emit(
                        "http_response",
                        operation=operation,
                        endpoint_class=epclass,
                        endpoint_slot=slot,
                        status=status,
                    )
                    if status == 200:
                        if (
                            "json"
                            not in response.headers.get("Content-Type", "").lower()
                        ):
                            last = unavailable(
                                "invalid_content_type", "INVALID_RESPONSE"
                            )
                            continue_parse = False
                        else:
                            continue_parse = True
                        length = response.headers.get("Content-Length")
                        if not continue_parse:
                            pass
                        elif length and (
                            not length.isdigit() or int(length) > MAX_RESPONSE_BYTES
                        ):
                            last = unavailable("response_size_limit", "PARTIAL")
                        else:
                            raw = bytearray()
                            for chunk in response.iter_content(16384):
                                budget.check()
                                raw.extend(chunk)
                                if len(raw) > MAX_RESPONSE_BYTES:
                                    break
                            budget.check()
                            last = validate_payload(bytes(raw))
                            budget.check()
                        if last["success"]:
                            last.update(
                                endpoint_class=epclass,
                                endpoint_slot=slot,
                                source_version=self.dataset_revision,
                            )
                            with self._lock:
                                self._health.pop(ep, None)
                            return last
                    elif status in (429, 502, 503, 504) or status >= 500:
                        last = unavailable(
                            "rate_limited" if status == 429 else "http_server_error"
                        )
                        if status == 429:
                            text = response.headers.get("Retry-After", "")
                            try:
                                retry_after = max(0, float(text))
                            except ValueError:
                                try:
                                    retry_after = max(
                                        0,
                                        parsedate_to_datetime(text).timestamp()
                                        - time.time(),
                                    )
                                except (TypeError, ValueError, OverflowError):
                                    retry_after = 1
                            if not math.isfinite(retry_after):
                                retry_after = 30
                            retry_after = min(60, retry_after)
                            if (
                                slot == len(self.endpoints) - 1
                                and retry_after >= budget.remaining()
                            ):
                                raise route_transport.RoutingDeadlineExceeded(
                                    "Insufficient Overpass retry budget"
                                )
                    else:
                        last = unavailable(
                            (
                                "http_client_error"
                                if 400 <= status < 500
                                else "unexpected_http_status"
                            ),
                            "INVALID_RESPONSE",
                        )
                except route_transport.RoutingDeadlineExceeded:
                    raise
                except requests.exceptions.Timeout:
                    last = unavailable("provider_timeout")
                except requests.exceptions.RequestException:
                    last = unavailable("connection_error")
                finally:
                    if response is not None:
                        response.close()
                audit.emit(
                    "acquisition_failure",
                    operation=operation,
                    endpoint_class=epclass,
                    reason=last["error"],
                    response_state=last["response_state"],
                )
                with self._lock:
                    self._health[ep] = self.clock() + max(2, retry_after)
                # Runtime/schema failures do not benefit from immediate repetition.
                if retry_after or last["response_state"] in (
                    "INVALID_RESPONSE",
                    "PARTIAL",
                ):
                    break
                if attempt + 1 < attempts:
                    delay = self._calculate_delay(attempt)
                    audit.emit(
                        "retry_wait",
                        operation=operation,
                        reason=last["error"],
                        delay_ms=round(delay * 1000, 3),
                    )
                    route_transport.retry_wait(delay)
        return last

    def get_cache_stats(self):
        return self.cache.stats

    def clear_cache(self):
        return self.cache.clear()


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

# Global client instance
_default_client: Optional[OverpassClient] = None
_default_client_lock = threading.Lock()


def get_client() -> OverpassClient:
    """Get or create the default Overpass client."""
    global _default_client
    with _default_client_lock:
        if _default_client is None:
            _default_client = OverpassClient()
    return _default_client


def query_overpass(
    query: str,
    cache_key: Optional[str] = None,
    cache_ttl: Optional[int] = None,
    skip_cache: bool = False,
) -> Dict[str, Any]:
    """
    Convenience function to query Overpass API using the default client.

    Args:
        query: Overpass QL query string
        cache_key: Optional custom cache key
        cache_ttl: Cache TTL in seconds
        skip_cache: If True, skip cache lookup

    Returns:
        Dict with 'success' boolean and either 'elements' list or 'error' string
    """
    return get_client().query(query, cache_key, cache_ttl, skip_cache)


def get_overpass_cache_stats() -> Dict[str, Any]:
    """Get cache statistics for the default client."""
    return get_client().get_cache_stats()


def clear_overpass_cache() -> int:
    """Clear the Overpass cache. Returns number of entries cleared."""
    return get_client().clear_cache()


# ============================================================================
# PRESET QUERY BUILDERS
# ============================================================================


def _bounded_bbox(south, west, north, east):
    if not (
        _finite(south, 90)
        and _finite(north, 90)
        and _finite(west, 180)
        and _finite(east, 180)
    ):
        raise ValueError("invalid_bbox")
    if (
        not south <= north
        or not west <= east
        or north - south > 0.35
        or east - west > 0.35
    ):
        raise ValueError("bbox_limit")


def build_traffic_signals_query(
    min_lat: float, min_lng: float, max_lat: float, max_lng: float
) -> str:
    """Build a query for traffic signals in a bounding box."""
    _bounded_bbox(min_lat, min_lng, max_lat, max_lng)
    return f"""
    [out:json][timeout:15][maxsize:{MAX_RESPONSE_BYTES}];
    (
        node["highway"="traffic_signals"]({min_lat},{min_lng},{max_lat},{max_lng});
        node["crossing"="traffic_signals"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    """


def build_railway_level_crossings_query(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
) -> str:
    """Build a query for road–rail level crossings (vehicle-relevant) in a bounding box."""
    _bounded_bbox(min_lat, min_lng, max_lat, max_lng)
    return f"""
    [out:json][timeout:20][maxsize:{MAX_RESPONSE_BYTES}];
    (
        node["railway"="level_crossing"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    """


def build_corridor_traffic_signals_query(
    points: List[Tuple[float, float]], radius: int = 100
) -> str:
    """
    Build a query for traffic signals along a corridor (polyline).
    Uses the 'around' filter to find nodes within radius of the path.

    Args:
        points: List of (lat, lon) tuples defining the path
        radius: Search radius in meters around the path points
    """
    if not 1 <= radius <= 500 or not 1 <= len(points) <= 250:
        raise ValueError("corridor_limit")
    # Format points for the query: "lat1,lon1,lat2,lon2..."
    # Limit precision to 5 decimal places to save space
    flat_points = []
    for point in points:
        # Handle both [lon, lat] (GeoJSON) and (lat, lon) formats
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            # Assume input is [lon, lat] from GeoJSON by default, but check context
            # The calling function passes [c[1], c[0]] which is [lat, lon]
            lat, lon = point[0], point[1]
            flat_points.append(f"{lat:.5f},{lon:.5f}")

    poly_str = ",".join(flat_points)

    # Use longer timeout for corridor queries (they're more complex)
    # Server timeout is a directive, not installed capacity or a client deadline.
    return f"""
    [out:json][timeout:60];
    (
        node["highway"="traffic_signals"](around:{radius},{poly_str});
        node["crossing"="traffic_signals"](around:{radius},{poly_str});
    );
    out body;
    """


def build_poi_query(
    lat: float,
    lon: float,
    radius: int,
    amenities: List[str],
    shops: Optional[List[str]] = None,
) -> str:
    """Build a query for POIs around a point (amenity=* and/or shop=* OSM tags)."""
    if not (_finite(lat, 90) and _finite(lon, 180) and 1 <= radius <= 5000):
        raise ValueError("poi_extent_limit")
    if len(amenities) + len(shops or []) > 32:
        raise ValueError("poi_complexity_limit")
    parts: List[str] = [
        f'node["amenity"="{a}"](around:{radius},{lat},{lon});' for a in amenities
    ]
    for s in shops or []:
        parts.append(f'node["shop"="{s}"](around:{radius},{lat},{lon});')
    body = "".join(parts)
    return f"""
    [out:json][timeout:10][maxsize:{MAX_RESPONSE_BYTES}];
    (
        {body}
    );
    out body;
    """


def build_speed_cameras_query(
    min_lat: float, min_lng: float, max_lat: float, max_lng: float
) -> str:
    """Build a query for speed cameras in a bounding box."""
    return f"""
    [out:json][timeout:10][maxsize:{MAX_RESPONSE_BYTES}];
    (
        node["highway"="speed_camera"]({min_lat},{min_lng},{max_lat},{max_lng});
        node["man_made"="surveillance"]["surveillance:type"="camera"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    """


def build_toll_roads_query(
    min_lat: float, min_lng: float, max_lat: float, max_lng: float
) -> str:
    """Build a query for toll roads in a bounding box."""
    return f"""
    [out:json][timeout:10][maxsize:{MAX_RESPONSE_BYTES}];
    (
        node["barrier"="toll_booth"]({min_lat},{min_lng},{max_lat},{max_lng});
        way["toll"="yes"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    >;
    out skel qt;
    """


def build_lanes_query(lat: float, lon: float, radius: int = 50) -> str:
    """Build a query for lane information near a point."""
    return f"""
    [out:json][timeout:5];
    way(around:{radius},{lat},{lon})["lanes"];
    out body;
    """
