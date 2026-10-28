# Phase 12B — Candidate Remediation

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Versioned output

Candidate: `artifacts/camera-areas/phase12b/camera_areas_candidate.geojson`.

|Metric|Original|Candidate|
|---|---:|---:|
|Features / unique IDs|128 /128|128 /128|
|Invalid MultiPolygons|102|0(GEOS and independent JTS)|
|Components|8301|6452|
|Exact duplicate components|106|0|
|Within-feature positive overlap pairs|1911|0|
|Bytes|1706076|1605873|

Original SHA256: `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`.
Candidate SHA256: `6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7`.

All128 IDs and complete non-geometry feature metadata/properties are preserved, including camera_count/grid_cell. The collection is ordered deterministically by ID; properties use canonical JSON key order. The candidate is committed with a deterministic manifest and per-feature metrics. It is not a runtime configuration selection or deployment artifact automatically consumed by Voyagr/GraphHopper.

## Algorithm and fail-closed rules

1. Bound input size/features/components; verify collection, feature IDs, properties, strict2D lon/lat coordinates, closed rings and individually valid/nonempty/nondegenerate polygon members. Reject duplicate IDs/conflicting records and unsupported/invalid components.
2. Normalize component ring/start/order representation and identify exact WKB duplicates. Verify GEOS equality before removing a duplicate geometry. Tolerance-near components are diagnosed only, never dropped. No physical camera record is deduplicated.
3. For invalid MultiPolygons, union valid components within that feature. For already valid features, retain the valid members and canonicalize their ordering. Never apply global union, buffer(0), make_valid, snapping or coordinate rounding. Wrap a Polygon union result as a MultiPolygon; reject collections/empty/invalid results.
4. Independently recompute a reference union from ALL original members, including duplicates and original order. Check exact set equality, all-member coverage, no introduced area, equal bounds and union-hole structure. Reject any unexplained difference under the predeclared zero-tolerance policy.
5. Serialize deterministically, preserve source hash, and produce pinned library/operation/source/candidate metadata. Source acquisition time/direction/road/section provenance stays UNKNOWN; no creation timestamp is substituted for acquisition truth.

Libraries: Shapely2.1.2 /GEOS3.13.1 and pyproj3.7.2 /PROJ9.5.1. Metric geometry is canonicalized before geodesic accumulation so component-order floating summation does not masquerade as coverage change; acceptance tolerances remain zero. Inputs with holes/nesting/touches have independent synthetic regressions. An actual8301-component reduction is not a reduction in the source8301 camera_count property total.

## Reproducible offline commands

Run only in an isolated review checkout, not a production service environment:

```sh
.venv/bin/python -m pip install -r requirements-geometry.txt
# Recompute all committed candidate/manifest/metrics bytes without writing:
.venv/bin/python scripts/repair-camera-areas.py --output-dir artifacts/camera-areas/phase12b --verify
# Fresh output in a separate empty review directory; existing outputs are refused:
PHASE12B_REVIEW_DIR=$(mktemp -d /tmp/voyagr-phase12b.XXXXXX)
.venv/bin/python scripts/repair-camera-areas.py --output-dir "$PHASE12B_REVIEW_DIR"
cmp "$PHASE12B_REVIEW_DIR/camera_areas_candidate.geojson" artifacts/camera-areas/phase12b/camera_areas_candidate.geojson
.venv/bin/python scripts/benchmark-phase12b-geometry.py --samples 5
# JARs must be pre-provisioned and SHA256-match the recorded parser manifest:
.venv/bin/python scripts/validate-phase12b-parser.py --jar-dir "$GH8_PARSER_JAR_DIR"
```

The repair CLI pins the source SHA, restricts writes to the versioned repository output or `/tmp`, refuses existing output files, checks protected original paths and rechecks source identity. It never regenerates `camera_areas.geojson`. The legacy in-place generator was inspected, not executed. Optional geometry dependencies are isolated in requirements-geometry.txt and CI; web runtime requirements are unchanged.
