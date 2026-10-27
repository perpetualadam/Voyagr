# Phase 9 — test evidence and remaining gates

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

## Baseline and reproduced defects

Before code changes, targeted Python source/navigation/integrity selection: **149 passed**, 1.17 s. Phase 8 main CI was independently confirmed successful. New regression run on baseline: **12 failed, 2 passed**. Six failures reproduced confirmed behavior defects (three contradictory-tag cases and three invalid device timestamps). Six failures were missing new source-state classifications; these were requirement gaps, not newly discovered navigation defects.

Root causes: OSM tag dictionary comprehension discarded contradictions; device validator checked timestamp text presence only. Minimal fixes use a shared conflict-detecting tag reader and timezone-aware past/present date validation. Fourteen focused tests cover both fixes, valid positive paths and required source-state distinctions. Targeted integrated evidence/matcher selection after changes: **74 passed**. Existing source freshness, mandatory avoidance, GPS confidence, dashcam auth/ownership and coverage thresholds remain intact. No major navigation algorithm changed.

## Final executed validation

| Check | Result | Scope |
|---|---|---|
| Python backend CI file selection | **736 passed +68 subtests**, 8.62 s | Includes new Phase 9 evidence suite, road matching, lane/speed, multi-stop, routing integrity, hazards and dashcam security |
| Additional Python provider/cache/PWA selection | **44 passed**, 0.95 s | Costing/hazard parity, fallback/request, cache keys, static PWA, speed warnings |
| Jest CI | **94 suites /1,901 tests passed**, 5.935 s | Actual modules/pipeline with mocked browser/service boundaries; no failures/skips |
| Test lint | PASS | No tautological files detected |
| Coverage thresholds | PASS | 82.93% statements /75.93% branches /82.26% functions /85.08% lines |
| Isolated PostgreSQL session policy | **11 passed**, 1.267 s | Temporary pgserver, no production DSN |
| Phase 7 synthetic GPS replay | **20 scenarios executed** | Also covered in Jest; not additional independent real-world tests |
| QC CLI missing/malformed file checks | Correct unavailable/conflicting state and nonzero exit | Offline negative-path checks |
| Device template validator | Expected exit 1 | 20 NOT_TESTED, no production-release authorisation |
| Loopback engine discovery/replay | 3 unavailable; **36 NOT_TESTED; 0 routing requests** | Not a passing graph replay suite |
| Whitespace | `git diff --check` PASS | No security/test assertions weakened |

Commands: `.venv/bin/python -m pytest -q` with every backend path in `.github/workflows/ci.yml`; `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`; `.venv/bin/python scripts/test-dashcam-session-sql.py`; `node scripts/replay-phase7.cjs`. Additional files: `test_graphhopper_costing_parity.py`, `test_graphhopper_hazard_parity.py`, `test_graphhopper_fallback.py`, `test_graphhopper_route_request.py`, `test_route_cache_key.py`, `test_pwa_index_and_sherpa_static.py`, `test_pwa_phase2_features.py::TestSpeedWarnings`. Raw engine/device/performance artifacts are committed alongside the reports. Test logs contain local execution details; no real service result is inferred.

## Unexecuted and blocked

Real UK extract acquisition, credible graph-backed matching fixtures, all 36 actual-engine combinations, all 20 physical-device cases, deployed dashcam acceptance and Contabo/network/device performance remain unexecuted for missing source/services/device/authorised test access. Full historical desktop/Kivy/native/custom-router/live-service suites are outside this PWA task and unrun, not silently counted as passing/skipped. No production credentials or network-policy changes were requested. Operator-run procedures stop at the explicit access/data boundary.

Decision: **PHASE9_PARTIALLY_VERIFIED**. Production remains **NO-GO**. Phase 10 should execute the handoff with a named infrastructure operator: bounded licensed exports and pinned engine graph/profile evidence first, then graph-backed replay and independently reviewed physical-device/offline/dashcam acceptance. Further synthetic expansion cannot close those gates.

## Exact intended file changes

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE9_DASHCAM_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE9_DEVICE_STATUS.json`
- `docs/audits/VOYAGR_PHASE9_ENGINE_DISCOVERY.json`
- `docs/audits/VOYAGR_PHASE9_ENGINE_REPLAY.md`
- `docs/audits/VOYAGR_PHASE9_OFFLINE_RECOVERY.md`
- `docs/audits/VOYAGR_PHASE9_PERFORMANCE.md`
- `docs/audits/VOYAGR_PHASE9_PERFORMANCE_FRONTEND.json`
- `docs/audits/VOYAGR_PHASE9_PERFORMANCE_JOURNEY_FRONTEND.json`
- `docs/audits/VOYAGR_PHASE9_PERFORMANCE_JOURNEY_PYTHON.json`
- `docs/audits/VOYAGR_PHASE9_PERFORMANCE_OFFLINE.json`
- `docs/audits/VOYAGR_PHASE9_PERFORMANCE_PYTHON.json`
- `docs/audits/VOYAGR_PHASE9_PWA_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE9_REAL_ROAD_EVIDENCE.md`
- `docs/audits/VOYAGR_PHASE9_ROAD_MATCHING.md`
- `docs/audits/VOYAGR_PHASE9_TEST_RESULTS.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `scripts/acquire-phase7-osm.py`
- `scripts/benchmark-phase9-offline.cjs`
- `scripts/export-phase8-road-evidence.py`
- `scripts/fixtures/phase9/fixture-area-requests.json`
- `scripts/validate-phase8-device-results.py`
- `scripts/validate-road-evidence.py`
- `tests/test_phase9_evidence.py`
- `voyagr/utils/road_evidence.py`

GitHub PR/check/merge results and final commit SHA are reported after publication; no merge is claimed by these pre-publication local results.
