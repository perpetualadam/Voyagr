"""Private recorded-capture replay of production functions. Never contacts an engine."""

import copy
import hashlib
import json
import re
import subprocess
from pathlib import Path
from unittest.mock import patch

from voyagr.services.routing.origin_integrity import assess_origin, area_relation
from voyagr.services.routing.journey_geometry import decode_geometry, distance
from voyagr.services.routing.integrity import assess_response, normalize_requirements
from voyagr.utils.graphhopper_acceptance import classify, read_json

EXPECTED = (46.31, 70.41, 197.0, 52.68, 119.44)
DATASETS = {
    "6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7",
    "65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f",
}


def unexecuted():
    return {
        "scope": "NO_CAPTURE_SUPPLIED",
        "live_engine": "NOT_TESTED",
        "recorded_replay": "NOT_TESTED",
        "fixtures": [{"id": i, "status": "NOT_TESTED"} for i in range(5)],
        "production": "NO_GO",
    }


def load_bundle(path, area_path):
    _, bundle = read_json(path, 16 * 1024 * 1024)
    raw, areas = read_json(area_path)
    digest = hashlib.sha256(raw).hexdigest()
    if (
        digest not in DATASETS
        or bundle.get("engine", {}).get("dataset_sha256") != digest
    ):
        raise ValueError("dataset_binding")
    return bundle, areas


