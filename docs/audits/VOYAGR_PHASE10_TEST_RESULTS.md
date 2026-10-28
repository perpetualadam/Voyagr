# Phase 10 — Test Results

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## Executed validation

- Backend: exact .github/workflows/ci.yml web behavior selection, including new tests/test_phase10_routing.py: 815 passed, 68 subtests passed. Desktop/Kivy, custom-router and live-service suites outside the configured selection were not executed.
- JavaScript: npm run test:ci -- --maxWorkers=2: 99 suites, 1,924 tests passed. Coverage thresholds passed: statements82.93%, branches75.93%, functions82.26%, lines85.08%.
- Lint: npm run lint:tests passed, no tautological test files detected.
- Isolated SQL: scripts/test-dashcam-session-sql.py, temporary pgserver database: 11 passed. No production DSN.
- Python compilation and git diff --check passed.

Before behavior changes, six targeted Python and two JavaScript regressions failed; the additional UI evidence regression also failed before UI changes. Existing enrichment expectations were updated for the explicit GraphHopper-first product requirement and to distinguish proximity from unsupported-provider limitations; no mandatory assertions were relaxed. The final selection includes existing camera matching, source conflict, stale coverage, custom-model composition, capability cache/toll, fallback, detour, geometry/multi-stop, browser cancellation, request-generation and map-recovery tests. New fixtures do not certify real graph enforcement.

## Synthetic performance

Executed `.venv/bin/python scripts/benchmark-phase5-routing.py > docs/audits/VOYAGR_PHASE10_SYNTHETIC_ROUTING_PERFORMANCE.json` after Phase10 fixes. Actual Flask request hooks, synthetic route/hazard fixtures, mocked providers/acquisition/cache writes, in-memory default scoring; no network or browser rendering. Twenty measured request samples per case; extra memory-instrumented runs contribute to per-stage call counts. Nested stage times are not additive. Raw artifact includes every measured stage's sample count, median, p95 and maximum.

|Case|Request samples|Median ms|p95 ms|Max ms|
|---|---:|---:|---:|---:|
|single|20|1.827|2.198|3.763|
|three_stops|20|3.073|3.59|4.996|
|five_stops|20|4.077|4.596|5.32|
|alternatives|20|2.931|3.357|4.925|
|cached|20|1.711|2.135|28.085|
|failover|20|2.177|2.67|3.259|
|large_hazards|20|1150.156|2228.564|2250.989|

Large-hazard CPU assessment is a remaining performance risk. These measurements neither estimate Contabo latency nor establish hard deadline guarantees. GraphHopper metadata/custom-model/provider stage timers are present but this benchmark does not exercise real GraphHopper calls; no installed-engine distributions are available. Hosted CI status will be recorded on the PR; local results do not substitute for required hosted checks.
