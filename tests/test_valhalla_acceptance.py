"""Synthetic adapter tests: no running-engine or road-legality evidence."""

import base64
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock, patch

import polyline
import pytest

from voyagr.utils import valhalla_acceptance as a
from voyagr.utils import review_package_io as io
from tests import phase12fc_fixture0 as adapter
from voyagr.utils.origin_replay import offline_guard
from tests.test_phase12f_origin import app_response, r
from tests.test_independent_road_oracle import analyse, export, endpoint


def wire(fixture, key, value):
    raw = json.dumps(value, separators=(",", ":")).encode()
    fixture[key + "_base64"] = base64.b64encode(raw).decode()
    fixture[key + "_sha256"] = hashlib.sha256(raw).hexdigest()


def trip(points=None):
    return {
        "status": 0,
        "units": "kilometers",
        "summary": {"length": 1, "time": 60},
        "legs": [
            {
                "summary": {"length": 1, "time": 60},
                "shape": polyline.encode(
                    points or [(53, -1), (53.01, -1)], precision=6
                ),
                "maneuvers": [],
            }
        ],
    }


def bundle(response=None, request=None):
    points = [{"lat": 53, "lon": -1}, {"lat": 53.01, "lon": -1}]
    fixture = {
        "original_locations": points,
        "transport": {"method": "POST", "target": "/route", "status": 200},
    }
    wire(fixture, "request", request or {"locations": points, "costing": "auto"})
    wire(fixture, "response", response or {"trip": trip()})
    return {
        "schema": "voyagr-valhalla-private-v1",
        "source": "SYNTHETIC",
        "fixtures": [dict(copy.deepcopy(fixture), id=i) for i in range(5)],
    }


def replay(value):
    with offline_guard():
        report = a.replay(value)
    assert report["reviewed"] is report["navigation_authorized"] is False
    assert report["operational_status"] == "PRODUCTION_NO_GO"
    assert report["live_engine"] == "NOT_TESTED"
    assert "oracle_sha256" not in json.dumps(report)
    return report


def test_valid_geometry_is_diagnostic_only_and_sanitized():
    report = replay(bundle())
    row = report["fixtures"][0]
    assert row["status"] == "UNVERIFIED"
    assert row["routes"][0]["origin_gate"] == "CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE"
    assert row["routes"][0]["native_correlation"] == "UNVERIFIED"
    encoded = json.dumps(report)
    assert '"lat"' not in encoded and '"shape"' not in encoded
    assert '"locations"' not in encoded and '"sha256"' not in encoded


@pytest.mark.parametrize(
    "response",
    [
        {"error": "private-credential-location", "trip": trip()},
        {"trip": dict(trip(), status=1)},
        {"trip": dict(trip(), units="miles")},
        {"trip": dict(trip(), legs=[])},
        {"trip": dict(trip(), legs=[{"shape": None}])},
        {
            "trip": dict(
                trip(),
                legs=[dict(trip()["legs"][0], maneuvers=[{"begin_shape_index": 1000}])],
            )
        },
        {"trip": trip(), "alternates": [{"trip": {}}]},
        {"trip": trip(), "alternates": [{"trip": trip()}] * 3},
    ],
)
def test_invalid_primary_or_alternative_is_refused(response):
    report = replay(bundle(response))
    assert {f["status"] for f in report["fixtures"]} == {"REFUSED_OR_UNAVAILABLE"}
    assert "private-credential-location" not in json.dumps(report)


@pytest.mark.parametrize("offset", [0.00003, 0.00042, 0.002])
def test_wrong_carriageway_echoed_locations_do_not_prove_native_snapping(offset):
    response = {"trip": trip([(53 + offset, -1), (53.01, -1)])}
    response["trip"]["locations"] = bundle()["fixtures"][0]["original_locations"]
    route = replay(bundle(response))["fixtures"][0]["routes"][0]
    assert route["origin_gate"] == "UNVERIFIED"
    assert route["native_correlation"] == "UNVERIFIED"
    assert route["navigation_authorized"] is False


def test_alternative_and_multistop_all_legs_are_checked():
    t = trip()
    t["legs"] = [
        trip([(53, -1), (53.005, -1)])["legs"][0],
        trip([(53.005, -1), (53.01, -1)])["legs"][0],
    ]
    report = replay(bundle({"trip": t, "alternates": [{"trip": trip()}]}))
    assert [r["leg_count"] for r in report["fixtures"][0]["routes"]] == [2, 1]
    t["legs"][1]["shape"] = polyline.encode([(54, -1), (54.01, -1)], precision=6)
    assert (
        replay(bundle({"trip": t}))["fixtures"][0]["status"] == "REFUSED_OR_UNAVAILABLE"
    )


