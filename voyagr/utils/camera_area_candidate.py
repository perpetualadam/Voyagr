"""Offline-only geometry union candidate. Never loaded automatically by routing.

All tolerances are fixed before generation: exact GEOS set equivalence and zero
geodesic symmetric-difference area; no snapping, buffering or coordinate rounding.
"""

from collections import Counter
from contextlib import contextmanager
import copy
import hashlib
import json
import math
import time

import pyproj
from pyproj import Geod
import shapely
from shapely import STRtree, normalize, orient_polygons, to_wkb
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union
from shapely.validation import explain_validity

VERSION = "phase12b-v1"
SOURCE_SHA = "65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f"
MAX_BYTES = 16 * 1024 * 1024
GEOD = Geod(ellps="WGS84")
PARAMETERS = {
    "operation": "per_feature_union_of_valid_components",
    "coordinate_crs": "EPSG:4326 longitude,latitude",
    "area_model": "WGS84 ellipsoidal geodesic edges; square metres",
    "symmetric_difference_tolerance_m2": 0,
    "relative_area_difference_tolerance": 0,
    "bbox_tolerance_degrees": 0,
    "coordinate_rounding": False,
    "buffering": False,
    "make_valid": False,
    "near_duplicate_diagnostic_degrees": 1e-10,
}


@contextmanager
def stage(timings, name):
    started = time.perf_counter()
    try:
        yield
    finally:
        if timings is not None:
            timings.setdefault(name, []).append((time.perf_counter() - started) * 1000)


def encode(value):
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n"
    ).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def area_m2(geometry):
    if geometry.is_empty:
        return 0.0
    return abs(
        GEOD.geometry_area_perimeter(orient_polygons(geometry, exterior_cw=False))[0]
    )


def holes(geometry):
    return sum(
        len(p.interiors)
        for p in (
            geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry]
        )
    )


