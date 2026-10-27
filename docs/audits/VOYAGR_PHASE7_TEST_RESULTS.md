# Phase 7 — test results

Date: 2026-10-27. **PHASE7_PARTIALLY_VERIFIED — production NO-GO.** Latest main at start: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a`. Phase 6 PR #343 was open, CI green; Phase 7 branch `codex/phase7-directional-road-matching` includes its dependency commit `c5c67686541a7dcb30f3d82d5d24d1a2f2b27951`. Phase 7 changes are reviewed relative to that commit; inherited Phase 6 work is not newly implemented Kivy/native work. No Phase 7 Kivy/Android changes, VPS access, production configuration/data change, deployment or paid API call.

## Local validation

- Baseline before Phase 7: **662 Python +68 subtests**, **1,856 JavaScript /91 suites**, passed.
- Final Python CI selection including Phase 7: **702 passed +68 subtests**, **6.43 s**, no failures/skips.
- Additional provider/cache/PWA static and legacy speed-warning checks: **44 passed**, **0.58 s**, no failures/skips.
- Final Jest configured coverage: **1,890 passed /93 suites**, **3.795 s**, no failures/skips. Overall coverage: **82.95% statements /75.91% branches /82.21% functions /85.04% lines**. New matching module: **87.5% statements /79.13% branches /90.24% functions /100% lines**. All existing thresholds retained; new file included with its own floor.
- PostgreSQL session-policy migration: **11 passed**, **0.573 s**, isolated PostgreSQL; no production DSN.
- Test lint passed. Final whitespace and private-key/token pattern checks belong to the final commit/PR validation.
- All **20 new directional replay scenarios** pass in JS and Python; previous **16 Phase 6 replay scenarios** remain passing. These overlap suite totals above and are not additional independent test counts.

Commands: `.venv/bin/python -m pytest -q` with the file list in `.github/workflows/ci.yml`; `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`; `/tmp/voyagr-sql-tools/bin/python scripts/test-dashcam-session-sql.py`. Additional files: `test_graphhopper_costing_parity.py`, `test_graphhopper_hazard_parity.py`, `test_graphhopper_fallback.py`, `test_graphhopper_route_request.py`, `test_route_cache_key.py`, `test_pwa_index_and_sherpa_static.py`, and `test_pwa_phase2_features.py::TestSpeedWarnings`.

## Failure investigation and limits

A pre-fix regression reproduced old unsafe hazard CLEAR from untyped/stale road identity. Initial new-module collection failure was scaffolding, not old behavior evidence. Intermediate full Python runs exposed two Phase 5 synthetic hazard fixtures lacking new namespace/freshness requirements; the fixtures now provide those inputs and keep their original VIOLATED/NO_COMPLIANT_ROUTE/security assertions. Another targeted run exposed missing source coverage at tile boundaries; centred tiles and source-border guards resolve it. Invalid source structures, stale authority, incompatible transitions and reverse-oneway roundabouts have focused tests. A roundabout replay initially moved too far for its timestamp; its timeline was corrected rather than relaxing travel bounds. Final selections above pass without skips.

No live-engine, source/graph-backed real junction, real-road GPS, native audio, PWA real-device, Contabo API/deployment or production security acceptance was executed. Public authoritative fixture acquisition was blocked by HTTP 403; unavailable validation is NOT counted as passing. Kivy/native Android are excluded by task scope. Mocks replace browser/network/service boundaries only; shared fixture assertions call actual product matching and navigation modules. Complete historic repository tests include unrelated/live/desktop stacks and were not all run.

## GitHub and release

Phase 6 PR #343 remains a dependency unless separately merged. The operator enabled repository auto-merge during this task; GitHub reports `allow_auto_merge=true`, but `main.protected=false` and applicable branch rules `[]`. The integration cannot read classic protection details (403). Enabling auto-merge without a check gate could immediately merge an unchecked commit, so no protection bypass or direct merge is authorized by these findings. Require pull requests and the three CI statuses (Backend (pytest), Frontend (Jest + coverage), Dashcam session SQL policy) on main, then enable squash auto-merge. Hosted Phase 7 result and final PR URL are reported in the PR/final response after publication. Production remains NO-GO.
