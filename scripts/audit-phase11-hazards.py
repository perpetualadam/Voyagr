#!/usr/bin/env python3
"""Read-only, coordinate-free summary of a bounded offline camera GeoJSON file.

Basic ring checks are not a topology validator, road association or provenance proof.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path

MAX_BYTES = 16 * 1024 * 1024
MAX_FEATURES = 100000


def finite_position(point):
    return (
        isinstance(point, list)
        and len(point) >= 2
        and all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
            for v in point[:2]
        )
        and abs(point[0]) <= 180
        and abs(point[1]) <= 90
    )


def read_collection(path):
    with Path(path).open("rb") as source:
        raw = source.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("input_size_limit")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        raise ValueError("invalid_json") from None
    if (
        not isinstance(data, dict)
        or data.get("type") != "FeatureCollection"
        or not isinstance(data.get("features"), list)
    ):
        raise ValueError("invalid_feature_collection")
    features = data["features"]
    if len(features) > MAX_FEATURES:
        raise ValueError("feature_limit")
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError("invalid_feature")
        if not isinstance(feature.get("properties") or {}, dict) or not isinstance(
            feature.get("geometry") or {}, dict
        ):
            raise ValueError("invalid_feature_fields")
    return raw, data


def summarize(path):
    raw, data = read_collection(path)
    features = data["features"]
    counts = Counter(
        {
            key: 0
            for key in [
                "feature_id_present",
                "reference_present",
                "source_present",
                "acquisition_time_present",
                "road_identity_present",
                "direction_present",
                "average_section_identity_present",
            ]
        }
    )
    types = Counter()
    ids = Counter()
    references = defaultdict(set)
    positions = defaultdict(list)
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError("invalid_feature")
        props = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        if not isinstance(props, dict) or not isinstance(geometry, dict):
            raise ValueError("invalid_feature_fields")
        kind = geometry.get("type")
        types[kind if kind in ("Point", "Polygon", "MultiPolygon") else "OTHER"] += 1
        if feature.get("id") is not None:
            ids[json.dumps(feature["id"], sort_keys=True)] += 1
            counts["feature_id_present"] += 1
        for label, fields in {
            "source": ("source", "provenance"),
            "acquisition_time": ("retrieved_at", "observed_at_ms"),
            "road_identity": ("osm_way_id", "road_id", "graph_edge_id"),
            "direction": ("direction", "directionality", "travel_bearing_deg"),
            "average_section_identity": ("section_id", "average_speed_section_id"),
        }.items():
            if any(props.get(field) is not None for field in fields):
                counts[label + "_present"] += 1
        coords = geometry.get("coordinates")
        if kind == "Point":
            if not finite_position(coords):
                counts["invalid_positions"] += 1
                continue
            point = tuple(coords[:2])
            positions[point].append(props)
            if props.get("reference") not in (None, ""):
                references[str(props["reference"])].add(point)
                counts["reference_present"] += 1
        elif kind in ("Polygon", "MultiPolygon"):
            polygons = [coords] if kind == "Polygon" else coords
            if not isinstance(polygons, list):
                counts["invalid_polygon_structures"] += 1
                continue
            counts["polygon_components"] += len(polygons)
            if isinstance(props.get("camera_count"), int):
                counts["declared_camera_count"] += props["camera_count"]
            for polygon in polygons:
                if not isinstance(polygon, list) or not polygon:
                    counts["invalid_polygon_structures"] += 1
                    continue
                for ring in polygon:
                    if (
                        not isinstance(ring, list)
                        or len(ring) < 4
                        or not all(finite_position(point) for point in ring)
                    ):
                        counts["invalid_rings"] += 1
                    elif ring[0][:2] != ring[-1][:2]:
                        counts["unclosed_rings"] += 1
    counts["duplicate_feature_ids"] = sum(n - 1 for n in ids.values() if n > 1)
    counts["duplicate_point_positions"] = sum(
        len(records) - 1 for records in positions.values() if len(records) > 1
    )
    counts["colocated_distinct_records"] = sum(
        len({json.dumps(p, sort_keys=True) for p in records}) > 1
        for records in positions.values()
    )
    counts["reference_ids_at_multiple_positions"] = sum(
        len(points) > 1 for points in references.values()
    )
    # Exact property disagreement is only a candidate conflict; colocated devices can be legitimate.
    counts["colocated_different_type_candidates"] = sum(
        len({str(p.get("type")) for p in records}) > 1 for records in positions.values()
    )
    return {
        "scope": "offline_repository_or_operator_supplied_file_only",
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "features": len(features),
        "geometry_types": dict(types),
        "counts": dict(counts),
        "topology_validation": "NOT_TESTED_USE_JTS",
        "source_identity": "UNVERIFIED",
        "acquisition_time": "UNKNOWN",
        "road_association": "NOT_TESTED",
        "installed_file_identity": "NOT_TESTED",
    }


def compare_square_centers(areas_path, points_path):
    _, areas = read_collection(areas_path)
    _, points = read_collection(points_path)
    centers = Counter()
    positions = Counter()
    skipped = 0
    for feature in areas["features"]:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "MultiPolygon":
            skipped += 1
            continue
        if not isinstance(geometry.get("coordinates"), list):
            skipped += 1
            continue
        for polygon in geometry["coordinates"]:
            ring = polygon[0] if isinstance(polygon, list) and len(polygon) == 1 else []
            if (
                not isinstance(ring, list)
                or len(ring) != 5
                or not all(finite_position(p) for p in ring)
                or ring[0] != ring[-1]
                or ring[0][1] != ring[1][1]
                or ring[1][0] != ring[2][0]
                or ring[2][1] != ring[3][1]
                or ring[3][0] != ring[0][0]
            ):
                skipped += 1
                continue
            centers[tuple(round((ring[0][i] + ring[2][i]) / 2, 8) for i in (0, 1))] += 1
    for feature in points["features"]:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Point" and finite_position(
            geometry.get("coordinates")
        ):
            positions[tuple(round(v, 8) for v in geometry["coordinates"][:2])] += 1
    return {
        "scope": "offline_content_correspondence_not_provenance",
        "numeric_quantization_decimals": 8,
        "matched_component_positions": sum((centers & positions).values()),
        "unmatched_component_positions": sum((centers - positions).values()),
        "unmatched_point_positions": sum((positions - centers).values()),
        "unrecognized_area_components": skipped,
        "installed_file_identity": "NOT_TESTED",
        "independent_source_authenticity": "NOT_TESTED",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--compare-points", type=Path)
    args = parser.parse_args()
    try:
        result = (
            compare_square_centers(args.input, args.compare_points)
            if args.compare_points
            else summarize(args.input)
        )
    except (ValueError, OSError) as error:
        result = {"status": "FAIL", "error_type": type(error).__name__}
        print(json.dumps(result))
        raise SystemExit(1)
    print(json.dumps(result, indent=2))