def validate_bundle(bundle):
    if (
        bundle.get("kind")
        not in ("RECORDED_GRAPH_HOPPER8_CAPTURE", "SYNTHETIC_PROTOCOL_TEST")
        or bundle.get("reviewed") is not True
    ):
        raise ValueError("reviewed_capture_required")
    engine = bundle.get("engine", {})
    if engine.get("version") != "8.0" or engine.get("profile") != "car":
        raise ValueError("engine_binding")
    if any(
        not isinstance(engine.get(k), str)
        or not re.fullmatch("[0-9a-f]{64}", engine[k])
        for k in (
            "dataset_sha256",
            "graph_sha256",
            "import_receipt_sha256",
            "engine_build_sha256",
            "road_source_sha256",
            "oracle_sha256",
        )
    ):
        raise ValueError("provenance_required")
    fixtures = bundle.get("fixtures")
    if (
        not isinstance(fixtures, list)
        or len(fixtures) != 5
        or {f.get("id") for f in fixtures} != set(range(5))
        or any(type(f.get("id")) is not int for f in fixtures)
    ):
        raise ValueError("five_unique_cases_required")
    pairs = set()
    for fixture in fixtures:
        for key, limit in (("request", 65536), ("response", 2 * 1024 * 1024)):
            if len(json.dumps(fixture.get(key)).encode()) > limit:
                raise ValueError("capture_size_limit")
            digest = hashlib.sha256(
                json.dumps(fixture[key], sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            if fixture.get(key + "_sha256") != digest:
                raise ValueError("capture_hash_mismatch")
        request = fixture["request"]
        rules = request.get("custom_model", {}).get("priority", [])
        if (
            request.get("profile") != "car"
            or request.get("ch.disable") is not True
            or not any(
                str(r.get("multiply_by")) == "0"
                and re.search(r"\bin_camera_area_75\b", str(r.get("if", "")))
                for r in rules
            )
        ):
            raise ValueError("camera_restriction_binding")
        points = request.get("points")
        from voyagr.utils.graphhopper_acceptance import checked_request

        checked_request({"points": points})
        if len(points) != 2:
            raise ValueError("two_point_case_required")
        if (
            fixture.get("http_status") != 200
            or classify(200, fixture["response"]) != "ROUTE"
        ):
            raise ValueError("valid_route_capture_required")
        if len(fixture["response"]["paths"]) != 1:
            raise ValueError("single_recorded_path_required")
        pairs.add((fixture["request_sha256"], fixture["response_sha256"]))
    if len(pairs) != 5:
        raise ValueError("duplicate_capture_pair")


def normalized(fixture):
    path = fixture["response"]["paths"][0]
    if "snapped_waypoints" not in path:
        raise ValueError("native_snaps_required")
    multiplier = path.get("points_encoded_multiplier", 100000)
    if multiplier not in (100000, 1000000):
        raise ValueError("unknown_encoding")
    return {
        "source": "GraphHopper",
        "name": "⚡ Optimised",
        "geometry": copy.deepcopy(path["points"]),
        "geometry_precision": 5 if multiplier == 100000 else 6,
        "provider_snapped_waypoints": copy.deepcopy(path["snapped_waypoints"]),
        "provider_snap_precision": 5 if multiplier == 100000 else 6,
        "distance_km": path["distance"] / 1000,
        "duration_minutes": path["time"] / 60000,
    }


def browser_checks(route):
    """Invoke the shipped JS gate via stdin; never put private JSON in argv/logs."""
    code = """const AI=require('./static/js/modules/navigation/avoidance-integrity.js');
const r=JSON.parse(require('fs').readFileSync(0,'utf8'));let calls=0;
const storage={getItem:k=>k==='pref_avoidance_mode'?'mandatory':null};
const manual=AI.gate(r,{storage,confirm:()=>{calls++;return true;}});
const automatic=AI.gate(r,{storage,automatic:true});
process.stdout.write(JSON.stringify({manual,automatic,confirmation_calls:calls}));"""
    result = subprocess.run(
        ["node", "-e", code],
        input=json.dumps(route),
        text=True,
        capture_output=True,
        timeout=5,
        check=False,
    )
    if result.returncode:
        raise ValueError("browser_gate_unavailable")
    result = json.loads(result.stdout)
    return result == {"manual": False, "automatic": False, "confirmation_calls": 0}


def cache_checks(route, application_request, areas):
    """Actual Flask cache ingress + after_request, with deterministic offline backends.

    This is recorded-fixture integration, not a deployed cache/network experiment.
    """
    import voyagr_web as web
    from voyagr.services import hazards

    results = {}
    for tier in ("memory", "persistent"):
        value = {
            "success": True,
            "source": "GraphHopper",
            "routes": [copy.deepcopy(route)],
        }
        value["routes"][0]["avoidance_assessment"] = {
            "origin_integrity": {"navigation_allowed": True}
        }
        with patch(
            "requests.sessions.Session.request",
            side_effect=RuntimeError("offline_capture_replay_no_network"),
        ), patch.object(hazards, "CAMERA_AREAS_DATA", areas), patch.object(
            hazards, "fetch_hazards_for_route", return_value={}
        ), patch.object(
            web.route_cache, "get", return_value=value if tier == "memory" else None
        ) as memory, patch.object(
            web.cost_calculator,
            "get_cached_route_from_db",
            return_value=value if tier == "persistent" else None,
        ) as persistent, patch.object(
            web.cost_calculator, "get_cached_route_from_db_legacy", return_value=None
        ):
            response = web.app.test_client().post(
                "/api/route", json=application_request
            )
        body = response.get_json(silent=True) or {}
        assessed = (body.get("routes") or [{}])[0].get("avoidance_assessment", {})
        origin = assessed.get("origin_integrity", {})
        results[tier] = bool(
            response.status_code == 200
            and body.get("cached")
            and memory.called
            and (tier == "memory" or persistent.called)
            and not body.get("automatic_selection_allowed", True)
            and origin.get("navigation_allowed") is False
            and origin.get("reason") == "mandatory_endpoint_in_or_on_exclusion"
        )
    return results


def replay(bundle, areas, *, check_browser=True, check_caches=True):
    validate_bundle(bundle)
    report = {
        "scope": bundle["kind"],
        "live_engine": "NOT_TESTED",
        "recorded_replay": (
            "EXECUTED"
            if bundle["kind"] == "RECORDED_GRAPH_HOPPER8_CAPTURE"
            else "SYNTHETIC_ONLY"
        ),
        "provenance_binding": "OPERATOR_REVIEWED_RECEIPTS_NOT_NATIVE_RUNTIME_ATTESTATION",
        "fixtures": [],
        "production": "NO_GO",
    }
    selected = {
        "features": [
            f for f in areas.get("features", []) if f.get("id") == "camera_area_75"
        ]
    }
    for fixture in sorted(bundle["fixtures"], key=lambda f: f["id"]):
        identity = fixture["id"]
        native = normalized(fixture)
        points = fixture["request"]["points"]
        start, end = tuple(reversed(points[0])), tuple(reversed(points[-1]))
        context = {
            "start": start,
            "end": end,
            "areas": areas,
            "camera_mandatory": True,
            "relations": {},
            "accuracy_m": None,
        }
        # Explicitly decode real returned native snaps, even when the production gate
        # rejects an inside origin before needing the optional native consistency check.
        snaps = decode_geometry(
            native["provider_snapped_waypoints"], native["provider_snap_precision"]
        )
        geometry = decode_geometry(native["geometry"], native["geometry_precision"])
        native_displacement = distance(start, snaps[0])
        native_matches = (
            distance(snaps[0], geometry[0]) <= 2
            and distance(snaps[-1], geometry[-1]) <= 2
        )
        origin = assess_origin(native, context)
        raw = {
            "start": f"{start[0]},{start[1]}",
            "end": f"{end[0]},{end[1]}",
            "avoid_caz": False,
            "avoidance_mode": "mandatory",
            "enable_hazard_avoidance": True,
            "avoid_cameras": True,
            "avoid_traffic_lights": False,
            "avoid_railway_crossings": False,
        }
        result = assess_response(
            {"success": True, "routes": [native]},
            normalize_requirements(raw),
            origin_context=context,
        )
        route = result["routes"][0]
        browser = browser_checks(route) if check_browser else "NOT_TESTED"
        caches = (
            cache_checks(native, raw, areas)
            if check_caches
            else {"memory": "NOT_TESTED", "persistent": "NOT_TESTED"}
        )
        bound = (
            area_relation(start, selected) == "INSIDE"
            and area_relation(snaps[0], selected) == "OUTSIDE"
            and abs(native_displacement - EXPECTED[identity]) <= 2
        )
        quarantined = (
            origin["navigation_allowed"] is False
            and not result["automatic_selection_allowed"]
            and not route["avoidance_assessment"]["automatic_selection_allowed"]
        )
        passed = (
            bound
            and native_matches
            and quarantined
            and browser is True
            and all(v is True for v in caches.values())
        )
        report["fixtures"].append(
            {
                "id": identity,
                "status": (
                    "PASS_RECORDED_REPLAY"
                    if passed and bundle["kind"] == "RECORDED_GRAPH_HOPPER8_CAPTURE"
                    else "PASS_SYNTHETIC_PROTOCOL" if passed else "FAIL_OR_UNVERIFIED"
                ),
                "capture_case_binding": bound,
                "native_matches_geometry": native_matches,
                "native_displacement_m": round(native_displacement, 3),
                "geometry_displacement_m": origin["origin_displacement_m"],
                "reported_displacement_m": EXPECTED[identity],
                "navigation_eligible": not quarantined,
                "origin_reason": origin["reason"],
                "browser_refused": browser,
                "cache_reassessed": caches,
            }
        )
    return report
