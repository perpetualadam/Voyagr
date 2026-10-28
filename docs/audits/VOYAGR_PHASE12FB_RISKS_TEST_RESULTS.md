# Phase12F-B — Risks, test results and inventory

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** Controlled operator acceptance tooling is ready subject to reviewed real captures, matching graph receipts and an approved isolated environment. Real acceptance is not complete.

## Exact executed checks

- Before correction:3 malformed-evidence regressions failed,2 already passed. Empty MultiPolygon, malformed outside hole and deleted invalid CAZ vertex now preserve UNKNOWN.
- Configured Python web/backend selection: **1158 passed,68 subtests**;20 new12FB cases. Existing12F origin/provider/multi-stop/deadline/cache tests remain intact.
- Jest: **100 suites /1935 tests passed**, existing coverage thresholds preserved. Shipped browser gate is additionally executed via Node in five-case synthetic replay.
- Test lint: PASS.
- Temporary local PostgreSQL policy: **11 passed**, no production DSN.
- Synthetic five-case protocol: production assessors, stale memory/persistent cache ingress and manual/automatic browser refusal PASS. No engine calls; source label SYNTHETIC_ONLY.
- Independent GEOS oracle:100 synthetic polygon points, holes/union and explicit boundary band PASS.16 bounded concurrent request-local contexts PASS. Preparation/query budget expiry and total/per-polygon ring size limits PASS.
- Default recorded-replay artifact:five NOT_TESTED rows, no supplied captures and live engine NOT_TESTED.
- Performance:25 baseline/current offline samples per numeric/large/multi-stop/cache-like/recalculation case;16 each at four bounded local threads. JSON records n/median/p95/max. Engine n=0.
- Source/candidate files remain unchanged with expected SHA256; no graph/profile/config/runtime deployment changes.

Reproduce configured file list from `.github/workflows/ci.yml` using `.venv/bin/python -m pytest -q`; then `npm run test:ci -- --maxWorkers=2`, `npm run lint:tests`, `.venv/bin/python scripts/test-dashcam-session-sql.py`. New file is `tests/test_phase12fb_acceptance.py`. Replay and benchmark commands are in the operator/performance reports. No assertions/coverage thresholds/required jobs were weakened. Desktop/Kivy/custom-router/live-service selections outside configured web CI were NOT_EXECUTED.

Hosted Backend (pytest), Frontend (Jest + coverage), SQL required checks and protected squash/main CI outcomes are recorded on GitHub and in final delivery. Initial fetch/API access failed401; configured access subsequently worked and latest main was fetched before delivery. No credentials were exposed or interactive login attempted. No production/lab requests occurred.

## Outstanding risks

Raw12E native captures, real five-case replay, installed graph/import binding, partial-edge/boundary/no-path semantics, legal safe-exit/directional connectivity,2m false-positive rejection rates, moving-device GPS/lifecycle, deployed cache/service-worker skew, sustained multiworker resources and camera-source direction/freshness/provenance remain unverified.128 area groups do not automatically equal137 sections. Structural ring validation/envelopes do not establish arbitrary topology/source completeness. User-reported12D regional equality/128 accepted expressions support scoped compatibility only. No global speed/accuracy or nationwide avoidance claim.

The candidate dataset and compatible imported graph are a matched pair. Rollout/rollback requires separate operator approval and paired identity/backup/config review; GeoJSON-only replacement against the original graph is not an acceptable proposal. No safe-exit exception, tolerance increase, GraphHopper demotion or mandatory-policy weakening is introduced.

## Complete changed-file inventory

22 files:

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE12FB_BOUNDARY_NO_ROUTE.md`
- `docs/audits/VOYAGR_PHASE12FB_CONTABO_OPERATOR.md`
- `docs/audits/VOYAGR_PHASE12FB_DEPLOYMENT_ROLLBACK.md`
- `docs/audits/VOYAGR_PHASE12FB_FALLBACK_CACHE.md`
- `docs/audits/VOYAGR_PHASE12FB_FIVE_FIXTURE_REPLAY.md`
- `docs/audits/VOYAGR_PHASE12FB_GPS_TOLERANCE.md`
- `docs/audits/VOYAGR_PHASE12FB_ORIGIN_ACCEPTANCE_MATRIX.md`
- `docs/audits/VOYAGR_PHASE12FB_PERFORMANCE.json`
- `docs/audits/VOYAGR_PHASE12FB_PERFORMANCE.md`
- `docs/audits/VOYAGR_PHASE12FB_REPLAY_RESULTS.json`
- `docs/audits/VOYAGR_PHASE12FB_RISKS_TEST_RESULTS.md`
- `docs/audits/VOYAGR_PHASE12FB_ROOT_CAUSE_CODE_PATHS.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `scripts/benchmark-phase12fb-origin.py`
- `scripts/fixtures/phase12fb/acceptance-plan.json`
- `scripts/fixtures/phase12fb/recorded-bundle-template.json`
- `scripts/replay-phase12fb-origin.py`
- `tests/test_phase12fb_acceptance.py`
- `voyagr/services/routing/origin_integrity.py`
- `voyagr/utils/origin_replay.py`
