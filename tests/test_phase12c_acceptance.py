"""Synthetic harness regressions, never evidence of GraphHopper enforcement."""

import copy
import json
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch

import pytest
from shapely.geometry import Polygon, box
from voyagr.utils import graphhopper_acceptance as a

ROOT = Path(__file__).parents[1]


def route(points=None):
    return {
        "paths": [
            {
                "points": {
                    "type": "LineString",
                    "coordinates": points or [[-1, 53], [-0.9, 53]],
                },
                "distance": 100,
                "time": 1000,
                "instructions": [],
            }
        ]
    }


@pytest.fixture(scope="module")
def bundle():
    return a.artifacts(
        ROOT / "artifacts/camera-areas/phase12b/manifest.json",
        ROOT / "camera_areas.geojson",
    )


def test_actual_manifest_resolution_and_full_inventory(bundle):
    assert bundle["summary"]["resolution"] == "HASH_MATCHED_MANIFEST_SIBLING"
    assert len(bundle["geometries"]) == 128
    assert bundle["summary"]["geographic_equivalence"] is True
    assert bundle["summary"]["properties_preserved"] is True


def test_offline_never_opens_network_and_all_256_are_not_tested(bundle):
    with patch.object(a.Transport, "call", side_effect=AssertionError("network")):
        report = a.run(bundle, {})
    assert report["request_count"] == 0
    assert sum(len(v) for v in report["area_compilation"].values()) == 256
    assert {
        v["status"] for rows in report["area_compilation"].values() for v in rows
    } == {"NOT_TESTED"}
    assert report["replacement_decision"] == "CANDIDATE_NOT_VERIFIED"


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:18989",
        "http://127.0.0.1:8989",
        "http://example.com:18989",
        "http://user:secret@127.0.0.1:18989",
        "http://127.0.0.1:18989/path",
        "http://127.0.0.1:18989/?secret=x",
    ],
)
def test_production_remote_and_credential_origins_refused(url):
    with pytest.raises(ValueError):
        a.isolated_origin(url)


def test_unreviewed_plan_refused_before_network(bundle):
    with patch.object(a.Transport, "call", side_effect=AssertionError("network")):
        with pytest.raises(ValueError):
            a.run(bundle, {}, approved=True)


@pytest.mark.parametrize("identity", a.AREA_IDS)
def test_every_area_uses_exact_reference_and_hard_zero(identity):
    assert a.model_for([identity]) == {
        "priority": [{"if": "in_" + identity, "multiply_by": "0"}]
    }


def test_colliding_inline_area_refused():
    with pytest.raises(ValueError):
        a.model_for(
            ["camera_area_0"], {"areas": {"features": [{"id": "camera_area_0"}]}}
        )


@pytest.mark.parametrize(
    "status,body,expected",
    [
        (
            400,
            {"message": "Cannot compile expression: toll not available"},
            "MODEL_REJECTED",
        ),
        (400, {"message": "unknown area"}, "MODEL_REJECTED"),
        (400, {"message": "invalid condition"}, "MODEL_REJECTED"),
        (400, {"message": "generic error"}, "VALIDATION_ERROR"),
        (502, {"message": "proxy"}, "PROVIDER_FAILURE"),
        (504, "<html>private journey</html>", "INVALID_RESPONSE"),
        (
            400,
            {
                "hints": [
                    {
                        "details": "com.graphhopper.util.exceptions.ConnectionNotFoundException"
                    }
                ]
            },
            "NO_PATH",
        ),
        (
            500,
            {
                "hints": [
                    {
                        "details": "com.graphhopper.util.exceptions.ConnectionNotFoundException"
                    }
                ]
            },
            "PROVIDER_FAILURE",
        ),
        (200, {}, "INVALID_ROUTE_RESPONSE"),
        (200, route(), "ROUTE"),
    ],
)
def test_response_categories_do_not_echo_payload(status, body, expected):
    assert a.classify(status, body) == expected


@pytest.mark.parametrize(
    "points,interior,boundary",
    [
        ([[-1, 1], [3, 1]], True, False),  # no sampled point is inside
        ([[-1, 0], [3, 0]], False, True),
        ([[-1, -1], [3, -1]], False, False),
    ],
)
def test_full_segments_and_boundary(points, interior, boundary):
    result = a.inspect_paths(route(points), [box(0, 0, 2, 2)])[0]
    assert result["interior_intersection"] is interior
    assert result["boundary_only_contact"] is boundary
    assert result["edge_evidence"] == "NOT_TESTED"


