# Phase 12B — Performance

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Scope and method

Executed scripts/benchmark-phase12b-geometry.py --samples5 against the actual repository source. Five local CPU samples per pipeline/stage, with a separate extra tracemalloc run. Per-stage numbers are totals over all128 features in a run. Loading includes structure/individual-component validation; duplicate detection includes overlap diagnostics; equivalence includes an independent all-original-member union and meter-area/set checks. Serialization includes candidate and auxiliary manifest/metrics encoding. Stages omit minor loop/copy overhead and their medians are not additive.

This is real offline file geometry processing, not synthetic route-provider latency and not Contabo performance. Concurrent local checks may affect timing. With n=5, p95is the maximum; no SLA inference is justified.

|Stage|n|Median ms|p95 ms|Max ms|
|---|---:|---:|---:|---:|
|pipeline|5|3951.576|5389.626|5389.626|
|loading|5|266.575|327.522|327.522|
|duplicate_and_overlap_detection|5|405.907|598.468|598.468|
|union_repair|5|320.465|429.864|429.864|
|geos_validity|5|14.183|23.497|23.497|
|spatial_equivalence|5|2182.504|3010.75|3010.75|
|serialization|5|39.799|41.427|41.427|

All5 sample hashes match. Candidate size1605873bytes. One extra run's peak Python-traced allocations:18057871bytes; GEOS/PROJ native allocations are not fully captured and this is not process RSS. Real-engine route-processing samples:0(N/A median/p95/max). Do not extrapolate local geometry costs to Contabo routing or resource limits. Raw distributions are in VOYAGR_PHASE12B_PERFORMANCE.json.