def test_original_destination_cannot_be_replaced_with_graphhopper_snap():
    b = bundle()
    b["fixtures"][0]["original_locations"][-1]["lat"] += 0.001
    assert replay(b)["fixtures"][0]["status"] == "REFUSED_OR_UNAVAILABLE"


@pytest.mark.parametrize("costing", ["truck", "pedestrian", "bicycle"])
def test_unsupported_costing_is_not_silently_auto(costing):
    request = {
        "costing": costing,
        "locations": bundle()["fixtures"][0]["original_locations"],
    }
    assert (
        replay(bundle(request=request))["fixtures"][0]["status"]
        == "REFUSED_OR_UNAVAILABLE"
    )


def test_hash_mismatch_and_transport_claim_cannot_be_repaired():
    b = bundle()
    b["fixtures"][0]["response_sha256"] = "0" * 64
    b["fixtures"][1]["transport"]["status"] = 500
    original = copy.deepcopy(b)
    report = replay(b)
    assert all(f["status"] == "REFUSED_OR_UNAVAILABLE" for f in report["fixtures"][:2])
    assert b == original


def test_exclusions_and_vehicle_dimensions_never_become_proof():
    request = {
        "costing": "auto",
        "locations": bundle()["fixtures"][0]["original_locations"],
        "exclude_locations": [{"lat": 53.005, "lon": -1}],
        "costing_options": {"auto": {"height": 9}},
    }
    route = replay(bundle(request=request))["fixtures"][0]["routes"][0]
    assert (
        route["mandatory_exclusions"] == route["vehicle_restrictions"] == "UNVERIFIED"
    )


def test_existing_osm_oneway_and_conditional_checks_remain_independent():
    out = analyse(export({"oneway": "yes"}), origin=endpoint(20), target=endpoint())
    assert out["connectivity"] != "KNOWN_PATH_IN_EXPORT"
    out = analyse(export({"access:conditional": "no @ (Mo-Fr)"}))
    assert out["connectivity"] == "UNVERIFIED"
    assert out["navigation_authorized"] is False


def test_existing_fallback_order_and_cache_gate_do_not_trust_valhalla():
    with offline_guard():
        response = app_response([r(46.31, "Valhalla"), r(0)]).get_json()
        assert response["routes"][0]["source"] == "GraphHopper"
        cached = r(46.31, "Valhalla")
        cached["avoidance_assessment"] = {"automatic_selection_allowed": True}
        response = app_response([cached]).get_json()
        assert response["automatic_selection_allowed"] is False
        assert (
            response["routes"][0]["avoidance_assessment"]["origin_integrity"][
                "navigation_allowed"
            ]
            is False
        )


def test_cli_default_has_exactly_five_not_tested_rows():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, str(root / "scripts/replay-phase12fc-valhalla.py")],
        capture_output=True,
        check=True,
    )
    report = json.loads(result.stdout)
    assert report == a.unexecuted()


def test_private_reader_reuses_no_atime_and_preserves_metadata(tmp_path):
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps(bundle()))
    before = path.stat()
    assert a.load_private(path)["source"] == "SYNTHETIC"
    assert path.stat() == before


def _create_symlink_or_skip(link, target):
    try:
        link.symlink_to(target)
    except OSError as error:
        if sys.platform == "win32" and getattr(error, "winerror", None) == 1314:
            pytest.skip(
                "Windows symlink creation privilege unavailable (WinError 1314)"
            )
        raise


def test_private_reader_refuses_links_when_creation_supported(tmp_path):
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps(bundle()))
    link = tmp_path / "link.json"
    _create_symlink_or_skip(link, path)
    with pytest.raises(ValueError):
        a.load_private(link)


