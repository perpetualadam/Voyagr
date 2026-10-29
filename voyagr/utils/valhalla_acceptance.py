"""Bounded offline Valhalla diagnostics. Never an acceptance or native-snap oracle."""

import base64
import hashlib
import math

from voyagr.services.routing.journey_geometry import stitch_legs, visits_in_order
from voyagr.services.routing.origin_integrity import assess_origin
from voyagr.utils.review_package import strict_json

MAX_BUNDLE = 24 * 1024 * 1024


def unexecuted():
    return {
        "scope": "NO_CAPTURE_SUPPLIED",
        "live_engine": "NOT_TESTED",
        "independent_review": "NOT_PERFORMED",
        "reviewed": False,
        "navigation_authorized": False,
        "operational_status": "PRODUCTION_NO_GO",
        "fixtures": [{"id": i, "status": "NOT_TESTED"} for i in range(5)],
    }


def _wire(fixture, name, limit):
    encoded = fixture[name + "_base64"]
    if not isinstance(encoded, str) or len(encoded) > 4 * ((limit + 2) // 3):
        raise ValueError("wire_limit")
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > limit or hashlib.sha256(raw).hexdigest() != fixture[name + "_sha256"]:
        raise ValueError("wire_binding")
    value = strict_json(raw)
    if not isinstance(value, dict):
        raise ValueError("wire_object")
    return value


def _locations(value):
    if not isinstance(value, list) or not 2 <= len(value) <= 20:
        raise ValueError("locations")
    out = []
    for point in value:
        lat, lon = point["lat"], point["lon"]
        if (
            any(
                isinstance(v, bool)
                or not isinstance(v, (int, float))
                or not math.isfinite(v)
                for v in (lat, lon)
            )
            or abs(lat) > 90
            or abs(lon) > 180
        ):
            raise ValueError("coordinate")
        out.append({"lat": lat, "lon": lon})
    return out


def _trip(trip, originals):
    if (
        not isinstance(trip, dict)
        or type(trip.get("status")) is not int
        or trip["status"] != 0
        or trip.get("units") != "kilometers"
    ):
        raise ValueError("trip_status_or_units")
    legs = trip.get("legs")
    if not isinstance(legs, list) or not 1 <= len(legs) <= 20:
        raise ValueError("legs")
    for summary in [trip.get("summary")] + [leg.get("summary") for leg in legs]:
        for key in ("length", "time"):
            value = summary[key]
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value < 0
            ):
                raise ValueError("summary")
    if any(
        not isinstance(leg.get("shape"), str)
        or len(leg["shape"]) > 500000
        or len(leg.get("maneuvers", [])) > 10000
        for leg in legs
    ):
        raise ValueError("leg_limit")
    route = stitch_legs(
        [
            {
                "geometry": leg["shape"],
                "geometry_precision": 6,
                "maneuvers": leg.get("maneuvers", []),
            }
            for leg in legs
        ]
    )
    # trip.locations may echo input. Neither it nor a geometry vertex is native proof.
    origin = assess_origin(
        route,
        {
            "start": originals[0],
            "end": originals[-1],
            "camera_mandatory": False,
            "relations": {},
        },
        now=0,
    )
    return {
        "geometry": "VALID_CONTINUOUS",
        "leg_count": len(legs),
        "origin_gate": origin["status"],
        "origin_reason": origin["reason"],
        "ordered_waypoints": visits_in_order(route, originals),
        "native_correlation": "UNVERIFIED",
        "road_legality": "UNVERIFIED",
        "mandatory_exclusions": "UNVERIFIED",
        "vehicle_restrictions": "UNVERIFIED",
        "navigation_authorized": False,
    }


def replay(bundle):
    """Wire binding and geometry only; records and hashes are not attestations."""
    if not isinstance(bundle, dict):
        raise ValueError("schema")
    if bundle.get("schema") != "voyagr-valhalla-private-v1" or bundle.get(
        "source"
    ) not in ("SYNTHETIC", "DECLARED_RECORDING"):
        raise ValueError("schema")
    fixtures = bundle.get("fixtures")
    if (
        not isinstance(fixtures, list)
        or len(fixtures) != 5
        or any(
            not isinstance(f, dict) or type(f.get("id")) is not int for f in fixtures
        )
        or [f.get("id") for f in fixtures] != list(range(5))
    ):
        raise ValueError("five_fixture_inventory")
    report = unexecuted()
    report["scope"] = (
        "SYNTHETIC_ONLY"
        if bundle["source"] == "SYNTHETIC"
        else "DECLARED_RECORDING_UNREVIEWED"
    )
    report["runtime_provenance"] = "UNVERIFIED"
    report["fixtures"] = []
    for fixture in fixtures:
        row = {"id": fixture["id"], "status": "UNVERIFIED"}
        try:
            request = _wire(fixture, "request", 65536)
            response = _wire(fixture, "response", 2 * 1024 * 1024)
            originals = _locations(fixture["original_locations"])
            if _locations(request["locations"]) != originals:
                raise ValueError("original_request_binding")
            if (
                request.get("costing") != "auto"
                or request.get("shape_format", "polyline6") != "polyline6"
            ):
                raise ValueError("unsupported_request")
            transport = fixture["transport"]
            if transport != {"method": "POST", "target": "/route", "status": 200}:
                raise ValueError("transport")
            alternatives = response.get("alternates", [])
            if (
                not isinstance(alternatives, list)
                or len(alternatives) > 2
                or "error" in response
            ):
                raise ValueError("response")
            row["routes"] = [_trip(response["trip"], originals)] + [
                _trip(alt["trip"], originals) for alt in alternatives
            ]
            row["wire_binding"] = "MATCHED_DECLARED_BYTES"
        except (
            ValueError,
            TypeError,
            KeyError,
            IndexError,
            OverflowError,
            AttributeError,
        ):
            # Fixed vocabulary: never echo exception messages, routes or identifiers.
            row = {"id": fixture["id"], "status": "REFUSED_OR_UNAVAILABLE"}
        report["fixtures"].append(row)
    return report


def load_private(path):
    """Reuse the fail-closed no-atime evidence reader; no alternative read path."""
    import os
    import stat
    from voyagr.utils.review_package_io import (
        Reader,
        local_path,
        outside_git,
        reparse,
        stamp,
    )

    path = local_path(path)
    outside_git(path)
    before = path.lstat()
    if (
        reparse(before)
        or not stat.S_ISREG(before.st_mode)
        or before.st_nlink != 1
        or before.st_size > MAX_BUNDLE
    ):
        raise ValueError("unsafe_bundle")
    reader = Reader()
    with reader.directory(path.parent) as parent:
        with reader.file(path, parent, path.name) as fd:
            if stamp(os.fstat(fd)) != stamp(before):
                raise ValueError("changed_bundle")
            parts, size = [], 0
            while True:
                chunk = os.read(fd, min(1048576, MAX_BUNDLE + 1 - size))
                if not chunk:
                    break
                parts.append(chunk)
                size += len(chunk)
                if size > MAX_BUNDLE:
                    raise ValueError("bundle_limit")
            if stamp(os.fstat(fd)) != stamp(before) or path.lstat() != before:
                raise ValueError("changed_bundle")
    return strict_json(b"".join(parts))
