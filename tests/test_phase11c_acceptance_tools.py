"""Offline audit-tool safety: no production input, network, or road-truth claims."""

import importlib.util
import json
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location(
    "hazard_qc", Path(__file__).parents[1] / "scripts/audit-phase11-hazards.py"
)
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)


def write(tmp_path, features, name="fixture.json"):
    path = tmp_path / name
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path


def point(reference):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [1.25, 2.5]},
        "properties": {"reference": reference, "type": "speed_camera"},
    }


def test_colocated_records_remain_candidates_not_confirmed_encounters(tmp_path):
    result = qc.summarize(write(tmp_path, [point("one"), point("two")]))
    assert result["counts"]["duplicate_point_positions"] == 1
    assert result["counts"]["colocated_distinct_records"] == 1
    assert result["counts"]["source_present"] == 0
    assert (
        result["road_association"] == "NOT_TESTED"
        and result["source_identity"] == "UNVERIFIED"
    )
    assert "1.25" not in json.dumps(result) and "2.5" not in json.dumps(result)


def test_basic_ring_check_does_not_claim_full_topology_validation(tmp_path):
    result = qc.summarize(
        write(
            tmp_path,
            [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1]]],
                    },
                }
            ],
        )
    )
    assert result["counts"]["unclosed_rings"] == 1
    assert result["topology_validation"] == "NOT_TESTED_USE_JTS"


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"type": "FeatureCollection", "features": [None]},
        {"type": "FeatureCollection", "features": {}},
    ],
)
def test_malformed_collections_fail_closed(tmp_path, data):
    path = tmp_path / "malformed.json"
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        qc.summarize(path)


def test_oversized_input_is_refused(tmp_path, monkeypatch):
    path = write(tmp_path, [point("one")])
    monkeypatch.setattr(qc, "MAX_BYTES", 8)
    with pytest.raises(ValueError, match="input_size_limit"):
        qc.summarize(path)


def test_content_correspondence_is_not_source_authentication(tmp_path):
    ring = [[1, 2], [1.5, 2], [1.5, 3], [1, 3], [1, 2]]
    areas = write(
        tmp_path,
        [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "MultiPolygon", "coordinates": [[ring]]},
            }
        ],
        "areas.json",
    )
    points = write(tmp_path, [point("one")], "points.json")
    result = qc.compare_square_centers(areas, points)
    assert result["matched_component_positions"] == 1
    assert (
        result["unmatched_point_positions"]
        == result["unmatched_component_positions"]
        == 0
    )
    assert result["independent_source_authenticity"] == "NOT_TESTED"
    assert result["installed_file_identity"] == "NOT_TESTED"
