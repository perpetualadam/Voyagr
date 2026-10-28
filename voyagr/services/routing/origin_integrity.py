"""Provider-independent endpoint continuity; no inferred road connector or exit exception.

Two metres is a numerical continuity tolerance: the worst-case horizontal error
of a precision-5 polyline cell is <1.6m. It is NOT a road snapping/search radius.
GPS uncertainty changes classification, never permission to relocate a vehicle.
"""

import math
import time

from voyagr.services.routing.journey_geometry import (
    decode_geometry,
    distance,
    IncompleteJourney,
)
from voyagr.utils import request_budget

CONTINUITY_M = 2.0


def coordinate(value):
    if isinstance(value, dict):
        value = (value.get("lat"), value.get("lon"))
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    if any(
        isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
        for v in value
    ):
        return None
    return tuple(value) if abs(value[0]) <= 90 and abs(value[1]) <= 180 else None


def accuracy(value):
    # Aligned with the existing GPS-fix rejection ceiling, not a snap allowance.
    return (
        value
        if isinstance(value, (float, int))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 < value <= 150
        else None
    )


def _ring(point, ring):
    if not isinstance(ring, (list, tuple)) or len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError("invalid_ring")
    lat, lon = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if coordinate((a[1], a[0])) is None or coordinate((b[1], b[0])) is None:
            raise ValueError("invalid_ring")
        # Conservative numerical boundary band ~millimetres, not a road buffer.
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = (
            max(
                0, min(1, ((lon - a[0]) * dx + (lat - a[1]) * dy) / (dx * dx + dy * dy))
            )
            if dx or dy
            else 0
        )
        if math.hypot(lon - a[0] - t * dx, lat - a[1] - t * dy) <= 1e-8:
            return "BOUNDARY"
        if (a[1] > lat) != (b[1] > lat) and lon < a[0] + (lat - a[1]) * dx / dy:
            inside = not inside
    return "INSIDE" if inside else "OUTSIDE"


def area_relation(point, collection):
    """Union of polygon members, with holes. Outside does not prove OSM completeness."""
    if not coordinate(point) or not isinstance(collection, dict):
        return "UNKNOWN"
    features = collection.get("features")
    if not isinstance(features, list) or not features or len(features) > 512:
        return "UNKNOWN"
    found = "OUTSIDE"
    count = 0
    try:
        for feature in features:
            geometry = feature["geometry"]
            kind = geometry["type"]
            if kind not in ("Polygon", "MultiPolygon"):
                return "UNKNOWN"
            polygons = (
                [geometry["coordinates"]]
                if kind == "Polygon"
                else geometry["coordinates"]
            )
            for polygon in polygons:
                count += 1
                if count % 128 == 0:
                    request_budget.check_budget()
                if count > 20000 or not polygon or sum(len(r) for r in polygon) > 20000:
                    return "UNKNOWN"
                relation = _ring(point, polygon[0])
                if relation == "OUTSIDE":
                    continue
                holes = [_ring(point, hole) for hole in polygon[1:]]
                if "INSIDE" in holes:
                    continue
                if relation == "INSIDE" and "BOUNDARY" not in holes:
                    return "INSIDE"
                found = "BOUNDARY"
        return found
    except (ValueError, KeyError, TypeError, IndexError):
        return "UNKNOWN"


def context_for_request(raw, requirements):
    from voyagr.utils.validation import validate_coordinates
    from voyagr.services import hazards

    start = validate_coordinates(raw.get("start", ""))
    end = start if raw.get("round_trip") else validate_coordinates(raw.get("end", ""))
    # Only server-owned geometry is used. Never accept client compliance/transition claims.
    camera_mandatory = any(
        r["enabled"]
        and r["mode"] == "mandatory"
        and r["category"] in ("speed_cameras", "red_light_cameras", "other_cameras")
        for r in requirements
    )
    collection = hazards.CAMERA_AREAS_DATA if camera_mandatory else None
    geometry_complete = not camera_mandatory or bool(
        isinstance(collection, dict) and collection.get("features")
    )
    caz_mandatory = any(
        r["enabled"]
        and r["mode"] == "mandatory"
        and r["category"] in ("caz", "congestion_charging")
        for r in requirements
    )
    if caz_mandatory:
        from voyagr.config import CAZ_ZONES_DATA

        features = list((collection or {}).get("features", []))
        for zone in CAZ_ZONES_DATA.values():
            ring = [[p[1], p[0]] for p in zone.get("polygon", []) if coordinate(p)]
            if ring:
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                features.append(
                    {"geometry": {"type": "Polygon", "coordinates": [ring]}}
                )
        collection = {"features": features}

    return {
        "start": coordinate(start),
        "end": coordinate(end),
        "accuracy_m": accuracy(raw.get("origin_accuracy_m")),
        "camera_mandatory": camera_mandatory or caz_mandatory,
        "geometry_complete": geometry_complete,
        "areas": collection,
        "relations": {},
    }


