"""Offline synthetic-only GH11 response adapter. Never imported by the web app.

Compliance here means directed-edge exclusion in a known synthetic fixture,
not verified legal routing, hazard association, or navigation readiness.
"""
import math


class UnverifiedRoute(ValueError):
    pass


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_paths(response, blocked_keys, *, coverage="UNKNOWN", max_paths=3):
    """Reject incomplete evidence before producing any candidate. No fallback.

    Validation is independent of the Java weighting: the adapter checks every
    traversal interval and every returned path, including direction. No caller
    may use this synthetic result as a production avoidance assessment.
    """
    if coverage != "SYNTHETIC_COMPLETE":
        raise UnverifiedRoute("coverage_unverified")
    if type(blocked_keys) not in (set, frozenset, list, tuple) or any(
        type(key) is not int or key < 0 for key in blocked_keys
    ):
        raise UnverifiedRoute("invalid_exclusions")
    if type(max_paths) is not int or not 1 <= max_paths <= 3:
        raise UnverifiedRoute("invalid_candidate_limit")
    if not isinstance(response, dict) or response.get("errors"):
        raise UnverifiedRoute("provider_error")
    raw = response.get("paths")
    if not isinstance(raw, list) or len(raw) > max_paths:
        raise UnverifiedRoute("invalid_candidates")
    result, identities = [], set()
    blocked = set(blocked_keys)
    for path in raw:
        if not isinstance(path, dict):
            raise UnverifiedRoute("invalid_path")
        points = path.get("points")
        if path.get("points_encoded") is not False or not isinstance(points, dict) or points.get("type") != "LineString":
            raise UnverifiedRoute("geometry_contract")
        coords = points.get("coordinates")
        if not isinstance(coords, list) or not 2 <= len(coords) <= 10000:
            raise UnverifiedRoute("invalid_geometry")
        for point in coords:
            if not isinstance(point, list) or len(point) != 2 or not all(number(x) for x in point) or abs(point[0]) > 180 or abs(point[1]) > 90:
                raise UnverifiedRoute("invalid_geometry")
        if any(a == b for a, b in zip(coords, coords[1:])):
            raise UnverifiedRoute("degenerate_geometry")
        if not number(path.get("distance")) or path["distance"] <= 0 or not number(path.get("time")) or path["time"] < 0:
            raise UnverifiedRoute("invalid_metrics")
        details = path.get("details")
        trace = details.get("edge_key") if isinstance(details, dict) else None
        if not isinstance(trace, list) or not trace:
            raise UnverifiedRoute("directed_trace_missing")
        cursor, keys = 0, []
        for segment in trace:
            if not isinstance(segment, list) or len(segment) != 3 or any(type(x) is not int for x in segment):
                raise UnverifiedRoute("invalid_trace")
            start, end, key = segment
            if start != cursor or not start < end < len(coords) or key < 0:
                raise UnverifiedRoute("trace_gap_or_overlap")
            if key in blocked:
                raise UnverifiedRoute("mandatory_edge_violation")
            cursor = end
            keys.append(key)
        if cursor != len(coords) - 1:
            raise UnverifiedRoute("incomplete_trace")
        identity = tuple(keys)
        if identity in identities:
            continue
        identities.add(identity)
        result.append({
            "distance_km": path["distance"] / 1000,
            "duration_seconds": path["time"] / 1000,
            "coordinates": coords,
            "directed_edge_keys": keys,
            "compliance_scope": "synthetic_directed_edges_only",
            "navigation_allowed": False,
        })
    return result
