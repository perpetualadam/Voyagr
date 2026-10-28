"""Synthetic regressions and replay protocol; never live-engine acceptance."""

import copy
from unittest.mock import patch
import pytest
from voyagr.services.routing import origin_integrity as oi


def polygon():
    return {
        "features": [
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-1.01, 52.99],
                            [-0.99, 52.99],
                            [-0.99, 53.01],
                            [-1.01, 53.01],
                            [-1.01, 52.99],
                        ]
                    ],
                }
            }
        ]
    }


@pytest.mark.parametrize(
    "geometry",
    [
        {"type": "MultiPolygon", "coordinates": []},
        {"type": "Polygon", "coordinates": []},
        {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [0, 0]]]},
    ],
)
def test_empty_or_degenerate_mandatory_geometry_cannot_be_outside(geometry):
    assert (
        oi.area_relation((53, -1), {"features": [{"geometry": geometry}]}) == "UNKNOWN"
    )


def test_invalid_hole_cannot_be_hidden_by_outside_shell():
    areas = polygon()
    areas["features"][0]["geometry"]["coordinates"].append([[0, 0], [1, 0]])
    assert oi.area_relation((54, -1), areas) == "UNKNOWN"


def test_caz_invalid_vertex_must_not_be_silently_deleted():
    from voyagr.services.routing.integrity import normalize_requirements
    from voyagr import config

    req = normalize_requirements(
        {
            "avoidance_requirements": [
                {"category": "caz", "mode": "mandatory", "enabled": True}
            ]
        }
    )
    zones = {
        "fixture": {
            "polygon": [
                (53, -1),
                (53, -0.99),
                (float("nan"), -0.98),
                (53.01, -0.99),
                (53, -1),
            ]
        }
    }
    with patch.object(config, "CAZ_ZONES_DATA", zones):
        context = oi.context_for_request({"start": "54,-1", "end": "54.1,-1"}, req)
    assert oi._relation(context, (54, -1)) == "UNKNOWN"


from voyagr.utils import origin_replay as replay
import json, hashlib


def bundle():
    fixtures = []
    for identity, metres in enumerate(replay.EXPECTED):
        lat = 53 + identity * 0.000001
        request = {
            "profile": "car",
            "ch.disable": True,
            "points": [[-1, lat], [-1, 53.01]],
            "custom_model": {
                "priority": [{"if": "in_camera_area_75", "multiply_by": "0"}]
            },
        }
        points = {
            "type": "LineString",
            "coordinates": [[-1, lat + metres / 111195], [-1, 53.01]],
        }
        response = {
            "paths": [
                {
                    "points": points,
                    "snapped_waypoints": copy.deepcopy(points),
                    "distance": 1000,
                    "time": 60000,
                }
            ]
        }
        f = {
            "id": identity,
            "request": request,
            "response": response,
            "http_status": 200,
        }
        for key in ("request", "response"):
            f[key + "_sha256"] = hashlib.sha256(
                json.dumps(f[key], sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
        transport = {
            "schema_version": 1,
            "reviewed": True,
            "method": "POST",
            "request_target": "/route",
            "request_sha256": f["request_sha256"],
            "response_sha256": f["response_sha256"],
            "http_status": 200,
            "evidence_sha256": "b" * 64,
            "engine_build_sha256": "a" * 64,
            "graph_sha256": "a" * 64,
        }
        f["transport"] = transport
        f["transport_sha256"] = hashlib.sha256(
            json.dumps(transport, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        fixtures.append(f)
    return {
        "kind": "SYNTHETIC_PROTOCOL_TEST",
        "reviewed": True,
        "engine": dict(
            version="8.0",
            profile="car",
            **{
                k: "a" * 64
                for k in (
                    "dataset_sha256",
                    "graph_sha256",
                    "import_receipt_sha256",
                    "engine_build_sha256",
                    "road_source_sha256",
                    "oracle_sha256",
                )
            }
        ),
        "fixtures": fixtures,
    }


def tiny_area():
    return {
        "features": [
            {
                "id": "camera_area_75",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-1.00001, 52.99999],
                            [-0.99999, 52.99999],
                            [-0.99999, 53.00001],
                            [-1.00001, 53.00001],
                            [-1.00001, 52.99999],
                        ]
                    ],
                },
            }
        ]
    }


def test_default_result_never_claims_live_or_recorded_replay():
    out = replay.unexecuted()
    assert out["live_engine"] == out["recorded_replay"] == "NOT_TESTED"
    assert len(out["fixtures"]) == 5
    assert {f["status"] for f in out["fixtures"]} == {"NOT_TESTED"}


def test_synthetic_five_case_protocol_uses_real_cache_ingress_and_browser_gate():
    out = replay.replay(bundle(), tiny_area())
    assert out["recorded_replay"] == "SYNTHETIC_ONLY"
    assert out["live_engine"] == "NOT_TESTED"
    assert [f["status"] for f in out["fixtures"]] == ["PASS_SYNTHETIC_PROTOCOL"] * 5
    assert all(
        f["browser_refused"]
        and f["cache_reassessed"] == {"memory": True, "persistent": True}
        for f in out["fixtures"]
    )
    public = json.dumps(out)
    for forbidden in (
        "coordinates",
        "requested_origin",
        "53.01",
        "custom_model",
        "oracle_sha256",
    ):
        assert forbidden not in public