def test_hole_not_treated_as_excluded_interior():
    polygon = Polygon(
        [(0, 0), (4, 0), (4, 4), (0, 4)], holes=[[(1, 1), (3, 1), (3, 3), (1, 3)]]
    )
    assert (
        a.inspect_paths(route([[1.5, 2], [2.5, 2]]), [polygon])[0][
            "interior_intersection"
        ]
        is False
    )
    assert (
        a.inspect_paths(route([[-1, 2], [5, 2]]), [polygon])[0]["interior_intersection"]
        is True
    )


def test_edge_oracle_and_comparison_do_not_publish_coordinates_or_instructions():
    first = route()
    first["paths"][0]["details"] = {"edge_id": [[0, 1, 123]]}
    first["paths"][0]["instructions"] = [{"street_name": "PRIVATE_NAME"}]
    assert (
        a.inspect_paths(first, [box(0, 0, 1, 1)], [123])[0]["oracle_blocked_edge_used"]
        is True
    )
    result = a.compare_routes(first, copy.deepcopy(first))
    assert result["edge_sequences_equal"] is True
    assert "PRIVATE_NAME" not in json.dumps(result)
    assert "coordinates" not in json.dumps(result)


def plan(bundle):
    value = json.loads(
        (ROOT / "scripts/fixtures/phase12c/plan-template.json").read_text()
    )
    value.update(
        operator_approved=True, isolated_not_production=True, reviewed_graph_oracle=True
    )
    value["provenance"] = {k: "a" * 64 for k in value["provenance"]}
    value["provenance"]["encoded_values_sha256"] = a.sha(b"{}")
    for label, key in [
        ("original", "source_sha256"),
        ("candidate", "candidate_sha256"),
    ]:
        value["instances"][label].update(
            dataset_sha256=bundle["summary"][key],
            graph_revision_sha256="b" * 64,
            import_receipt_sha256="c" * 64,
        )
    value["seed_request"] = {"points": [[-1, 53], [-0.9, 53]]}
    return value


class FakeTransport:
    def __init__(self, ignore=False):
        self.calls = 0
        self.timings = defaultdict(list)
        self.payloads = []
        self.ignore = ignore

    def call(self, origin, path, payload, stage):
        self.calls += 1
        self.timings[stage].append(1)
        self.payloads.append(payload)
        if path == "/info":
            return 200, {
                "version": "8.0",
                "profiles": [{"name": "car"}],
                "encoded_values": {},
            }
        if stage == "negative_control" and not self.ignore:
            return 400, {"message": "Cannot compile expression"}
        return 200, route()


def test_bounded_paired_compile_protocol_is_not_acceptance(bundle):
    io = FakeTransport()
    result = a.run(bundle, plan(bundle), approved=True, area_count=16, transport=io)
    assert io.calls == 40  # two metadata, six controls, 32 area requests
    assert (
        sum(
            v["status"] == "REQUEST_ACCEPTED_ENFORCEMENT_UNVERIFIED"
            for rows in result["area_compilation"].values()
            for v in rows
        )
        == 32
    )
    assert result["replacement_decision"] == "CANDIDATE_NOT_VERIFIED"
    assert all(
        p["profile"] == "car" and p["points_encoded"] is False for p in io.payloads if p
    )


def test_ignored_negative_controls_stop_compilation(bundle):
    io = FakeTransport(ignore=True)
    result = a.run(bundle, plan(bundle), approved=True, transport=io)
    assert result["engine_execution"] == "STOPPED_OR_PARTIAL"
    assert result["stop_category"] == "model_rejection_not_proven"
    assert io.calls == 5


def test_empty_fixture_batch_cannot_pass(bundle):
    with pytest.raises(ValueError, match="empty_fixture_batch"):
        a.run(
            bundle,
            plan(bundle),
            approved=True,
            mode="fixtures",
            transport=FakeTransport(),
        )


def test_expired_and_exhausted_transport_launch_no_request():
    for transport in (a.Transport(seconds=0), a.Transport(max_calls=0)):
        with patch.object(
            a.requests.Session, "request", side_effect=AssertionError("network")
        ):
            with pytest.raises(a.LimitExceeded):
                transport.call("http://127.0.0.1:18989", "/info", None, "metadata")
        assert transport.calls == 0


