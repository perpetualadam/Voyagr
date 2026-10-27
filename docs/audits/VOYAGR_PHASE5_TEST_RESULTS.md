# Phase 5 — test results

**PHASE5_PARTIALLY_VERIFIED; production NO-GO.** Date: 2026-10-27.

## Executed validation

| Selection | Passed | Failed | Skipped | Evidence |
|---|---:|---:|---:|---|
| Final Python CI file selection | 629 tests + 68 subtests | 0 | 0 | 6.21 s; real routing/geometry/HTTP/caching logic and existing security suites |
| Configured Jest CI | 1,828 tests / 90 suites | 0 | 0 | Includes 7 new Phase 5 browser-processing/cancellation cases |
| Additional offline GraphHopper/cache integration selection | 27 | 0 | 0 | See exact runner output; independent file selection, not added to CI unique total |
| PostgreSQL session policy | 11 | 0 | 0 | 0.612 s, isolated PostgreSQL, actual existing migration |
| Test lint | Passed | 0 | N/A | Existing tautological-test guard retained |
| Configured Jest coverage | Passed | 0 | N/A | 82.71% statements, 75.47% branches, 80.99% functions, 84.56% lines |
| Engine replay manifest | 0 live routing cases | 0 executed failures | Not executed | 36 engine/scenario cases NOT_TESTED; 3 unavailable local engines |

The new Python files contain 35 cases in total (29 journey/replay cases, 6 shared-budget cases), included in the CI total, not additional unique tests. Existing dashcam owner/session/capture/timer/rollback security regressions remain in the passing Python/Jest selections. No tests or coverage thresholds were disabled. PostgreSQL never targeted a production DSN.

Commands executed from `/workspace/Voyagr`:

- Python: extract file arguments from `.github/workflows/ci.yml`'s “Run Python behaviour tests” step and execute `.venv/bin/python -m pytest -q` with that exact list. The list now includes both Phase 5 Python files.
- `npm run lint:tests`
- `npm run test:ci -- --maxWorkers=2`
- `/tmp/voyagr-sql-tools/bin/python scripts/test-dashcam-session-sql.py`
- `.venv/bin/python scripts/replay-routing-engines.py`
- `.venv/bin/python scripts/benchmark-phase5-routing.py`
- `node scripts/benchmark-phase5-frontend.cjs`
- Additional offline integration: `tests/test_graphhopper_fallback.py`, `test_graphhopper_hazard_parity.py`, `test_graphhopper_costing_parity.py`, `test_graphhopper_route_request.py`, `test_route_cache_key.py` — 27 passed. Live helper scripts that perform network calls at import were inspected and not executed.
- Targeted geometry, parser, request-budget, browser journey and previous avoidance-integrity checks during implementation; these overlap final selections.

## Baseline and intermediate failures

Before Phase 5 edits: targeted Python 73 passed; existing avoidance-integrity Jest 21 passed. The first new geometry test run, before integration, had 13 failed / 3 passed, exposing missing complete summaries, invalid-leg acceptance, missing offsets/checksum binding and incomplete optimized fall-through. Subsequent failures included floating-point fixture construction (corrected by defining exact six-decimal source coordinates), an old formatter mock missing the newly core-produced summary fields (fixture updated; original output assertions retained), and an incorrect relative fixture import in the new Jest file (corrected). No failing assertion was weakened to force a merge.

The performance harness initially hit the application's actual per-IP rate limit after repeated samples. It now uses a distinct loopback client identity for each workload, retaining rate-limit enforcement and staying within each workload's allowance. This is benchmark isolation, not a production configuration change. No synthetic harness failure is counted as an application test pass.

## Deterministic integration matrix

| Case | Observed result |
|---|---|
| 2/3/5 stops and optimized order | Every visited leg in full summary, correct totals, final coordinate and global manoeuvre indices |
| Mixed polyline precision / GeoJSON formats / shared boundaries | Correct coordinate order and canonical polyline6; no duplicate shared endpoint |
| Missing, invalid, disconnected, reversed geometry / invalid index | INCOMPLETE_ROUTE or geometry gate rejection; no navigable partial journey |
| Camera on intermediate/final leg | Relevant leg VIOLATED, aggregate NO_COMPLIANT_ROUTE; no earlier clear-leg masking |
| Changed geometry with old assessment | Python and JS checksum agreement; changed route cannot start using old assessment |
| Cached first-leg summary with complete leg metadata | Actual Flask cache reassessment rejects partial geometry |
| Wrong destination / omitted or reversed visits | Incomplete route, no automatic selection |
| Normal, recovery, preference and alternate Valhalla parsers | Complete geometry and global indices retained for each separate route |
| Actual optimized Flask pipeline | Full summary and per-leg assessments survive serialization and HTTP boundary |
| Selected frontend journey / per-leg layer plans | Final leg present; no first-leg-only rendering plan |
| Intermediate/final arrival | First stop does not finish journey; final endpoint does |
| Multi-stop reroute | Remaining visits retained in established order; no reoptimization |
| Supersession / interrupted request / abort timeout | Old signal aborted and stale response still excluded; 35 s browser abort timer disposed |
| Shared provider budget / retry / rate limit | Remaining budget shrinks, expired attempts not sent, excessive backoff refused, late success returns HTTP 504 |
| Request isolation | An exhausted request budget is not inherited by another request |
| Unsupported restriction / unknown data / fallback / offline | Existing Phase 4 mandatory gates remain in passing regression selections |
| Replay oracle | Rejects remote/credentialed targets and catches a polygon crossed between vertices |

Provider responses, external acquisition and browser device boundaries are mocked where identified. Tests exercise real application functions, not a reimplementation of the selection/matching algorithm. The checked-in synthetic UK fixture is not surveyed road ground truth. MapLibre layer plans are tested, not actual GPU rendering. No road, vehicle, sensor, mobile battery or physical camera evidence is implied.

## Blocked/unrun

Real graph execution: 36 manifest cases unexecuted, with installed engine metadata absent. Desktop/Kivy and custom-router/live-server suites were not collected/executed; a precise total for these broad suites is not asserted. Kivy availability was checked and is false. Real-device GPS/offline/suspension/stop-transition/browser-rendering acceptance was not performed. They are not counted as passed or converted to mock engine passes.

Hosted CI status is reported in the completion message/PR. Local results above do not by themselves establish hosted checks, deployed enforcement or a production GO.