def test_windows_symlink_privilege_denial_skips_only_link_creation(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    error = OSError("synthetic privilege denial")
    error.winerror = 1314
    link = Mock()
    link.symlink_to.side_effect = error
    with pytest.raises(pytest.skip.Exception, match="WinError 1314"):
        _create_symlink_or_skip(link, "synthetic-target")
    link.symlink_to.assert_called_once_with("synthetic-target")


@pytest.mark.parametrize(
    "platform,winerror,error_type",
    [
        ("win32", 5, OSError),
        ("win32", None, OSError),
        ("linux", 1314, OSError),
        ("win32", None, RuntimeError),
    ],
)
def test_other_symlink_creation_failures_are_not_skipped(
    monkeypatch, platform, winerror, error_type
):
    monkeypatch.setattr(sys, "platform", platform)
    error = error_type("synthetic unrelated failure")
    if winerror is not None:
        error.winerror = winerror
    link = Mock()
    link.symlink_to.side_effect = error
    with pytest.raises(error_type) as caught:
        _create_symlink_or_skip(link, "synthetic-target")
    assert caught.value is error
    link.symlink_to.assert_called_once_with("synthetic-target")


@pytest.mark.parametrize(
    "raw", [b'{"trip":{},"trip":{}}', b'{"trip":NaN}', b'{"trip":1e999}']
)
def test_strict_wire_json_cannot_hide_conflicting_or_nonfinite_data(raw):
    b = bundle()
    f = b["fixtures"][0]
    f["response_base64"] = base64.b64encode(raw).decode()
    f["response_sha256"] = hashlib.sha256(raw).hexdigest()
    assert replay(b)["fixtures"][0]["status"] == "REFUSED_OR_UNAVAILABLE"


def test_metadata_claims_never_approve_recorded_bytes():
    b = bundle()
    b.update(source="DECLARED_RECORDING", reviewed=True, navigation_authorized=True)
    report = replay(b)
    assert report["scope"] == "DECLARED_RECORDING_UNREVIEWED"
    assert report["runtime_provenance"] == "UNVERIFIED"
    assert report["independent_review"] == "NOT_PERFORMED"


def test_omitted_stop_is_diagnostic_failure_without_route_authority():
    b = bundle()
    for f in b["fixtures"]:
        f["original_locations"].insert(1, {"lat": 54, "lon": -1})
        wire(f, "request", {"locations": f["original_locations"], "costing": "auto"})
    route = replay(b)["fixtures"][0]["routes"][0]
    assert route["ordered_waypoints"] is False
    assert route["navigation_authorized"] is False


def test_malformed_fixture_does_not_leak_raw_errors():
    b = bundle({"trip": dict(trip(), legs=[None])})
    assert replay(b)["fixtures"][0]["status"] == "REFUSED_OR_UNAVAILABLE"
    for invalid in [
        None,
        {},
        dict(bundle(), fixtures=[]),
        dict(bundle(), fixtures=[None] * 5),
    ]:
        with pytest.raises(ValueError):
            a.replay(invalid)


# Synthetic navigation-gate adapter controls; never recorded fixture-0 evidence.


def synthetic_pair(displaced=True):
    # Public synthetic coordinates, not reconstructed private fixture geometry.
    request = {
        "locations": [{"lat": 53, "lon": -1}, {"lat": 53.01, "lon": -1}],
        "costing": "auto",
    }
    response = {
        "trip": {
            "status": 0,
            "units": "kilometers",
            "summary": {"length": 1, "time": 60},
            "legs": [
                {
                    "shape": polyline.encode(
                        [(53.000004, -1), (53.01075 if displaced else 53.01, -1)],
                        precision=6,
                    ),
                    "summary": {"length": 1, "time": 60},
                    "maneuvers": [],
                }
            ],
        }
    }
    return request, response


def test_synthetic_destination_rejection_exercises_real_http_chain():
    request, response = synthetic_pair()
    before = copy.deepcopy((request, response))
    result = adapter.exercise(request, response, check_browser=False)
    assert result["http_destination_refused"] is True
    assert result["browser"] == "NOT_TESTED"
    assert result["cache_scope"].endswith("NOT_REAL_STORAGE")
    assert (request, response) == before


def test_positive_control_real_gate_allows_synthetic_continuous_endpoints():
    with offline_guard():
        route, body = adapter.normalize(*synthetic_pair(False))
        result = adapter.through_http(body, [route])
    a = result["routes"][0]["avoidance_assessment"]
    assert a["origin_integrity"]["navigation_allowed"] is True
    assert a["automatic_selection_allowed"] is True
    with pytest.raises(adapter.GateFailure):
        adapter.assert_rejected(result)


def test_ranking_cannot_transfer_eligible_control_permission_to_rejected_option():
    with offline_guard():
        bad, body = adapter.normalize(*synthetic_pair())
        good, _ = adapter.normalize(*synthetic_pair(False))
        good.update(source="GraphHopper", name="⚡ Optimised")
        result = adapter.through_http(body, [bad, good])
    assert result["routes"][0]["source"] == "GraphHopper"
    bad_assessment = result["routes"][1]["avoidance_assessment"]
    assert bad_assessment["automatic_selection_allowed"] is False
    assert (
        bad_assessment["origin_integrity"]["reason"] == "material_endpoint_relocation"
    )


@pytest.mark.parametrize(
    "native", [None, {}, "", {"type": "Point", "coordinates": [-1, 53]}]
)
def test_malformed_native_fault_injection_does_not_become_verified(native):
    with offline_guard():
        route, body = adapter.normalize(*synthetic_pair())
        route["provider_snapped_waypoints"] = native
        result = adapter.through_http(body, [route])
    origin = result["routes"][0]["avoidance_assessment"]["origin_integrity"]
    assert origin["navigation_allowed"] is False
    assert origin["reason"] == "malformed_or_zero_length_snapped_waypoints"
    assert origin["transition_verified"] is False


def write_synthetic_pair(root):
    raw = tuple(json.dumps(value).encode() for value in synthetic_pair())
    names = ("request.json", "response.json")
    for name, content in zip(names, raw):
        (root / name).write_bytes(content)
    return names, raw, tuple(hashlib.sha256(content).hexdigest() for content in raw)


def test_loader_preserves_source_metadata_and_content(tmp_path):
    names, raw, hashes = write_synthetic_pair(tmp_path)
    before = {
        p: io.stamp(p.lstat()) for p in [tmp_path, *(tmp_path / n for n in names)]
    }
    assert adapter._load_pair(tmp_path, names, hashes) == synthetic_pair()
    assert {p: io.stamp(p.lstat()) for p in before} == before
    # Hash equality above binds the original raw bytes; no writes in the reader.
    assert all(
        hashlib.sha256(value).hexdigest() == digest
        for value, digest in zip(raw, hashes)
    )


@pytest.mark.parametrize("bad_index", [0, 1])
def test_both_original_hashes_checked_before_either_json_parse(tmp_path, bad_index):
    names, _, hashes = write_synthetic_pair(tmp_path)
    expected = list(hashes)
    expected[bad_index] = "0" * 64
    with patch(
        "voyagr.utils.review_package.strict_json",
        side_effect=AssertionError("parsed before verified"),
    ) as parse:
        with pytest.raises(adapter.CaptureHashMismatch):
            adapter._load_pair(tmp_path, names, expected)
    parse.assert_not_called()


def test_recorded_entrypoint_cannot_accept_synthetic_hashes(tmp_path):
    names, _, _ = write_synthetic_pair(tmp_path)
    with pytest.raises(adapter.CaptureHashMismatch):
        adapter.load_recorded(tmp_path, *names)


def test_missing_private_input_is_explicit_and_never_passes(capsys, monkeypatch):
    monkeypatch.delenv("VOYAGR_PHASE12FC_PRIVATE_DIRECTORY", raising=False)
    assert adapter.main([]) == 2
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "PRIVATE_CAPTURE_NOT_AVAILABLE"
    assert report["reviewed"] is report["navigation_authorized"] is False
    assert report["operational_status"] == "PRODUCTION_NO_GO"


def test_invalid_original_hash_has_bounded_private_safe_cli_output(tmp_path, capsys):
    names, _, _ = write_synthetic_pair(tmp_path)
    assert (
        adapter.main(
            [
                "--private-directory",
                str(tmp_path),
                "--request-file",
                names[0],
                "--response-file",
                names[1],
            ]
        )
        == 2
    )
    output = capsys.readouterr().out
    assert json.loads(output)["status"] == "CAPTURE_HASH_MISMATCH"
    assert str(tmp_path) not in output and "locations" not in output
    assert len(output) < 400


def test_links_and_repository_locations_are_not_read(tmp_path):
    names, _, hashes = write_synthetic_pair(tmp_path)
    if os.name != "nt":
        link = tmp_path / "link.json"
        link.symlink_to(tmp_path / names[0])
        with pytest.raises(ValueError):
            adapter._load_pair(tmp_path, (link.name, names[1]), hashes)
    with pytest.raises(ValueError):
        adapter._load_pair(Path(__file__).parent, names, hashes)


def test_unsupported_request_cannot_be_repaired_to_original_endpoints():
    request, response = synthetic_pair()
    request["costing"] = "pedestrian"
    with pytest.raises(ValueError):
        adapter.normalize(request, response)


@pytest.mark.skipif(
    shutil.which("node") is None
    or not (adapter.ROOT / "node_modules/jsdom/package.json").is_file(),
    reason="Node/jsdom unavailable in Python-only environment; browser tests run in frontend CI",
)
def test_synthetic_backend_to_browser_bridge_with_installed_node_dependencies():
    result = adapter.exercise(*synthetic_pair())
    assert all(value is True for value in result["browser"].values())
