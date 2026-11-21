"""Pure adapter regressions: no engine download, network, DB or app import."""
import copy
import importlib.util
import os
from pathlib import Path

import pytest

from prototypes.graphhopper11.adapter import UnverifiedRoute, validate_paths


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
