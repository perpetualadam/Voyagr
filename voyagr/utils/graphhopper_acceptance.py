"""Offline/explicitly approved isolated acceptance only; never a routing selector.

No successful JSON/model request is promoted to geographic compliance. Dataset
replacement remains a separate human decision, even when an executed subset passes.
"""

from collections import defaultdict
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import urlsplit

import requests
from shapely.geometry import shape
from shapely.errors import ShapelyError
from shapely.ops import unary_union
from voyagr.services.routing.graphhopper_capabilities import normalise_info
from voyagr.services.hazards import merge_graphhopper_custom_model_parts

MAX_FILE = 16 * 1024 * 1024
AREA_IDS = tuple("camera_area_" + str(n) for n in range(128))
CATEGORIES = (
    "baseline_intersection",
    "alternative_available",
    "no_compliant_alternative",
    "near_outside",
    "boundary_touch",
    "sparse_crossing",
    "overlapping_areas",
    "separated_areas",
    "junction",
    "motorway_interchange",
    "parallel_carriageways",
    "opposing_directions",
    "slip_road",
    "bridge_tunnel",
    "close_junctions",
    "camera_osm",
    "camera_caz",
    "supported_preference",
)


def read_json(path, limit=MAX_FILE):
    with Path(path).open("rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("input_size_limit")
    return raw, json.loads(raw)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def artifacts(manifest_path, original_path):
    _, manifest = read_json(manifest_path, 65536)
    expected = manifest.get("candidate_sha256")
    if not isinstance(expected, str) or not re.fullmatch("[0-9a-f]{64}", expected):
        raise ValueError("candidate_hash_missing")
    # Phase12B has no path field. Resolve an actual sibling by content, never by an assumed filename.
    siblings = list(Path(manifest_path).parent.glob("*.geojson"))
    if len(siblings) > 8:
        raise ValueError("artifact_search_limit")
    matches = []
    for path in siblings:
        raw, data = read_json(path)
        if sha(raw) == expected:
            matches.append((path, raw, data))
    if len(matches) != 1:
        raise ValueError("candidate_missing_or_ambiguous")
    path, raw, candidate = matches[0]
    source_raw, original = read_json(original_path)
    if sha(source_raw) != manifest.get("source_sha256"):
        raise ValueError("source_hash_mismatch")
    old = {f["id"]: f for f in original["features"]}
    new = {f["id"]: f for f in candidate["features"]}
    if (
        len(old) != 128
        or len(new) != 128
        or len(original["features"]) != 128
        or len(candidate["features"]) != 128
        or set(old) != set(AREA_IDS)
        or set(new) != set(AREA_IDS)
    ):
        raise ValueError("area_identity_mismatch")
    geometries = {}
    for identity in AREA_IDS:
        a, b = old[identity], new[identity]
        if {k: v for k, v in a.items() if k != "geometry"} != {
            k: v for k, v in b.items() if k != "geometry"
        }:
            raise ValueError("properties_changed")
        source = shape(a["geometry"])
        g = shape(b["geometry"])
        if (
            source.geom_type != "MultiPolygon"
            or g.geom_type != "MultiPolygon"
            or not g.is_valid
            or g.is_empty
        ):
            raise ValueError("invalid_candidate")
        if any(not p.is_valid for p in source.geoms) or not unary_union(
            source.geoms
        ).equals(g):
            raise ValueError("coverage_mismatch")
        geometries[identity] = g
    return {
        "manifest": manifest,
        "candidate_path": path,
        "geometries": geometries,
        "summary": {
            "resolution": "HASH_MATCHED_MANIFEST_SIBLING",
            "candidate_file": path.name,
            "source_sha256": sha(source_raw),
            "candidate_sha256": sha(raw),
            "ids": list(AREA_IDS),
            "properties_preserved": True,
            "geographic_equivalence": True,
        },
    }


def isolated_origin(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme not in ("http", "https")
        or parsed.hostname not in ("127.0.0.1", "::1")
        or not parsed.port
        or parsed.port < 10000
        or parsed.path not in ("", "/")
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("approved_high_port_literal_loopback_origin_required")
    return url.rstrip("/")


def checked_request(value):
    if not isinstance(value, dict) or set(value) - {
        "points",
        "locale",
        "headings",
        "curbsides",
        "point_hints",
        "snap_preventions",
    }:
        raise ValueError("request_keys_not_reviewed")
    points = value.get("points")
    if not isinstance(points, list) or not 2 <= len(points) <= 10:
        raise ValueError("bounded_reviewed_points_required")
    if any(
        not isinstance(p, list)
        or len(p) != 2
        or not all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
            for v in p
        )
        or abs(p[0]) > 180
        or abs(p[1]) > 90
        for p in points
    ):
        raise ValueError("invalid_fixture_coordinate")
    if len(json.dumps(value).encode()) > 65536:
        raise ValueError("request_size_limit")
    return copy.deepcopy(value)


def model_for(ids, extra=None):
    if not ids or len(set(ids)) != len(ids) or any(i not in AREA_IDS for i in ids):
        raise ValueError("unknown_area_identifier")
    native = {
        "priority": [{"if": " || ".join("in_" + i for i in ids), "multiply_by": "0"}]
    }
    if extra is None:
        return native
    if not isinstance(extra, dict) or len(json.dumps(extra).encode()) > 32768:
        raise ValueError("extra_model_limit")
    features = extra.get("areas", {}).get("features", [])
    names = [f.get("id") for f in features]
    if (
        len(names) > 32
        or len(names) != len(set(names))
        or any(not isinstance(n, str) or n.startswith("camera_area_") for n in names)
    ):
        raise ValueError("loaded_inline_area_collision")
    if any(
        not shape(f["geometry"]).is_valid
        or shape(f["geometry"]).geom_type not in ("Polygon", "MultiPolygon")
        for f in features
    ):
        raise ValueError("invalid_inline_geometry")
    return merge_graphhopper_custom_model_parts(native, extra)


def classify(status, body):
    if not isinstance(body, dict):
        return "INVALID_RESPONSE"
    hints = body.get("hints", [])
    if (
        status in (400, 404)
        and isinstance(hints, list)
        and any(
            isinstance(h, dict)
            and h.get("details")
            == "com.graphhopper.util.exceptions.ConnectionNotFoundException"
            for h in hints
        )
    ):
        return "NO_PATH"
    if status == 200:
        paths = body.get("paths")
        if not isinstance(paths, list) or not paths or len(paths) > 8:
            return "INVALID_ROUTE_RESPONSE"
        try:
            for path in paths:
                g = shape(path["points"])
                if (
                    g.geom_type != "LineString"
                    or g.is_empty
                    or not g.is_valid
                    or len(g.coords) < 2
                    or len(g.coords) > 100000
                ):
                    raise ValueError()
                if any(
                    not all(math.isfinite(v) for v in p)
                    or abs(p[0]) > 180
                    or abs(p[1]) > 90
                    for p in g.coords
                ):
                    raise ValueError()
                if not all(
                    isinstance(path.get(k), (int, float))
                    and not isinstance(path[k], bool)
                    and math.isfinite(path[k])
                    and path[k] >= 0
                    for k in ("distance", "time")
                ):
                    raise ValueError()
        except (ValueError, KeyError, TypeError, AttributeError):
            return "INVALID_ROUTE_RESPONSE"
        return "ROUTE"
    # Inspect bounded strings solely to choose fixed categories; never return raw error text.
    text = (
        " ".join(
            [str(body.get("message", ""))]
            + [str(h.get("message", "")) for h in hints if isinstance(h, dict)]
        )[:65536].lower()
        if isinstance(hints, list)
        else ""
    )
    if status in (400, 422) and any(
        v in text
        for v in (
            "cannot compile",
            "invalid condition",
            "not available",
            "unknown encoded",
            "unknown area",
            "custom_model",
        )
    ):
        return "MODEL_REJECTED"
    if status in (400, 422):
        return "VALIDATION_ERROR"
    return "PROVIDER_FAILURE"


def inspect_paths(body, polygons, blocked_edges=()):
    findings = []
    for path in body["paths"]:
        line = shape(path["points"])
        interior = any(line.relate_pattern(p, "T********") for p in polygons)
        contact = any(line.intersects(p) for p in polygons)
        details = path.get("details", {}).get("edge_id")
        edge_ids = (
            [row[2] for row in details]
            if isinstance(details, list)
            and all(
                isinstance(row, list) and len(row) == 3 and isinstance(row[2], int)
                for row in details
            )
            else None
        )
        findings.append(
            {
                "interior_intersection": interior,
                "boundary_only_contact": contact and not interior,
                "edge_evidence": (
                    "PATH_DETAILS_ONLY" if edge_ids is not None else "NOT_TESTED"
                ),
                "oracle_blocked_edge_used": (
                    bool(set(edge_ids or ()) & set(blocked_edges))
                    if edge_ids is not None
                    else None
                ),
            }
        )
    return findings


def compare_routes(first, second):
    if classify(200, first) != "ROUTE" or classify(200, second) != "ROUTE":
        return {"geometry_comparison": "NOT_TESTED"}
    a, b = first["paths"], second["paths"]
    same_count = len(a) == len(b)
    result = {
        "alternative_count_equal": same_count,
        "geometry_equal_in_returned_order": same_count
        and all(x["points"] == y["points"] for x, y in zip(a, b)),
        "distance_deltas_m": [y["distance"] - x["distance"] for x, y in zip(a, b)],
        "duration_deltas_ms": [y["time"] - x["time"] for x, y in zip(a, b)],
        "manoeuvre_sequences_equal": (
            (
                same_count
                and all(x["instructions"] == y["instructions"] for x, y in zip(a, b))
            )
            if all(isinstance(p.get("instructions"), list) for p in a + b)
            else "NOT_TESTED"
        ),
    }
    edges_a = [p.get("details", {}).get("edge_id") for p in a]
    edges_b = [p.get("details", {}).get("edge_id") for p in b]
    result["edge_sequences_equal"] = (
        edges_a == edges_b
        if same_count and all(v is not None for v in edges_a + edges_b)
        else "NOT_TESTED"
    )
    return result


class LimitExceeded(Exception):
    pass


class Transport:
    def __init__(self, seconds=60, max_calls=48, clock=None):
        self.clock = clock or time.monotonic
        self.started = self.clock()
        self.deadline = self.started + min(120, seconds)
        self.max_calls = min(48, max_calls)
        self.calls = 0
        self.timings = defaultdict(list)

    def check(self):
        if self.clock() >= self.deadline or self.calls >= self.max_calls:
            raise LimitExceeded("batch_limit")

    def call(self, origin, path, payload, stage):
        self.check()
        remaining = self.deadline - self.clock()
        self.calls += 1
        started = self.clock()
        try:
            with requests.Session() as session:
                session.trust_env = False
                method = "GET" if path == "/info" else "POST"
                with session.request(
                    method,
                    origin + path,
                    json=payload if method == "POST" else None,
                    params=(
                        {"ch.disable": "true", "way_point_max_distance": 0}
                        if method == "POST"
                        else None
                    ),
                    timeout=(min(2, remaining), min(5, remaining)),
                    allow_redirects=False,
                    stream=True,
                ) as response:
                    raw = bytearray()
                    for chunk in response.iter_content(16384):
                        if self.clock() >= self.deadline:
                            raise LimitExceeded("late_response")
                        if len(raw) + len(chunk) > 2 * 1024 * 1024:
                            raise ValueError("response_size_limit")
                        raw.extend(chunk)
                    if self.clock() >= self.deadline:
                        raise LimitExceeded("late_response")
                    return response.status_code, json.loads(raw)
        finally:
            self.timings[stage].append((self.clock() - started) * 1000)


def _sha(value):
    return isinstance(value, str) and bool(re.fullmatch("[0-9a-f]{64}", value))


def validate_plan(plan, integrity):
    if not all(
        plan.get(k) is True
        for k in (
            "operator_approved",
            "isolated_not_production",
            "reviewed_graph_oracle",
        )
    ):
        raise ValueError("reviewed_isolation_and_oracle_required")
    provenance = plan.get("provenance", {})
    if not all(
        _sha(provenance.get(k))
        for k in (
            "engine_build_sha256",
            "road_source_sha256",
            "profile_config_sha256",
            "encoded_values_sha256",
            "oracle_sha256",
        )
    ):
        raise ValueError("paired_provenance_required")
    instances = plan.get("instances", {})
    if set(instances) != {"original", "candidate"}:
        raise ValueError("paired_instances_required")
    for label, expected in [
        ("original", integrity["source_sha256"]),
        ("candidate", integrity["candidate_sha256"]),
    ]:
        config = instances[label]
        isolated_origin(config["url"])
        if (
            config.get("dataset_sha256") != expected
            or not _sha(config.get("graph_revision_sha256"))
            or not _sha(config.get("import_receipt_sha256"))
        ):
            raise ValueError("import_binding_required")
    if instances["original"]["url"] == instances["candidate"]["url"]:
        raise ValueError("distinct_instances_required")
    checked_request(plan.get("seed_request"))
    fixtures = plan.get("fixtures", [])
    if not isinstance(fixtures, list) or len(fixtures) > 18:
        raise ValueError("fixture_limit")
    for fixture in fixtures:
        if (
            fixture.get("category") not in CATEGORIES
            or fixture.get("reviewed") is not True
            or not _sha(fixture.get("oracle_sha256"))
            or fixture.get("expected_restricted") not in ("ROUTE", "NO_PATH")
            or fixture.get("boundary_policy") not in ("FORBID", "OBSERVE")
            or fixture.get("baseline_relation")
            not in ("INTERIOR", "BOUNDARY", "OUTSIDE")
        ):
            raise ValueError("reviewed_fixture_required")
        checked_request(fixture.get("request"))
        model_for(fixture.get("area_ids"), fixture.get("extra_model"))
        if len(fixture.get("blocked_edge_ids", [])) > 4096 or any(
            not isinstance(v, int) or isinstance(v, bool)
            for v in fixture.get("blocked_edge_ids", [])
        ):
            raise ValueError("edge_oracle_limit")
    return instances


def distributions(timings):
    import statistics

    return {
        name: {
            "n": len(v),
            "median_ms": round(statistics.median(v), 3),
            "p95_ms": round(sorted(v)[math.ceil(0.95 * len(v)) - 1], 3),
            "max_ms": round(max(v), 3),
        }
        for name, v in timings.items()
        if v
    }


def run(
    bundle,
    plan,
    *,
    approved=False,
    mode="compile",
    area_start=0,
    area_count=8,
    fixture_start=0,
    fixture_count=2,
    transport=None
):
    if (
        mode not in ("compile", "fixtures")
        or not 0 <= area_start < 128
        or not 1 <= area_count <= 16
        or area_start + area_count > 128
        or not 0 <= fixture_start <= 18
        or not 1 <= fixture_count <= 4
    ):
        raise ValueError("batch_range_limit")
    report = {
        "scope": "ISOLATED_OPERATOR_ACCEPTANCE",
        "engine_execution": "NOT_TESTED",
        "dataset_integrity": bundle["summary"],
        "area_compilation": {
            k: [{"id": i, "status": "NOT_TESTED"} for i in AREA_IDS]
            for k in ("original", "candidate")
        },
        "instances": {},
        "fixture_results": [],
        "comparisons": [],
        "request_count": 0,
        "latency": {},
        "replacement_decision": "CANDIDATE_NOT_VERIFIED",
        "production_release": "NO_GO",
        "graphhopper_primary_policy": "PRESERVED",
    }
    if not approved:
        return report
    instances = validate_plan(plan, bundle["summary"])
    if (
        mode == "fixtures"
        and not plan["fixtures"][fixture_start : fixture_start + fixture_count]
    ):
        raise ValueError("empty_fixture_batch")
    io = transport or Transport()
    observations = {}
    bodies = {}

    def request(label, request_value, model, stage):
        payload = checked_request(request_value)
        payload.update(
            profile="car", points_encoded=False, calc_points=True, instructions=True
        )
        if model is not None:
            payload["custom_model"] = model
        if len(json.dumps(payload).encode()) > 65536:
            raise ValueError("request_size_limit")
        status, body = io.call(
            isolated_origin(instances[label]["url"]), "/route", payload, stage
        )
        return classify(status, body), body

    try:
        for label, config in instances.items():
            status, info = io.call(
                isolated_origin(config["url"]), "/info", None, "metadata"
            )
            if (
                status != 200
                or not isinstance(info, dict)
                or info.get("version") != "8.0"
            ):
                raise ValueError("engine_version_unverified")
            encoded_hash = sha(
                json.dumps(
                    info.get("encoded_values"), sort_keys=True, separators=(",", ":")
                ).encode()
            )
            if encoded_hash != plan["provenance"]["encoded_values_sha256"]:
                raise ValueError("encoded_values_receipt_mismatch")
            capabilities = normalise_info(info, "car")
            if not capabilities["profile_available"]:
                raise ValueError("car_profile_unavailable")
            if (
                info.get("graph_revision") is not None
                and info["graph_revision"] != config["graph_revision_sha256"]
            ):
                raise ValueError("graph_revision_mismatch")
            observations[label] = capabilities
            report["instances"][label] = {
                "version": "8.0",
                "profile": "car",
                "weighting": "OPERATOR_ATTESTED_CUSTOM",
                "dataset_sha256": config["dataset_sha256"],
                "encoded_values_sha256": encoded_hash,
                "graph_revision_sha256": config["graph_revision_sha256"],
                "import_binding": "OPERATOR_REVIEWED_RECEIPT_NOT_NATIVE_AREA_ATTESTATION",
                "capabilities": [
                    (
                        "toll"
                        if "toll" in capabilities["encoded_values"]
                        else "toll_not_advertised"
                    )
                ],
            }
        if (
            observations["original"]["encoded_values"]
            != observations["candidate"]["encoded_values"]
        ):
            raise ValueError("capability_mismatch")
        for label in instances:
            controls = {
                "unknown_area": {
                    "priority": [{"if": "in_phase12c_missing_area", "multiply_by": "0"}]
                },
                "invalid_expression": {
                    "priority": [{"if": "in_camera_area_0 &&&", "multiply_by": "0"}]
                },
                "unsupported_value": {
                    "priority": [
                        {
                            "if": (
                                "toll == true"
                                if "toll" not in observations[label]["encoded_values"]
                                else "phase12c_missing_value == true"
                            ),
                            "multiply_by": "0",
                        }
                    ]
                },
            }
            control_results = {}
            for name, model in controls.items():
                control_results[name] = request(
                    label, plan["seed_request"], model, "negative_control"
                )[0]
            report["instances"][label]["negative_controls"] = control_results
            if any(v != "MODEL_REJECTED" for v in control_results.values()):
                raise ValueError("model_rejection_not_proven")
            if mode == "compile":
                for identity in AREA_IDS[area_start : area_start + area_count]:
                    outcome, _ = request(
                        label,
                        plan["seed_request"],
                        model_for([identity]),
                        "compilation_plus_seed_route",
                    )
                    report["area_compilation"][label][AREA_IDS.index(identity)][
                        "status"
                    ] = (
                        "REQUEST_ACCEPTED_ENFORCEMENT_UNVERIFIED"
                        if outcome == "ROUTE"
                        else (
                            "NO_PATH_COMPILATION_UNVERIFIED"
                            if outcome == "NO_PATH"
                            else outcome
                        )
                    )
            else:
                for index, fixture in enumerate(
                    plan["fixtures"][fixture_start : fixture_start + fixture_count],
                    fixture_start,
                ):
                    baseline, base = request(
                        label, fixture["request"], None, "fixture_baseline"
                    )
                    model = model_for(fixture["area_ids"], fixture.get("extra_model"))
                    outcome, body = request(
                        label, fixture["request"], model, "fixture_restricted"
                    )
                    polygons = [bundle["geometries"][i] for i in fixture["area_ids"]]
                    polygons += [
                        shape(f["geometry"])
                        for f in (fixture.get("extra_model") or {})
                        .get("areas", {})
                        .get("features", [])
                    ]
                    base_findings = (
                        inspect_paths(base, polygons) if baseline == "ROUTE" else []
                    )
                    relation = (
                        "INTERIOR"
                        if any(v["interior_intersection"] for v in base_findings)
                        else (
                            "BOUNDARY"
                            if any(v["boundary_only_contact"] for v in base_findings)
                            else "OUTSIDE"
                        )
                    )
                    findings = (
                        inspect_paths(
                            body, polygons, fixture.get("blocked_edge_ids", [])
                        )
                        if outcome == "ROUTE"
                        else []
                    )
                    passed = (
                        baseline == "ROUTE"
                        and relation == fixture["baseline_relation"]
                        and outcome == fixture["expected_restricted"]
                        and not any(
                            v["interior_intersection"]
                            or v["oracle_blocked_edge_used"]
                            or fixture["boundary_policy"] == "FORBID"
                            and v["boundary_only_contact"]
                            for v in findings
                        )
                    )
                    report["fixture_results"].append(
                        {
                            "instance": label,
                            "index": index,
                            "category": fixture["category"],
                            "baseline_outcome": baseline,
                            "baseline_relation": relation,
                            "restricted_outcome": outcome,
                            "geometry_findings": findings,
                            "status": (
                                "PASS_OBSERVED_FIXTURE"
                                if passed
                                else "FAIL_OR_UNVERIFIED_FIXTURE"
                            ),
                        }
                    )
                    bodies[(label, index)] = (outcome, body, baseline, base)
        if mode == "fixtures":
            for index in range(
                fixture_start, min(len(plan["fixtures"]), fixture_start + fixture_count)
            ):
                a, b = bodies[("original", index)], bodies[("candidate", index)]
                report["comparisons"].append(
                    {
                        "index": index,
                        "availability_equal": a[0] == b[0],
                        "restricted": (
                            compare_routes(a[1], b[1])
                            if a[0] == b[0] == "ROUTE"
                            else {"geometry_comparison": "NOT_TESTED"}
                        ),
                        "baseline": (
                            compare_routes(a[3], b[3])
                            if a[2] == b[2] == "ROUTE"
                            else {"geometry_comparison": "NOT_TESTED"}
                        ),
                    }
                )
        report["engine_execution"] = "REQUESTS_EXECUTED_REVIEW_LIMITATIONS"
    except (
        LimitExceeded,
        ShapelyError,
        requests.RequestException,
        ValueError,
        KeyError,
        TypeError,
    ) as error:
        report["engine_execution"] = "STOPPED_OR_PARTIAL"
        report["stop_category"] = (
            str(error)
            if isinstance(error, ValueError)
            and str(error)
            in (
                "engine_version_unverified",
                "car_profile_unavailable",
                "graph_revision_mismatch",
                "capability_mismatch",
                "model_rejection_not_proven",
                "encoded_values_receipt_mismatch",
            )
            else type(error).__name__
        )
    finally:
        report["request_count"] = io.calls
        report["latency"] = distributions(io.timings)
    return report
