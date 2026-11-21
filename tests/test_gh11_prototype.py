"""Pure adapter regressions: no engine download, network, DB or app import."""
import copy
import importlib.util
import os
import json
from pathlib import Path
import subprocess

import pytest

from prototypes.graphhopper11.adapter import UnverifiedRoute, validate_journey, validate_paths


def path(key=2):
    return {"distance": 1000, "time": 120000, "points_encoded": False,
            "points": {"type": "LineString", "coordinates": [[0, 0], [.01, 0], [.02, 0]]},
            "details": {"edge_key": [[0, 2, key]]}}


def validate(paths, blocked=(), **kwargs):
    return validate_paths({"paths": paths}, blocked, coverage="SYNTHETIC_COMPLETE", **kwargs)


@pytest.mark.parametrize("count", [0, 1, 2, 3])
def test_every_candidate_is_preserved_and_validated(count):
    result = validate([path(2 * i) for i in range(count)])
    assert len(result) == count
    assert all(r["distance_km"] == 1 and r["duration_seconds"] == 120 for r in result)
    assert all(r["navigation_allowed"] is False for r in result)


def test_second_alternative_violation_refuses_response_without_downgrade():
    with pytest.raises(UnverifiedRoute, match="mandatory_edge_violation"):
        validate([path(2), path(4)], blocked=[4])


def test_reverse_key_is_distinct_and_duplicate_trace_is_not_an_alternative():
    assert len(validate([path(3), path(3)], blocked=[2])) == 1


@pytest.mark.parametrize("coverage", ["UNKNOWN", "STALE", "PARTIAL", "AVAILABLE"])
def test_real_or_incomplete_coverage_cannot_be_promoted_to_synthetic_proof(coverage):
    with pytest.raises(UnverifiedRoute, match="coverage_unverified"):
        validate_paths({"paths": [path()]}, [], coverage=coverage)


@pytest.mark.parametrize("trace", [None, [], [[1, 2, 2]], [[0, 1, 2]], [[0, 3, 2]],
                                  [[0, 1, 2], [0, 2, 4]], [[0, 2, True]]])
def test_missing_partial_or_forged_trace_is_refused(trace):
    candidate = path()
    candidate["details"]["edge_key"] = trace
    with pytest.raises(UnverifiedRoute):
        validate([candidate])


@pytest.mark.parametrize("value", [float("nan"), float("inf"), True, 181])
def test_invalid_coordinates_cannot_pass(value):
    candidate = path()
    candidate["points"]["coordinates"][1][0] = value
    with pytest.raises(UnverifiedRoute):
        validate([candidate])


def test_response_and_request_evidence_are_not_mutated():
    candidate = path()
    original = copy.deepcopy(candidate)
    blocked = [4]
    validate([candidate], blocked)
    assert candidate == original and blocked == [4]


def test_provider_error_and_excess_candidates_fail_closed():
    with pytest.raises(UnverifiedRoute, match="provider_error"):
        validate_paths({"errors": [{"message": "failed"}], "paths": [path()]}, [], coverage="SYNTHETIC_COMPLETE")
    with pytest.raises(UnverifiedRoute, match="invalid_candidates"):
        validate([path(i) for i in range(4)])