def collection(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError("source_size_limit")
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        raise ValueError("invalid_json") from None
    if (
        not isinstance(data, dict)
        or data.get("type") != "FeatureCollection"
        or not isinstance(data.get("features"), list)
        or not 1 <= len(data["features"]) <= 1024
    ):
        raise ValueError("invalid_collection")
    seen = set()
    for f in data["features"]:
        if (
            not isinstance(f, dict)
            or f.get("type") != "Feature"
            or not isinstance(f.get("id"), str)
            or not f["id"]
            or f["id"] in seen
        ):
            raise ValueError("missing_or_duplicate_feature_id")
        seen.add(f["id"])
        if (
            not isinstance(f.get("properties"), dict)
            or not isinstance(f.get("geometry"), dict)
            or f["geometry"].get("type") != "MultiPolygon"
        ):
            raise ValueError("invalid_feature_contract")
        coords = f["geometry"].get("coordinates")
        if not isinstance(coords, list) or not 1 <= len(coords) <= 20000:
            raise ValueError("invalid_components")
        for polygon in coords:
            if not isinstance(polygon, list) or not polygon:
                raise ValueError("missing_polygon_rings")
            for ring in polygon:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError("unclosed_or_degenerate_ring")
                for point in ring:
                    if (
                        not isinstance(point, list)
                        or len(point) != 2
                        or not all(
                            isinstance(v, (int, float))
                            and not isinstance(v, bool)
                            and math.isfinite(v)
                            for v in point
                        )
                        or abs(point[0]) > 180
                        or abs(point[1]) >= 90
                    ):
                        raise ValueError("invalid_coordinate")
        geometry = shape(f["geometry"])
        if geometry.is_empty or any(
            p.is_empty or p.area <= 0 or not p.is_valid for p in geometry.geoms
        ):
            raise ValueError("invalid_source_component")
        if geometry.bounds[2] - geometry.bounds[0] >= 180:
            raise ValueError("unsupported_antimeridian_extent")
    return data


def diagnostics(parts):
    keys = [to_wkb(normalize(p), byte_order=1, output_dimension=2) for p in parts]
    counts = Counter(keys)
    result = {
        "exact_duplicate_components": sum(n - 1 for n in counts.values()),
        "positive_area_overlap_pairs": 0,
        "edge_touch_pairs": 0,
        "point_touch_pairs": 0,
        "nested_nonidentical_pairs": 0,
        "near_equivalent_nonidentical_pairs": 0,
        "topologically_equal_different_vertex_pairs": 0,
        "clockwise_exteriors": sum(not p.exterior.is_ccw for p in parts),
    }
    tree = STRtree(parts)
    epsilon = PARAMETERS["near_duplicate_diagnostic_degrees"]
    # STRtree indexes are stable integer positions in Shapely2. No component discarded on proximity.
    from shapely.geometry import box

    for i, p in enumerate(parts):
        a, b, c, d = p.bounds
        for j in tree.query(box(a - epsilon, b - epsilon, c + epsilon, d + epsilon)):
            if j <= i:
                continue
            q = parts[j]
            if (
                keys[i] != keys[j]
                and p.hausdorff_distance(q) <= epsilon
                and not p.equals(q)
            ):
                result["near_equivalent_nonidentical_pairs"] += 1
            if p.equals(q):
                if keys[i] != keys[j]:
                    result["topologically_equal_different_vertex_pairs"] += 1
            elif p.covers(q) or q.covers(p):
                result["nested_nonidentical_pairs"] += 1
            if p.intersects(q):
                intersection = p.intersection(q)
                if intersection.area > 0:
                    result["positive_area_overlap_pairs"] += 1
                elif intersection.length > 0:
                    result["edge_touch_pairs"] += 1
                else:
                    result["point_touch_pairs"] += 1
    # Exact normalized WKB duplicates are removed only after equality is established.
    unique = {}
    for key, p in zip(keys, parts):
        if key in unique and not unique[key].equals(p):
            raise ValueError("duplicate_equivalence_failed")
        unique.setdefault(key, p)
    return result, [unique[key] for key in sorted(unique)]


def validate_feature(source, candidate, timings=None):
    if {k: v for k, v in source.items() if k != "geometry"} != {
        k: v for k, v in candidate.items() if k != "geometry"
    }:
        raise ValueError("feature_metadata_changed")
    original = shape(source["geometry"])
    repaired = shape(candidate["geometry"])
    if (
        repaired.geom_type != "MultiPolygon"
        or repaired.is_empty
        or not repaired.is_valid
    ):
        raise ValueError("invalid_candidate_geometry")
    with stage(timings, "spatial_equivalence"):
        # Recompute from ALL original components, including duplicates and original ordering.
        reference = normalize(unary_union(list(original.geoms)))
        difference = reference.symmetric_difference(repaired)
        intersection = reference.intersection(repaired)
        combined = reference.union(repaired)
        old_area = area_m2(reference)
        new_area = area_m2(repaired)
        symmetric_area = area_m2(difference)
        relative = abs(new_area - old_area) / old_area if old_area else math.inf
        lost_components = sum(not repaired.covers(part) for part in original.geoms)
        added_area = area_m2(repaired.difference(reference))
        bounds_equal = reference.bounds == repaired.bounds
        hole_equal = holes(reference) == holes(repaired)
        accepted = (
            reference.equals(repaired)
            and difference.is_empty
            and symmetric_area == 0
            and relative == 0
            and bounds_equal
            and hole_equal
            and lost_components == 0
            and added_area == 0
        )
        if not accepted:
            raise ValueError("spatial_equivalence_failed")
        return {
            "feature_id": source["id"],
            "original_union_area_m2": old_area,
            "candidate_area_m2": new_area,
            "symmetric_difference_m2": symmetric_area,
            "intersection_area_m2": area_m2(intersection),
            "combined_union_area_m2": area_m2(combined),
            "relative_area_difference": relative,
            "original_union_bbox": list(reference.bounds),
            "candidate_bbox": list(repaired.bounds),
            "input_component_holes": holes(original),
            "reference_union_holes": holes(reference),
            "candidate_holes": holes(repaired),
            "lost_source_components": lost_components,
            "introduced_area_m2": added_area,
            "properties_preserved": True,
            "exact_set_equivalence": True,
            "coverage_preserved": "YES_GEOMETRIC_UNION_ONLY",
            "source_authority": "UNKNOWN",
        }


def build_candidate(raw, timings=None):
    with stage(timings, "loading"):
        data = collection(raw)
    output = copy.deepcopy(data)
    output["features"] = []
    metrics = []
    for f in sorted(data["features"], key=lambda f: f["id"]):
        original = shape(f["geometry"])
        parts = list(original.geoms)
        with stage(timings, "duplicate_and_overlap_detection"):
            report, unique = diagnostics(parts)
        with stage(timings, "union_repair"):
            repaired = (
                unary_union(unique) if not original.is_valid else MultiPolygon(unique)
            )
            if repaired.geom_type == "Polygon":
                repaired = MultiPolygon([repaired])
            if repaired.geom_type != "MultiPolygon":
                raise ValueError("unsupported_union_result")
            repaired = normalize(repaired)
        with stage(timings, "geos_validity"):
            if repaired.is_empty or not repaired.is_valid:
                raise ValueError("repair_not_valid")
        candidate = copy.deepcopy(f)
        candidate["geometry"] = mapping(repaired)
        check = validate_feature(f, candidate, timings)
        check.update(
            original_geometry_type=original.geom_type,
            original_components=len(parts),
            candidate_components=len(repaired.geoms),
            original_valid=original.is_valid,
            original_failure_category=explain_validity(original).split("[", 1)[0],
            candidate_valid=True,
            proposed_remediation=(
                "per_feature_union"
                if not original.is_valid
                else "canonicalize_valid_geometry"
            ),
            source_provenance_sufficient_for_physical_avoidance=False,
            **report
        )
        metrics.append(check)
        output["features"].append(candidate)
    with stage(timings, "serialization"):
        candidate_bytes = encode(output)
    manifest = {
        "version": VERSION,
        "source_sha256": digest(raw),
        "candidate_sha256": digest(candidate_bytes),
        "source_features": len(data["features"]),
        "candidate_features": len(output["features"]),
        "source_components": sum(m["original_components"] for m in metrics),
        "candidate_components": sum(m["candidate_components"] for m in metrics),
        "source_invalid_features": sum(not m["original_valid"] for m in metrics),
        "candidate_invalid_features": 0,
        "exact_duplicate_components_removed": sum(
            m["exact_duplicate_components"] for m in metrics
        ),
        "all_identities_and_properties_preserved": True,
        "all_features_exact_set_equivalent": True,
        "parameters": PARAMETERS,
        "libraries": {
            "shapely": shapely.__version__,
            "geos": shapely.geos_version_string,
            "pyproj": pyproj.__version__,
            "proj": pyproj.proj_version_str,
        },
        "source_camera_provenance": "UNKNOWN",
        "installed_original_identity": "OPERATOR_REPORTED_MATCH_NOT_REPROBED",
        "real_engine_enforcement": "NOT_TESTED",
        "production_release": "NO_GO",
    }
    return candidate_bytes, manifest, metrics
