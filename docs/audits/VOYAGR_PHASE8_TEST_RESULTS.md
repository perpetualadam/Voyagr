# Phase 8 — test evidence

Date: 2026-10-27. **PHASE8_PARTIALLY_VERIFIED — production NO-GO.** Integration baseline: latest main `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` plus existing Phase 6 `c5c67686` and Phase 7 `0701f4df`; these changes are not present on fetched main. PR refs #343/#344 still point to those commits; current PR state/rules cannot be read because GitHub API access returns HTTP 403. Phase 8 branch: `codex/phase8-evidence-and-pwa-acceptance`, based on `0701f4df`. No previous changes duplicated. No Contabo access, production configuration/database/graph/service mutation, deployment, paid API call, Kivy/native Android change or deployment automation change.

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

Git remote fetch/read works, but GitHub REST/GraphQL requests return 403 in this runtime. The environment draft lists api.github.com, but runtime diagnostics show current enforced spec revision 1 with an empty custom allowed-host list; the startup policy also lacks api.github.com. The saved draft and running policy differ. The operator has been shown Save draft/Publish instructions. No credential was requested or access restriction bypassed. PR creation, current earlier-PR state, ruleset verification, hosted CI and auto-merge must be retried only after access changes. Do not enable auto-merge until inherited Phase 6/7 dependencies are safely integrated and required statuses are verified. Final publication results are reported in the PR/final response. Production remains NO-GO.