@pytest.mark.parametrize(
    "change",
    [
        "missing_native",
        "capture_hash",
        "duplicate_case",
        "unsupported_model",
        "wrong_profile",
        "html_504",
    ],
)
def test_unbound_or_malformed_capture_refused(change):
    value = bundle()
    first = value["fixtures"][0]
    if change == "missing_native":
        del first["response"]["paths"][0]["snapped_waypoints"]
        with pytest.raises(ValueError, match="native_snaps_required"):
            replay.normalized(first)
        return
    if change == "capture_hash":
        first["request_sha256"] = "b" * 64
    elif change == "duplicate_case":
        value["fixtures"][1]["id"] = 0
    elif change == "unsupported_model":
        first["request"]["custom_model"] = {}
    elif change == "wrong_profile":
        value["engine"]["profile"] = "truck"
    elif change == "html_504":
        first.update(http_status=504, response="<html>private location</html>")
    with pytest.raises(ValueError):
        replay.validate_bundle(value)


def test_prepared_index_matches_holes_boundaries_and_union_with_no_global_result_cache():
    areas = polygon()
    prepared = oi.prepare_areas(areas)
    for p, expected in [
        ((53, -1), "INSIDE"),
        ((52.99, -1), "BOUNDARY"),
        ((54, -1), "OUTSIDE"),
    ]:
        assert oi.relation_from_prepared(p, prepared) == expected
    areas["features"][0]["geometry"]["coordinates"][0][0][0] = 0
    # The immutable in-flight snapshot cannot be changed through mutable source data.
    assert oi.relation_from_prepared((53, -1), prepared) == "INSIDE"
    assert (
        oi.prepare_areas(areas) is None
    )  # closure now corrupt; next request sees UNKNOWN


def test_index_keeps_numerical_boundary_band_and_hole_edges():
    areas = polygon()
    areas["features"][0]["geometry"]["coordinates"].append(
        [
            [-1.001, 52.999],
            [-0.999, 52.999],
            [-0.999, 53.001],
            [-1.001, 53.001],
            [-1.001, 52.999],
        ]
    )
    prepared = oi.prepare_areas(areas)
    assert oi.relation_from_prepared((53, -1), prepared) == "OUTSIDE"
    assert oi.relation_from_prepared((53, -0.999), prepared) == "BOUNDARY"
    assert oi.relation_from_prepared((53, -0.989999995), prepared) == "BOUNDARY"
    assert oi.relation_from_prepared((53, -0.9899999), prepared) == "OUTSIDE"


def test_expired_index_build_or_query_propagates_deadline():
    from voyagr.utils import request_budget

    with patch.object(
        request_budget,
        "check_budget",
        side_effect=request_budget.RoutingDeadlineExceeded(),
    ):
        with pytest.raises(request_budget.RoutingDeadlineExceeded):
            oi.prepare_areas(polygon())
        with pytest.raises(request_budget.RoutingDeadlineExceeded):
            oi.relation_from_prepared((53, -1), (((0, 0, 1, 1), ()),))


def test_prepared_union_matches_independent_geos_oracle_for_synthetic_points():
    import random
    from shapely.geometry import Point, shape
    from shapely.ops import unary_union

    areas = polygon()
    areas["features"][0]["geometry"]["coordinates"].append(
        [
            [-1.001, 52.999],
            [-0.999, 52.999],
            [-0.999, 53.001],
            [-1.001, 53.001],
            [-1.001, 52.999],
        ]
    )
    extra = copy.deepcopy(polygon()["features"][0])
    extra["geometry"]["coordinates"][0] = [
        [x + 0.015, y] for x, y in extra["geometry"]["coordinates"][0]
    ]
    areas["features"].append(extra)
    oracle = unary_union([shape(f["geometry"]) for f in areas["features"]])
    prepared = oi.prepare_areas(areas)
    randomizer = random.Random(12)
    for _ in range(100):
        lat = 52.98 + randomizer.random() * 0.04
        lon = -1.02 + randomizer.random() * 0.06
        expected = "INSIDE" if oracle.contains(Point(lon, lat)) else "OUTSIDE"
        assert oi.relation_from_prepared((lat, lon), prepared) == expected


def test_bounded_concurrent_contexts_never_share_stale_relation_results():
    from concurrent.futures import ThreadPoolExecutor

    def check(index):
        context = {
            "areas": polygon() if index % 2 else None,
            "camera_mandatory": True,
            "relations": {},
        }
        return oi._relation(context, (53, -1))

    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(check, range(16)))
    assert results == ["UNKNOWN", "INSIDE"] * 8


def test_native_waypoint_mismatch_cannot_pass_a_recorded_fixture_protocol():
    value = bundle()
    value["fixtures"][0]["response"]["paths"][0]["snapped_waypoints"]["coordinates"][0][
        0
    ] = 0
    # Refresh content hash only: independent native/geometry consistency still fails.
    f = value["fixtures"][0]
    f["response_sha256"] = hashlib.sha256(
        json.dumps(f["response"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    f["transport"]["response_sha256"] = f["response_sha256"]
    f["transport_sha256"] = hashlib.sha256(
        json.dumps(f["transport"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    out = replay.replay(value, tiny_area(), check_caches=False, check_browser=False)
    assert out["fixtures"][0]["native_matches_geometry"] is False
    assert out["fixtures"][0]["status"] == "FAIL_OR_UNVERIFIED"


def test_combined_ring_size_limit_is_preserved_before_filtering():
    areas = polygon()
    ring = areas["features"][0]["geometry"]["coordinates"][0]
    expanded = ring[:-1] * 3000 + [ring[0]]
    areas["features"][0]["geometry"]["coordinates"] = [expanded, expanded]
    assert oi.prepare_areas(areas) is None
