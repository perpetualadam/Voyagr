# Phase 8 — test evidence

Date: 2026-10-27. **PHASE8_PARTIALLY_VERIFIED — production NO-GO.** Recovered from `070d0be5bbffd6091a601901a4827be3917db57e` onto main `4c1db05364ae7937136ed5fee94216c2298f26ee` on branch `codex/phase8-recovery`. GitHub API confirms Phase 6 PR #343 and Phase 7 PR #344 are merged. The source parent and current main have identical file trees; the recovery applies only Phase 8 changes and preserves existing fixes. GitHub API access is verified. Active main rules require Backend (pytest), Frontend (Jest + coverage), and Dashcam session SQL policy, with strict up-to-date checks and squash-only PR merges. No production access, configuration/data changes or deployment.

## Baseline and reproduced failures

Before Phase 8: **702 Python +68 subtests**, **1,890 Jest /93 suites**, passed. Initial new regressions against original code: **4 Python failures** (conflicting node coordinates, duplicate way identity, lost multi-via information, false no-route from HTTP 400) and **3 Jest failures** (future schema, contradictory node geometry, stale vehicle authority). Failures were captured before fixes. Later intermediate tests exposed two pre-existing synthetic parallel-road fixtures reusing the same node IDs at different coordinates: IDs were corrected, preserving the original matching/ambiguity assertions rather than disabling consistency checks.

## Final local validation

- Python CI selection, including `tests/test_phase8_evidence.py`: **722 passed +68 subtests**; 6.57 s, no failures/skips.
- Additional provider/cache/PWA checks: **44 passed**, 0.53 s, no failures/skips. These files are separate from the CI selection.
- Jest: **94 suites /1,901 tests passed**, 4.531 s, no failures/skips; test lint and every configured coverage threshold passed. Overall: **82.93% statements /75.93% branches /82.26% functions /85.08% lines**. All 36 prior synthetic GPS scenarios remain in these totals.
- PostgreSQL session-policy migration: **11 passed**, 0.596 s, isolated temporary server; no production DSN.
- Focused source/tool tests cover bounded reads/new-file writes, original source age, partial coverage/hazard uncertainty, malformed restrictions/geometry, remote/admin/credential rejection, proper no-route codes, all alternatives/ordered stops, default no-network replay, stale engine-version refusal and unexecuted device artifact classification.
- Final whitespace/security-pattern checks are recorded at commit/PR preparation. No test/security assertions or coverage thresholds were weakened.

Commands: `.venv/bin/python -m pytest -q` with the current backend list in `.github/workflows/ci.yml`; `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`; `/tmp/voyagr-sql-tools/bin/python scripts/test-dashcam-session-sql.py`. Extra Python files: GraphHopper costing/hazard/fallback/request, route cache key, PWA static checks and `test_pwa_phase2_features.py::TestSpeedWarnings`. A final static rerun after asset-version edits is a repeat of existing checks, not an additional independent count.

## Unexecuted and external limits

**REAL_ENGINE_EXECUTION_NOT_TESTED:** 36 combinations NOT_TESTED, 0 routing requests; loopback metadata unavailable. **REAL_DEVICE_ACCEPTANCE_NOT_TESTED:** 20 physical-device cases NOT_TESTED. No new authoritative real road data acquired; real-network matcher accuracy/confusion matrix NOT COMPUTED. No Contabo/deployed security acceptance or paid/public provider test executed. Full historical desktop/native/live-service tests are outside this PWA task and unrun. Unit XML/mock responses are not real sources/graph execution.

Recovery verification supersedes the original runtime access blocker: GitHub REST access and repository permissions are verified; active branch rules expose the three required CI gates. The classic branch-protection endpoint returns integration HTTP 403, but the effective branch-rules endpoint succeeds. Hosted CI and check-gated squash auto-merge are tracked in the recovery PR. Production remains NO-GO.

## Recovery validation on current main

Recovered `070d0be5` onto `4c1db053` with identical source-parent/main trees and no conflicts. Fresh local runs: **722 Python tests +68 subtests**, **44 additional Python tests**, **94 Jest suites /1,901 tests**, **11 isolated PostgreSQL policy tests** passed. Test lint, coverage thresholds and `git diff --check` passed. Python 3.12 / Node 24.19.0; hosted backend CI independently uses Python 3.11. Initial SQL startup was blocked by sandbox Unix-socket permissions; supported escalation allowed the temporary server and all tests passed. No test assertions, security gates or thresholds changed. Original performance artifacts remain historical measurements, not rerun timings. Real engines/devices and full desktop/native/live-service suites remain unrun.