def test_source_hash_mismatch_refused(bundle, tmp_path):
    path = tmp_path / "source.json"
    path.write_text("{}")
    with pytest.raises(ValueError, match="source_hash_mismatch"):
        a.artifacts(ROOT / "artifacts/camera-areas/phase12b/manifest.json", path)


@pytest.mark.parametrize(
    "ids", [[], ["camera_area_0", "camera_area_0"], ["camera_area_128"]]
)
def test_unknown_or_duplicate_ids_refused(ids):
    with pytest.raises(ValueError):
        a.model_for(ids)


def test_multiple_area_rule_keeps_all_hard_blocks():
    assert a.model_for(["camera_area_1", "camera_area_127"])["priority"] == [
        {"if": "in_camera_area_1 || in_camera_area_127", "multiply_by": "0"}
    ]


def test_wrong_version_stops_before_controls(bundle):
    class WrongVersion(FakeTransport):
        def call(self, *args):
            status, body = super().call(*args)
            body["version"] = "9.0"
            return status, body

    io = WrongVersion()
    report = a.run(bundle, plan(bundle), approved=True, transport=io)
    assert io.calls == 1
    assert report["stop_category"] == "engine_version_unverified"


def test_reviewed_baseline_relation_required_and_checked(bundle):
    value = plan(bundle)
    fixture = {
        "category": "baseline_intersection",
        "reviewed": True,
        "oracle_sha256": "d" * 64,
        "expected_restricted": "ROUTE",
        "boundary_policy": "FORBID",
        "area_ids": ["camera_area_0"],
        "request": value["seed_request"],
    }
    value["fixtures"] = [fixture]
    with pytest.raises(ValueError, match="reviewed_fixture_required"):
        a.validate_plan(value, bundle["summary"])
    fixture["baseline_relation"] = "INTERIOR"
    local = dict(bundle, geometries={"camera_area_0": box(0, 0, 1, 1)})
    report = a.run(
        local, value, approved=True, mode="fixtures", transport=FakeTransport()
    )
    assert {v["status"] for v in report["fixture_results"]} == {
        "FAIL_OR_UNVERIFIED_FIXTURE"
    }
    assert {v["baseline_relation"] for v in report["fixture_results"]} == {"OUTSIDE"}


def test_transport_rejects_late_result_and_does_not_retry():
    now = [0.0]

    class Response:
        status_code = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def iter_content(self, size):
            now[0] = 61
            yield b'{"version":"8.0"}'

    io = a.Transport(clock=lambda: now[0])
    with patch.object(
        a.requests.Session, "request", return_value=Response()
    ) as request:
        with pytest.raises(a.LimitExceeded):
            io.call("http://127.0.0.1:18989", "/info", None, "metadata")
        with pytest.raises(a.LimitExceeded):
            io.call("http://127.0.0.1:18989", "/info", None, "metadata")
    assert request.call_count == 1
    assert io.calls == 1
    assert io.timings["metadata"] == [61000]


def test_malformed_json_stops_protocol_without_echo(bundle):
    class Broken(FakeTransport):
        def call(self, *args):
            self.calls += 1
            raise json.JSONDecodeError("PRIVATE_RESPONSE", "secret", 0)

    report = a.run(bundle, plan(bundle), approved=True, transport=Broken())
    assert report["engine_execution"] == "STOPPED_OR_PARTIAL"
    assert "secret" not in json.dumps(report)
    assert "PRIVATE_RESPONSE" not in json.dumps(report)


def test_fresh_encoded_metadata_must_match_reviewed_receipt(bundle):
    value = plan(bundle)
    value["provenance"]["encoded_values_sha256"] = "e" * 64
    io = FakeTransport()
    report = a.run(bundle, value, approved=True, transport=io)
    assert report["stop_category"] == "encoded_values_receipt_mismatch"
    assert io.calls == 1


def test_missing_manoeuvres_cannot_be_claimed_equal():
    first = route()
    del first["paths"][0]["instructions"]
    assert (
        a.compare_routes(first, copy.deepcopy(first))["manoeuvre_sequences_equal"]
        == "NOT_TESTED"
    )
