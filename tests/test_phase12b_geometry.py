"""Geometry-only candidate and actual consumer regressions; no live engine claims."""

import copy
import json
from pathlib import Path
from unittest.mock import patch
import pytest


def test_loaded_inventory_cannot_be_reported_as_env137():
    from voyagr.services import hazards

    source = json.loads(
        (Path(__file__).parents[1] / "camera_areas.geojson").read_text()
    )
    with patch.object(hazards, "CAMERA_AREAS_DATA", source), patch.dict(
        "os.environ", {"GRAPHHOPPER_CAMERA_AREAS_COUNT": "137"}
    ):
        assert hazards.get_graphhopper_camera_areas_count() == 128
        model = hazards.build_graphhopper_camera_avoidance_model()
    assert "in_camera_area_127" in model["priority"][0]["if"]
    assert "in_camera_area_128" not in model["priority"][0]["if"]


from shapely.geometry import box, Polygon, MultiPolygon, mapping, shape
from voyagr.utils.camera_area_candidate import build_candidate, encode, validate_feature


def square(a=0, b=0, c=2, d=2):
    return box(-1 + a * 0.001, 53 + b * 0.001, -1 + c * 0.001, 53 + d * 0.001)


def feature(parts, identity="camera_area_0"):
    return {
        "type": "Feature",
        "id": identity,
        "properties": {
            "camera_count": len(parts),
            "grid_cell": "fixture",
            "extra": {"source": "UNKNOWN"},
        },
        "geometry": mapping(MultiPolygon(parts)),
    }


def build(features):
    return build_candidate(encode({"type": "FeatureCollection", "features": features}))


@pytest.mark.parametrize(
    "kind",
    [
        "duplicate",
        "overlap",
        "edge_touch",
        "point_touch",
        "nested",
        "hole",
        "hole_island",
    ],
)
def test_diagnosed_valid_component_unions_preserve_exact_coverage(kind):
    p = square()
    donut = Polygon(square(0, 0, 4, 4).exterior, [square(1, 1, 3, 3).exterior])
    parts = {
        "duplicate": [p, p],
        "overlap": [p, square(1, 0, 3, 2)],
        "edge_touch": [p, square(2, 0, 4, 2)],
        "point_touch": [p, square(2, 2, 4, 4)],
        "nested": [square(0, 0, 4, 4), square(1, 1, 2, 2)],
        "hole": [donut],
        "hole_island": [donut, square(1.5, 1.5, 2.5, 2.5)],
    }[kind]
    source = feature(parts)
    raw, manifest, metrics = build([source])
    candidate = json.loads(raw)["features"][0]
    g = shape(candidate["geometry"])
    m = metrics[0]
    assert g.is_valid and g.geom_type == "MultiPolygon"
    assert (
        candidate["id"] == source["id"]
        and candidate["properties"] == source["properties"]
    )
    assert (
        m["symmetric_difference_m2"]
        == m["relative_area_difference"]
        == m["introduced_area_m2"]
        == 0
    )
    assert m["lost_source_components"] == 0 and m["exact_set_equivalence"]
    assert all(g.covers(p) for p in parts)
    if kind == "duplicate":
        assert manifest["exact_duplicate_components_removed"] == 1 and len(g.geoms) == 1
    if kind == "edge_touch":
        assert m["edge_touch_pairs"] == 1 and len(g.geoms) == 1
    if kind == "point_touch":
        assert m["point_touch_pairs"] == 1 and len(g.geoms) == 2
    if kind in ("hole", "hole_island"):
        assert m["reference_union_holes"] == m["candidate_holes"] == 1
    if kind == "nested":
        assert m["nested_nonidentical_pairs"] == 1 and len(g.geoms) == 1


def test_near_equal_components_are_not_dropped_as_exact_duplicates():
    p = square()
    q = box(p.bounds[0] + 1e-11, p.bounds[1], p.bounds[2] + 1e-11, p.bounds[3])
    raw, manifest, metrics = build([feature([p, q])])
    assert manifest["exact_duplicate_components_removed"] == 0
    assert metrics[0]["near_equivalent_nonidentical_pairs"] == 1
    assert shape(json.loads(raw)["features"][0]["geometry"]).covers(q)


@pytest.mark.parametrize(
    "kind", ["bowtie", "empty", "missing_id", "duplicate_id_conflict", "unclosed_ring"]
)
def test_problematic_sources_are_rejected_not_silently_repaired(kind):
    source = feature([square()])
    if kind == "bowtie":
        source["geometry"]["coordinates"] = [
            [[[-1, 53], [-0.999, 53.001], [-1, 53.001], [-0.999, 53], [-1, 53]]]
        ]
    elif kind == "empty":
        source["geometry"]["coordinates"] = []
    elif kind == "missing_id":
        source.pop("id")
    elif kind == "unclosed_ring":
        source = json.loads(encode(source))
        source["geometry"]["coordinates"][0][0].pop()
    features = [source]
    if kind == "duplicate_id_conflict":
        duplicate = copy.deepcopy(source)
        duplicate["properties"]["camera_count"] = 99
        features.append(duplicate)
    with pytest.raises(ValueError):
        build(features)


