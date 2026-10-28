# Phase 12B — Spatial Equivalence

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Predeclared acceptance policy

Policy was fixed before the dataset run: no coordinate rounding, no buffering/snap, exact GEOS set equality, zero symmetric-difference area, zero relative union-area difference, identical bounding boxes, no uncovered original component and no introduced area. A nonzero result is rejected, not accepted by adjusting thresholds after measurement. Diagnostic near-equivalence uses1e-10degree Hausdorff distance only to label near duplicates; it is not a removal/acceptance tolerance.

Original invalid MultiPolygon area cannot be naively summed because overlap/duplicates would double-count. The comparator independently unions every individually valid original member, without deduplication and in original order. It compares that reference with the candidate, normalizes ordering for deterministic metric evaluation, and checks each source member is covered. The repair and independent comparator therefore do not merely compare a candidate with itself.

GeoJSON is2D longitude/latitude EPSG4326. Set operations preserve the original RFC7946Cartesian lon/lat polygon representation. Area metrics are WGS84 ellipsoidal geodesic polygon areas via pyproj.Geod, exterior/interior orientation explicitly normalised; units are square metres, never square degrees. This defensible edge-area model is documented rather than presented as survey accuracy. No projection or coordinate quantization modifies candidate boundaries. Original unions and candidates use a common canonical boundary representation before meter-area accumulation.

## Measured result: all128 features pass

- Maximum symmetric-difference area:0 m².
- Maximum relative area difference:0.
- Original-reference intersection area equals reference/candidate union area for every feature.
- Every bbox is identical;0uncovered source components;0introduced area.
- Reference and candidate union holes match for every feature (0in this dataset).
- All properties and feature identities are unchanged.

All per-feature original-union/candidate/intersection/combined-union metre areas, symmetric differences, relative deltas, bounds, component coverage and hole counts are in feature_metrics.json. These128checks prove preservation of the source's geographic set representation, not real enforcement direction or installed graph-edge behavior. Valid holes are tested synthetically, including an island inside a hole and nesting: hole-count comparison is against the original UNION, not an invalid sum of members whose holes may be filled by other represented coverage.

The five benchmark runs, CLI --verify and configured repository regression reproduce the same candidate bytes/hash. GEOS and JTS both accept all128 candidate geometries. Original and candidate per-feature equivalence implies their global represented union is unchanged, without erasing distinct IDs. It does not establish that the original invalid geometry was interpreted by GraphHopper as that mathematical union.

## Cross-host numerical reporting

The first hosted check reproduced candidate bytes and manifest but found host-dependent absolute geodesic estimates in four area-report columns. An isolated Python3.11reproduction passed locally; bounded CI annotations identified the differing fields without printing geometry. Version2of the report serialises absolute area ESTIMATES to0.01m², a declared numerical reporting resolution rather than an acceptance tolerance. All set predicates, raw geodesic relative/symmetric differences, bounds and component coverage are checked before reporting, with unchanged zero acceptance thresholds. A new regression rejects a lost area smaller than0.01m². Coordinates and the candidate SHA are unchanged. Complete candidate, manifest and metric reproducibility assertions remain enabled; no assertion was relaxed or skipped.