def load_runner(monkeypatch):
    folder = Path(__file__).resolve().parents[1] / "prototypes" / "graphhopper11"
    monkeypatch.syspath_prepend(str(folder))
    spec = importlib.util.spec_from_file_location("gh11_prototype_runner", folder / "run.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_wrong_artifact_is_refused_before_starting_java(tmp_path, monkeypatch):
    module = load_runner(monkeypatch)
    jar = tmp_path / "wrong.jar"
    jar.write_bytes(b"not the pinned runtime")
    def forbidden(*args, **kwargs):
        pytest.fail("invalid artifact must not launch a subprocess")
    monkeypatch.setattr(module.subprocess, "run", forbidden)
    with pytest.raises(ValueError, match="checksum mismatch"):
        module.run(jar)


@pytest.mark.skipif(not os.environ.get("GH11_PROTOTYPE_JAR"), reason="Pinned local GH11.1 artifact not supplied")
def test_real_gh11_import_and_directed_exclusion_search(monkeypatch):
    report = load_runner(monkeypatch).run(os.environ["GH11_PROTOTYPE_JAR"])
    assert report["engine_version"] == "11.1"
    assert report["production_migration"] == "NO_GO"
    assert report["validated_candidate_counts"] == {
        "alternatives_3": 3, "alternatives_2": 2, "alternatives_1": 1, "alternatives_0": 0,
        "opposite_direction": 1, "virtual_endpoints": 1, "virtual_reverse": 1,
        "virtual_all_blocked": 0, "isolation": 1,
    }
    assert report["concurrent_checks"] == 12
    assert report["turn_fixture"]["imported_restriction"] is True
    assert report["turn_fixture"]["whole_route_and_reverse"] == "PASS"
    assert report["turn_fixture"]["illegal_independent_leg_join"] == "REFUSED"
    assert report["turn_fixture"]["legal_continuation_leg_count"] == 2


def journey():
    first, second = path(2), path(6)
    second["points"]["coordinates"] = [[.02, 0], [.03, 0], [.04, 0]]
    legs = [{"paths": [p], "graph_version": "a" * 64} for p in (first, second)]
    rules = dict(blocked_keys=[], visits=[[0, 0], [.02, 0], [.04, 0]],
                 forbidden_turn_pairs=[[2, 4]], graph_version="a" * 64, coverage="SYNTHETIC_COMPLETE")
    return legs, rules


def test_legal_journey_preserves_order_metrics_and_refuses_navigation():
    legs, rules = journey()
    result = validate_journey(legs, **rules)
    assert result["coordinates"] == [[0, 0], [.01, 0], [.02, 0], [.03, 0], [.04, 0]]
    assert result["directed_edge_keys"] == [2, 6]
    assert result["distance_km"] == 2 and result["duration_seconds"] == 240
    assert result["leg_count"] == 2 and result["navigation_allowed"] is False


def test_individually_legal_legs_cannot_bypass_prohibited_turn_at_seam():
    legs, rules = journey()
    legs[1]["paths"][0]["details"]["edge_key"] = [[0, 2, 4]]
    assert all(validate_paths(leg, [], coverage="SYNTHETIC_COMPLETE") for leg in legs)
    with pytest.raises(UnverifiedRoute, match="mandatory_turn_violation"):
        validate_journey(legs, **rules)


def test_internal_turn_and_second_leg_hazard_are_checked():
    legs, rules = journey()
    legs[0]["paths"][0]["details"]["edge_key"] = [[0, 1, 2], [1, 2, 4]]
    with pytest.raises(UnverifiedRoute, match="mandatory_turn_violation"):
        validate_journey(legs, **rules)
    legs, rules = journey()
    rules["blocked_keys"] = [6]
    with pytest.raises(UnverifiedRoute, match="mandatory_edge_violation"):
        validate_journey(legs, **rules)


@pytest.mark.parametrize("failure", ["missing_leg", "empty_leg", "reordered_visits", "disconnected",
                                    "graph_version", "no_turn_evidence", "partial_coverage"])
def test_unverified_journey_cannot_be_promoted(failure):
    legs, rules = journey()
    if failure == "missing_leg":
        legs.pop()
    elif failure == "empty_leg":
        legs[1]["paths"] = []
    elif failure == "reordered_visits":
        rules["visits"].reverse()
    elif failure == "disconnected":
        legs[1]["paths"][0]["points"]["coordinates"][0] = [.021, 0]
    elif failure == "graph_version":
        legs[1]["graph_version"] = "b" * 64
    elif failure == "no_turn_evidence":
        rules["forbidden_turn_pairs"] = None
    elif failure == "partial_coverage":
        rules["coverage"] = "PARTIAL"
    with pytest.raises(UnverifiedRoute):
        validate_journey(legs, **rules)


@pytest.mark.skipif(not os.environ.get("GH11_PROTOTYPE_JAR"), reason="Pinned local GH11.1 artifact not supplied")
def test_readonly_regression_runner_checks_real_paths_without_changing_graph(tmp_path, monkeypatch):
    runner = load_runner(monkeypatch)
    jar = Path(os.environ["GH11_PROTOTYPE_JAR"]).resolve()
    assert runner.digest(jar) == runner.JAR_SHA256
    osm = tmp_path / "fixture.osm"
    osm.write_text('''<osm version="0.6">
      <node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.02"/>
      <node id="3" lat="0" lon="0.01"/><node id="4" lat="0.003" lon="0.01"/>
      <node id="5" lat="-0.003" lon="0.01"/>
      <way id="10"><nd ref="1"/><nd ref="3"/><nd ref="2"/>
        <tag k="highway" v="motorway"/><tag k="oneway" v="no"/></way>
      <way id="11"><nd ref="1"/><nd ref="4"/><nd ref="2"/>
        <tag k="highway" v="residential"/></way>
      <way id="12"><nd ref="1"/><nd ref="5"/><nd ref="2"/>
        <tag k="highway" v="residential"/></way>
    </osm>''')
    graph = tmp_path / "graph"
    config = tmp_path / "config.yml"
    config.write_text(f'''graphhopper:
  datareader.file: {osm}
  graph.location: {graph}
  graph.dataaccess.default_type: MMAP
  prepare.min_network_size: 0
  import.osm.ignored_highways: footway,construction,cycleway,path,steps
  graph.encoded_values: car_access,car_average_speed,road_access,max_speed,road_class,osm_way_id
  profiles:
    - name: car
      custom_model_files: [car.json]
      turn_costs:
        vehicle_types: [motorcar, motor_vehicle]
        u_turn_costs: 60
  profiles_ch: []
  profiles_lm: []
''')
    subprocess.run(["java", "-Xmx512m", "-jar", str(jar), "import", str(config)],
                   cwd=tmp_path, check=True, capture_output=True, timeout=90)
    before = {p.name: runner.digest(p) for p in graph.iterdir() if p.is_file()}
    cases = tmp_path / "cases.json"
    cases.write_text(json.dumps({"cases": [
        {"id": "primary", "points": [[0, 0], [0, .02]], "expected_osm_way_ids": [10], "require_all_expected_ways": True, "max_snap_distance_m": 1},
        {"id": "alternatives", "points": [[0, 0], [0, .02]], "alternatives": True, "max_visited_nodes": 1000000},
        {"id": "no_motorway", "points": [[0, 0], [0, .02]], "no_motorways": True, "max_visited_nodes": 1000000},
        {"id": "continuous_via", "points": [[0, 0], [0, .01], [0, .02]]},
    ]}))
    source = Path(__file__).resolve().parents[1] / "prototypes/graphhopper11/ReadOnlyRouteRegression.java"
    command = ["java", "-Xmx512m", "--class-path", str(jar), str(source), str(config), str(graph), str(cases)]
    completed = subprocess.run(command, cwd=tmp_path, check=True, capture_output=True, text=True, timeout=90)
    report = json.loads(next(line.split(" ", 1)[1] for line in completed.stdout.splitlines()
                             if line.startswith("VOYAGR_GH11_REGRESSION ")))
    assert report["all_available_graph_checks_passed"] is True
    assert report["production_migration"] == "NO_GO"
    assert len(report["cases"]) == 4
    primary, _, avoided, via = report["cases"]
    assert avoided["candidates"][0]["distance_km"] > primary["candidates"][0]["distance_km"]
    assert primary["candidates"][0]["matched_osm_way_ids"] == [10]
    assert primary["candidates"][0]["edge_key_scope"] == "current_loaded_graph_only"
    assert via["requested_points"] == 3
    assert primary["max_visited_nodes"] == 250000
    assert avoided["max_visited_nodes"] == 1000000 and avoided["no_motorways"] is True
    assert all(row["query_ms"] >= 0 and row["timeout_ms"] == 20000 for row in report["cases"])
    assert before == {p.name: runner.digest(p) for p in graph.iterdir() if p.is_file()}
    # A prohibited contract (native alternatives plus a via) must fail, not downgrade.
    cases.write_text(json.dumps({"cases": [{"id": "unsupported", "points": [[0, 0], [.003, .01], [0, .02]], "alternatives": True}]}))
    failed = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True, timeout=90)
    assert failed.returncode != 0
    assert '"all_available_graph_checks_passed":false' in failed.stdout
    assert "native alternatives support two points only" in failed.stdout
    cases.write_text(json.dumps({"cases": [
        {"id": "budget_too_big", "points": [[0, 0], [0, .02]], "max_visited_nodes": 1000001},
        {"id": "budget_wrong_type", "points": [[0, 0], [0, .02]], "max_visited_nodes": "1000000"},
        {"id": "route_error_timed", "points": [[90, 0], [90, .02]]},
    ]}))
    failed = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True, timeout=90)
    assert failed.returncode != 0
    failure_report = json.loads(next(line.split(" ", 1)[1] for line in failed.stdout.splitlines()
                                     if line.startswith("VOYAGR_GH11_REGRESSION ")))
    oversized, wrong_type, timed = failure_report["cases"]
    assert "outside 1000..1000000" in oversized["reason"] and "query_ms" not in oversized
    assert "must be an integer" in wrong_type["reason"] and "query_ms" not in wrong_type
    assert timed["status"] == "UNVERIFIED_OR_FAILED" and timed["query_ms"] >= 0

    cases.write_text(json.dumps({"cases": [
        {"id": "wrong_way", "points": [[0, 0], [0, .02]], "expected_osm_way_ids": [999]},
        {"id": "empty_way_evidence", "points": [[0, 0], [0, .02]], "expected_osm_way_ids": []},
        {"id": "bad_tolerance", "points": [[0, 0], [0, .02]], "max_snap_distance_m": 0},
    ]}))
    failed = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True, timeout=90)
    assert failed.returncode != 0
    assert "OSM way association mismatch" in failed.stdout
    assert "invalid expected OSM ways" in failed.stdout
    assert "snap tolerance outside" in failed.stdout

    # Derive exclusions on this loaded graph; never trust static graph edge IDs.
    associations = [
        {"id": "forward", "points": [[0, 0], [0, .02]], "expected_osm_way_ids": [10], "max_snap_distance_m": 1},
        {"id": "reverse", "points": [[0, .02], [0, 0]], "expected_osm_way_ids": [10], "max_snap_distance_m": 1},
    ]
    trials = [
        {"id": "forward_excluded", "anchors_from_association": "forward", "blocked_associations": ["forward"], "alternatives": True},
        {"id": "reverse_control", "points": [[0, .02], [0, 0]], "blocked_associations": ["forward"], "required_association": "reverse", "expected_osm_way_ids": [10]},
        {"id": "both_excluded", "anchors_from_association": "forward", "blocked_associations": ["forward"], "block_both_directions": True, "diagnose_anchors": True},
        {"id": "virtual_direction", "points": [[0, .002], [0, .018]], "blocked_associations": ["forward"]},
    ]
    for case in trials:
        case.update(max_snap_distance_m=1, max_visited_nodes=1000000)
    cases.write_text(json.dumps({"associations": associations, "cases": trials}))
    completed = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True, timeout=90)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    exclusion_report = json.loads(next(line.split(" ", 1)[1] for line in completed.stdout.splitlines()
                                       if line.startswith("VOYAGR_GH11_REGRESSION ")))
    assert exclusion_report["all_available_graph_checks_passed"] is True
    forward_key = exclusion_report["associations"][0]["candidates"][0]["directed_edge_keys"][0]
    reverse_key = exclusion_report["associations"][1]["candidates"][0]["directed_edge_keys"][0]
    assert forward_key ^ 1 == reverse_key
    for case in exclusion_report["cases"]:
        assert case["blocked_edge_keys"]
        for candidate in case["candidates"]:
            assert set(candidate["directed_edge_keys"]).isdisjoint(case["blocked_edge_keys"])
            assert candidate["forbidden_traversals"] == 0
    assert exclusion_report["cases"][0]["baseline_exercises_exclusion"] is True
    assert exclusion_report["cases"][1]["candidates"][0]["directed_edge_keys"] == [reverse_key]
    assert set(exclusion_report["cases"][2]["blocked_edge_keys"]) == {forward_key, reverse_key}
    for label in ("baseline_anchor_diagnostics", "anchor_diagnostics"):
        diagnostic = exclusion_report["cases"][2][label]
        assert "diagnostic_error" not in diagnostic
        assert diagnostic["original_node_identity_matches"] is True
        assert diagnostic["start_coordinate_error_m"] <= 1
        assert diagnostic["end_coordinate_error_m"] <= 1
        assert diagnostic["independent_start_snap"]["valid"] is True
        assert len(diagnostic["expected_start"]["neighbors"]) <= 12
        assert all("osm_way_id" in n for n in diagnostic["expected_start"]["neighbors"])
    assert before == {p.name: runner.digest(p) for p in graph.iterdir() if p.is_file()}
    # Reject unknown evidence and endpoint re-snapping; neither proves no route exists.
    cases.write_text(json.dumps({"associations": associations, "cases": [
        {"id": "unknown", "points": [[0, 0], [0, .02]], "blocked_associations": ["missing"]},
        {"id": "virtual_both", "points": [[0, .002], [0, .018]], "blocked_associations": ["forward"], "block_both_directions": True, "max_snap_distance_m": 1},
    ]}))
    failed = subprocess.run(command, cwd=tmp_path, capture_output=True, text=True, timeout=90)
    assert failed.returncode != 0
    refusal = json.loads(next(line.split(" ", 1)[1] for line in failed.stdout.splitlines()
                             if line.startswith("VOYAGR_GH11_REGRESSION ")))
    assert all(row["status"] == "UNVERIFIED_OR_FAILED" for row in refusal["cases"])
    assert "unverified association" in refusal["cases"][0]["reason"]
    assert all(not row.get("route_absence_proven", False) for row in refusal["cases"])
    assert before == {p.name: runner.digest(p) for p in graph.iterdir() if p.is_file()}
