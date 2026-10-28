# Phase12F — Test results and changed files

**PHASE12F_PARTIALLY_VERIFIED. Production NO-GO for the candidate.** No production/lab access or deployment. No actual installed-engine requests were run here. User12D/12E observations remain attributed operator evidence; the five displacement magnitudes are synthetic regression inputs, not invented graph-backed fixtures.

## Evidence matrix

|Area|Local result|Real engine/device|
|---|---|---|
|Original-behaviour reproductions|7 failed before remediation; now PASS|Five displacements operator-reported|
|New origin HTTP/module regressions|59 PASS|NOT_TESTED|
|Configured Python web selection|1138 passed,68 subtests|Not engine acceptance|
|Jest/coverage|100 suites /1935 tests PASS, thresholds preserved|Not physical-device acceptance|
|Test lint|PASS|N/A|
|Temporary local PostgreSQL policy|11 PASS, no production DSN|N/A|
|Numerical continuity, GPS uncertainty, inside/boundary/outside, destination|PASS synthetic|NOT_TESTED|
|Native missing/malformed/contradictory/zero-length snaps|PASS synthetic, actual parser exercised|NOT_TESTED|
|Same/parallel/opposing/one-way/disconnected road labels|Cannot establish transition, PASS|Actual legality NOT_TESTED|
|Provider fallback and GraphHopper-first eligible selection|PASS HTTP + existing regressions|NOT_TESTED|
|Cache, intermediate stops, reroute, deadline, privacy|PASS actual application boundaries|NOT_TESTED|
|Browser selected alternative, manual/automatic gate, missing/stale/offline origin, fresh GPS change|PASS|NOT_TESTED|
|Dataset/graph unchanged|SHA and git PASS|No production probe|
|Actual boundary/no-path/road-edge/safe-exit connectivity|NOT_TESTED|NOT_TESTED|

Configured backend selection is the exact file list in the existing CI step plus `tests/test_phase12f_origin.py`. Existing Python/JavaScript/SQL assertions, coverage thresholds and required jobs are preserved. Three JS fixture files now establish independent origin preconditions for their existing avoidance/geometry/capability assertions. The legacy no-origin navigation expectation is tightened to require recalculation; the older HTTP parallel-road fallback test now requests the fallback's actual endpoints. No assertion is removed to conceal unsafe behaviour. Desktop/Kivy/custom-router/live-service selections outside configured web CI were NOT_EXECUTED; installed graph and physical-device acceptance were unavailable.

## Commands

```bash
# Exact file list from .github/workflows/ci.yml "Run Python behaviour tests":
.venv/bin/python -m pytest -q <configured-file-list>
.venv/bin/python -m pytest -q tests/test_phase12f_origin.py
npm run test:ci -- --maxWorkers=2
npm run lint:tests
.venv/bin/python scripts/test-dashcam-session-sql.py
.venv/bin/python scripts/benchmark-phase12f-origin.py
```

SQL uses isolated temporary PostgreSQL only. Performance JSON records executed offline n/median/p95/max; engine n=0. Existing required Backend (pytest), Frontend (Jest + coverage) and Dashcam session SQL policy remain. Hosted PR and merged-main CI status/SHA are reported by GitHub/final delivery, not predicted here. No protection bypass or automatic deployment is permitted.

## Complete changed-file inventory

29 files:

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE12F_OPERATOR_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE12F_ORIGIN_INTEGRITY_DESIGN.md`
- `docs/audits/VOYAGR_PHASE12F_PERFORMANCE.json`
- `docs/audits/VOYAGR_PHASE12F_PERFORMANCE.md`
- `docs/audits/VOYAGR_PHASE12F_RELEASE_READINESS.md`
- `docs/audits/VOYAGR_PHASE12F_ROOT_CAUSE.md`
- `docs/audits/VOYAGR_PHASE12F_TEST_RESULTS.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `scripts/benchmark-phase12f-origin.py`
- `static/js/__tests__/avoidance-integrity.test.js`
- `static/js/__tests__/graphhopper-capability-selection.test.js`
- `static/js/__tests__/origin-integrity.test.js`
- `static/js/__tests__/phase5-journey.test.js`
- `static/js/app/calculate-route-orchestration.js`
- `static/js/app/gps-orchestration.js`
- `static/js/app/navigation-lifecycle-orchestration.js`
- `static/js/app/reroute-map-orchestration.js`
- `static/js/modules/navigation/avoidance-integrity.js`
- `tests/test_phase12f_origin.py`
- `tests/test_routing_avoidance_integrity.py`
- `voyagr/services/routing/engines.py`
- `voyagr/services/routing/integrity.py`
- `voyagr/services/routing/integrity_api.py`
- `voyagr/services/routing/multidrop.py`
- `voyagr/services/routing/origin_integrity.py`
- `voyagr/services/routing/route_entries.py`
- `voyagr/utils/request_budget.py`