def _relation(context, point):
    key = tuple(point) if point else None
    if key not in context["relations"]:
        context["relations"][key] = (
            area_relation(point, context["areas"])
            if context["camera_mandatory"] and context.get("geometry_complete", True)
            else "UNKNOWN" if context["camera_mandatory"] else "NOT_REQUESTED"
        )
    return context["relations"][key]


def assess_origin(route, context, now=None):
    request_budget.check_budget()
    now = time.time() if now is None else now
    requested = coordinate(context.get("start"))
    end = coordinate(context.get("end"))
    out = {
        "version": 1,
        "status": "UNVERIFIED",
        "navigation_allowed": False,
        "transition_verified": False,
        "requested_origin": requested,
        "checked_at": now,
        "origin_displacement_m": None,
        "gps_accuracy_m": context.get("accuracy_m"),
        "hazard_evidence": "UNKNOWN",
        "reason": "missing_requested_origin",
        "road_connectivity": "NOT_VERIFIED",
        "safe_exit": "NOT_ESTABLISHED",
    }
    try:
        points = decode_geometry(
            route.get("geometry"), route.get("geometry_precision", 6)
        )
    except IncompleteJourney:
        out["reason"] = "invalid_or_zero_length_geometry"
        return out
    if not requested or not end:
        return out
    out["route_origin"] = points[0]
    displacement = distance(requested, points[0])
    finish = distance(end, points[-1])
    out.update(
        origin_displacement_m=round(displacement, 3),
        destination_displacement_m=round(finish, 3),
    )
    relation = _relation(context, requested)
    destination = _relation(context, end)
    out.update(
        hazard_evidence=(
            "LOCAL_EXCLUSION_GEOMETRY"
            if relation not in ("UNKNOWN", "NOT_REQUESTED")
            else relation
        ),
        requested_area_relation=relation,
        destination_area_relation=destination,
    )
    if context["camera_mandatory"] and (
        relation == "UNKNOWN" or destination == "UNKNOWN"
    ):
        out["reason"] = "mandatory_exclusion_geometry_unavailable"
        return out
    if relation in ("INSIDE", "BOUNDARY") or destination in ("INSIDE", "BOUNDARY"):
        out["reason"] = "mandatory_endpoint_in_or_on_exclusion"
        return out
    if "provider_snapped_waypoints" in route:
        native = route["provider_snapped_waypoints"]
        try:
            snaps = decode_geometry(native, route.get("provider_snap_precision", 5))
            if (
                distance(snaps[0], points[0]) > CONTINUITY_M
                or distance(snaps[-1], points[-1]) > CONTINUITY_M
            ):
                out["reason"] = "snapped_waypoints_geometry_mismatch"
                return out
        except IncompleteJourney:
            out["reason"] = "malformed_or_zero_length_snapped_waypoints"
            return out
        out["snap_evidence"] = "PROVIDER_AND_GEOMETRY"
    else:
        out["snap_evidence"] = "RETURNED_GEOMETRY_ONLY"
    if displacement > CONTINUITY_M or finish > CONTINUITY_M:
        gps = context.get("accuracy_m")
        out["reason"] = (
            "within_gps_uncertainty_connectivity_unknown"
            if gps and displacement <= gps and finish <= CONTINUITY_M
            else "material_endpoint_relocation"
        )
        return out
    out.update(
        status="CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE",
        navigation_allowed=True,
        reason="no_material_relocation",
    )
    request_budget.check_budget()
    return out
