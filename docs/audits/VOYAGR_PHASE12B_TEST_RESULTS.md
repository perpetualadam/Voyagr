# Phase 12B — Test Results

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Executed checks

- New count-precedence regression failed before the correction; it now passes.
- 21 targeted geometry/consumer/CLI tests pass. They cover duplicates, overlap, edge/point touch, nesting, holes/islands, Polygon union wrapping, invalid/empty/unclosed input, missing/duplicate-conflicting IDs, property/spatial tampering, exact equivalence, geodesic units, deterministic ordering/hash, actual repository candidate/manifest/metric reproduction, output refusal/source preservation, area collision/hard-block composition and missing-file fallback.
- Full configured backend selection:910 passed,68 subtests passed, including all existing GraphHopper/Valhalla/OSRM, mandatory/preferences, multi-stop, road/direction/freshness, Overpass/cache/deadline and PWA integrity regressions selected by CI.
- Frontend:99 Jest suites /1924 tests passed; existing coverage thresholds passed. Lint passed.
- Isolated SQL policy:11 passed on temporary local PostgreSQL, never a production DSN.
- Original SHA remains65038de... and point SHA2244bd...; neither file changed.
- CLI --verify, repository regression and five benchmark samples reproduce candidate6a397b... and complete metric/manifest bytes.
- Independent JTS candidate passes; original deliberately fails102 features. Official GH8parser passes128 candidate and140mixed areas. No real engine/graph/device claim.

Optional pinned geometry requirements are installed only in the backend CI/offline tool environment, not production web runtime requirements. Existing jobs/thresholds/assertions remain intact. Coverage statement/branch/function/line thresholds remain enforced by Jest. Desktop/Kivy/custom-router/live-service suites outside configured web selections were not executed. Missing graph-backed/no-route/installed expression tests are explicitly NOT_TESTED, not replaced by mocks or reported passing.

The source cannot contain its own future squash SHA/CI outcome; GitHub PR/final delivery records the final hosted required Backend, Frontend and SQL status and post-merge main CI. No protection bypass or automatic deployment is authorized.

## Complete changed-file inventory

28 files:

- `.github/workflows/ci.yml`
- `artifacts/camera-areas/phase12b/camera_areas_candidate.geojson`
- `artifacts/camera-areas/phase12b/feature_metrics.json`
- `artifacts/camera-areas/phase12b/manifest.json`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE12B_128_137_RECONCILIATION.md`
- `docs/audits/VOYAGR_PHASE12B_BASELINE_TOPOLOGY.json`
- `docs/audits/VOYAGR_PHASE12B_CAMERA_PROVENANCE.md`
- `docs/audits/VOYAGR_PHASE12B_CANDIDATE_JTS.json`
- `docs/audits/VOYAGR_PHASE12B_CANDIDATE_REMEDIATION.md`
- `docs/audits/VOYAGR_PHASE12B_CONTABO_OPERATOR_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE12B_ENGINE_STATUS.json`
- `docs/audits/VOYAGR_PHASE12B_GEOMETRY_ROOT_CAUSES.md`
- `docs/audits/VOYAGR_PHASE12B_GRAPHHOPPER_PARSER.json`
- `docs/audits/VOYAGR_PHASE12B_GRAPHHOPPER_VALIDATION.md`
- `docs/audits/VOYAGR_PHASE12B_PERFORMANCE.json`
- `docs/audits/VOYAGR_PHASE12B_PERFORMANCE.md`
- `docs/audits/VOYAGR_PHASE12B_SOURCE_DIAGNOSIS.json`
- `docs/audits/VOYAGR_PHASE12B_SPATIAL_EQUIVALENCE.md`
- `docs/audits/VOYAGR_PHASE12B_TEST_RESULTS.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `requirements-geometry.txt`
- `scripts/benchmark-phase12b-geometry.py`
- `scripts/repair-camera-areas.py`
- `scripts/validate-phase12b-parser.py`
- `tests/test_phase12b_geometry.py`
- `voyagr/services/hazards.py`
- `voyagr/utils/camera_area_candidate.py`