def test_determinism_feature_component_order_and_hash_reproducibility():
    a = feature([square(), square(1, 0, 3, 2)], "camera_area_9")
    b = feature([square(5, 0, 6, 1)], "camera_area_2")
    first, manifest, _ = build([a, b])
    a["geometry"]["coordinates"] = tuple(reversed(a["geometry"]["coordinates"]))
    second, other, _ = build([b, a])
    assert first == second and manifest["candidate_sha256"] == other["candidate_sha256"]


def test_spatial_and_property_corruption_is_refused():
    source = feature([square()])
    raw, _, _ = build([source])
    candidate = json.loads(raw)["features"][0]
    wrong = copy.deepcopy(candidate)
    wrong["properties"]["camera_count"] = 99
    with pytest.raises(ValueError, match="metadata"):
        validate_feature(source, wrong)
    wrong = copy.deepcopy(candidate)
    wrong["geometry"] = mapping(MultiPolygon([square(0.1, 0.1, 1.9, 1.9)]))
    with pytest.raises(ValueError, match="equivalence"):
        validate_feature(source, wrong)


def test_geodesic_area_is_metres_not_square_degrees():
    _, _, metrics = build([feature([square()])])
    assert metrics[0]["candidate_area_m2"] > 10000
    assert square().area < 1e-5


def test_repository_candidate_reproduces_and_original_source_is_pinned():
    from voyagr.utils.camera_area_candidate import SOURCE_SHA, digest

    root = Path(__file__).parents[1]
    source = (root / "camera_areas.geojson").read_bytes()
    raw, manifest, metrics = build_candidate(source)
    assert digest(source) == SOURCE_SHA and len(metrics) == 128
    target = root / "artifacts/camera-areas/phase12b"
    assert raw == (target / "camera_areas_candidate.geojson").read_bytes()
    assert encode(manifest) == (target / "manifest.json").read_bytes()
    assert encode(metrics) == (target / "feature_metrics.json").read_bytes()
    assert (
        manifest["source_invalid_features"] == 102
        and manifest["candidate_invalid_features"] == 0
    )
    assert manifest["exact_duplicate_components_removed"] == 106
    assert all(
        not m["source_provenance_sufficient_for_physical_avoidance"] for m in metrics
    )


def test_no_local_inventory_retains_existing_explicit_count_fallback():
    from voyagr.services import hazards

    with patch.object(hazards, "CAMERA_AREAS_DATA", None), patch.dict(
        "os.environ", {"GRAPHHOPPER_CAMERA_AREAS_COUNT": "137"}
    ):
        assert hazards.get_graphhopper_camera_areas_count() == 137


def test_cli_refuses_existing_artifact_outputs_and_preserves_original():
    import subprocess, sys
    from voyagr.utils.camera_area_candidate import SOURCE_SHA, digest

    root = Path(__file__).parents[1]
    before = (root / "camera_areas.geojson").read_bytes()
    candidate = (
        root / "artifacts/camera-areas/phase12b/camera_areas_candidate.geojson"
    ).read_bytes()
    result = subprocess.run(
        [
            sys.executable,
            "scripts/repair-camera-areas.py",
            "--output-dir",
            "artifacts/camera-areas/phase12b",
        ],
        cwd=root,
        capture_output=True,
        timeout=30,
    )
    assert result.returncode == 1
    assert digest((root / "camera_areas.geojson").read_bytes()) == SOURCE_SHA
    assert before == (root / "camera_areas.geojson").read_bytes()
    assert (
        candidate
        == (
            root / "artifacts/camera-areas/phase12b/camera_areas_candidate.geojson"
        ).read_bytes()
    )


def test_candidate_model_composition_retains_ids_and_all_hard_blocks():
    from voyagr.services.hazards import merge_graphhopper_custom_model_parts

    root = Path(__file__).parents[1]
    candidate = json.loads(
        (
            root / "artifacts/camera-areas/phase12b/camera_areas_candidate.geojson"
        ).read_text()
    )
    model = {
        "areas": candidate,
        "priority": [
            {
                "if": " || ".join("in_" + f["id"] for f in candidate["features"]),
                "multiply_by": "0",
            }
        ],
    }
    # Force an inline collision through the actual composition helper.
    colliding = {
        "areas": {
            "type": "FeatureCollection",
            "features": [copy.deepcopy(candidate["features"][0])],
        },
        "priority": [
            {"if": "in_" + candidate["features"][0]["id"], "multiply_by": "0"}
        ],
    }
    combined = merge_graphhopper_custom_model_parts(model, colliding)
    ids = [f["id"] for f in combined["areas"]["features"]]
    assert len(ids) == len(set(ids)) == 129
    assert all(f["id"] in ids for f in candidate["features"])
    assert all(rule["multiply_by"] == "0" for rule in combined["priority"])
