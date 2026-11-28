"""Offline synthetic-only GH11 response adapter. Never imported by the web app.

Compliance here means directed-edge exclusion in a known synthetic fixture,
not verified legal routing, hazard association, or navigation readiness.
"""
import math
import re


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


def validate_journey(legs, blocked_keys, *, visits, forbidden_turn_pairs,
                     graph_version, coverage="UNKNOWN"):
    """Validate one synthetic continuous journey, including turns across leg seams.

    The caller supplies fixture-authoritative directed turn pairs, not geometry
    inferred turns. General stop/parking/U-turn semantics remain out of scope.
    """
    if not isinstance(graph_version, str) or not re.fullmatch(r"[0-9a-f]{64}", graph_version):
        raise UnverifiedRoute("graph_version_missing")
    if not isinstance(legs, list) or not 1 <= len(legs) <= 25 or not isinstance(visits, list) or len(visits) != len(legs) + 1:
        raise UnverifiedRoute("missing_or_extra_leg")
    for visit in visits:
        if not isinstance(visit, list) or len(visit) != 2 or not all(number(x) for x in visit) or abs(visit[0]) > 180 or abs(visit[1]) > 90:
            raise UnverifiedRoute("invalid_visit")
    if not isinstance(forbidden_turn_pairs, list):
        raise UnverifiedRoute("turn_evidence_missing")
    forbidden = set()
    for pair in forbidden_turn_pairs:
        if not isinstance(pair, list) or len(pair) != 2 or any(type(key) is not int or key < 0 for key in pair):
            raise UnverifiedRoute("invalid_turn_evidence")
        forbidden.add(tuple(pair))
    keys, coordinates = [], []
    distance, duration = 0, 0
    for index, leg in enumerate(legs):
        if not isinstance(leg, dict) or leg.get("graph_version") != graph_version:
            raise UnverifiedRoute("graph_version_mismatch")
        rows = validate_paths(leg, blocked_keys, coverage=coverage, max_paths=1)
        if len(rows) != 1:
            raise UnverifiedRoute("missing_leg_route")
        row = rows[0]
        for actual, expected in ((row["coordinates"][0], visits[index]),
                                 (row["coordinates"][-1], visits[index + 1])):
            if any(abs(a - b) > 1e-7 for a, b in zip(actual, expected)):
                raise UnverifiedRoute("visit_order_or_endpoint_mismatch")
        if coordinates and any(abs(a - b) > 1e-7 for a, b in zip(coordinates[-1], row["coordinates"][0])):
            raise UnverifiedRoute("disconnected_legs")
        coordinates.extend(row["coordinates"] if not coordinates else row["coordinates"][1:])
        keys.extend(row["directed_edge_keys"])
        distance += row["distance_km"]
        duration += row["duration_seconds"]
    if any(pair in forbidden for pair in zip(keys, keys[1:])):
        raise UnverifiedRoute("mandatory_turn_violation")
    if not number(distance) or not number(duration):
        raise UnverifiedRoute("invalid_journey_metrics")
    return {"coordinates": coordinates, "directed_edge_keys": keys,
            "distance_km": distance, "duration_seconds": duration,
            "leg_count": len(legs), "graph_version": graph_version,
            "compliance_scope": "synthetic_continuity_and_turns_only",
            "navigation_allowed": False}
