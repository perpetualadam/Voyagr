# Voyagr audit test results

Actual runs in the local cloud machine, starting commit `4c44f4de7bcbd2dbcb5acf2247887f452835263f`; Python 3.12.14, Node 24.19.0. CI normally uses Python 3.11; that version was not separately validated here. No production requests or deployments.

| Run | Passed | Failed / blocked | Duration |
|---|---|---|---|
| Baseline exact Python CI file list | 397 tests + 61 subtests | 0 | 3.93s runner / 4.38s process |
| Baseline JavaScript CI | 85 suites / 1,771 tests | 0; 0 snapshots | 4.817s |
| Initial targeted auth/detector/route batch | 54 tests + 12 subtests | 0 | 1.69s |
| Initial privacy/admin batch | 27 tests | 0 | 0.45s |
| New deterministic GPS replay suite | 6 tests | Initially failed to import real orchestration due invalid increment expression; fixed and rerun passed | 1.266s final |
| Final expanded Python CI list | **494 tests + 68 subtests** | **0 failed, 0 skipped reported** | **5.59s runner / 6.18s process** |
| Final JavaScript CI | **86 suites / 1,777 tests** | **0 failed, 0 skipped reported; 0 snapshots** | **5.165s** |
| Additional security/dashcam/traffic/lane selection | 82 tests | Initially 2 traffic tests failed without Flask context; context fixture fixed; final 0 failed | 0.57s final |
| Desktop test_input_validation.py with initial extended selection | No tests completed in that invocation | Collection blocked: ModuleNotFoundError: kivy | 0.77s collection |
| npm audit | Not a test pass | 11 vulnerable package entries: 8 high, 1 moderate, 2 low | Not separately timed |
| pip-audit / PyPI | Not a test pass | 9 affected packages / 38 exact-ID-deduplicated package-advisory pairs | Not separately timed |
| pip check / git diff --check | Both passed | None | Not separately timed |

Rows overlap; do not add them into a unique-test total. Subtests are distinct from pytest test-case counts. Historical failed intermediate runs were corrected, never hidden by disabling assertions. A speed-limit fixture expected bare OSM `40` to mean 40mph; corrected to 25mph per OSM units. A GraphHopper exception fixture expected raw `boom`; changed to assert exception class and absence of private message. Privacy regression also caught an overlooked OSRM DEBUG URL; that raw URL logging was removed before the final passing run.

## Phase 2 validation update

Before Phase 2 source changes: 494 Python tests + 68 subtests passed in 5.70s; Jest 86 suites / 1,777 tests passed. After dashcam ownership changes: **538 passed + 68 subtests in 6.21s** (6.69s process), and **88 suites / 1,796 Jest tests passed in 3.665s**, no final failures/skips reported; existing coverage thresholds pass. A separate isolated PostgreSQL script passed **11 tests in 0.609s** against the actual new session-policy SQL. Additional overlapping PWA/index/schema/ownership smoke selection passed 62 tests in 1.05s. Detailed boundaries, migration prerequisites, changed tests and local-only/browser behavior are documented in [VOYAGR_DASHCAM_SECURITY_REMEDIATION.md](VOYAGR_DASHCAM_SECURITY_REMEDIATION.md). Hosted CI and production Supabase/GoTrue/device behavior are not claimed as verified. Original table above preserves Phase 1 evidence.

## Commands and reproducibility

Working directory: `/workspace/Voyagr`. Dependencies already installed via requirements-web and npm lockfile. Run:

```bash
npm run lint:tests
npm run test:ci -- --maxWorkers=2
.venv/bin/python -m pip check
```

For the exact Python selection, run `.venv/bin/python -m pytest -q` with all file paths in the backend “Run Python behaviour tests” step of `.github/workflows/ci.yml`. The workflow was expanded to retain the new admin/privacy/speed-limit and additional web-security tests. The file list is the source of truth, not `pytest tests/` (which includes desktop, custom graph and live-service scripts). The audit extracted that list with a regular expression and invoked subprocess directly, preserving the runner exit status.

Additional selection:

```bash
.venv/bin/python -m pytest -q tests/test_dashcam_service.py tests/test_dashcam_blueprint.py tests/test_page_dos_hardening.py tests/test_api_keys.py tests/test_traffic_tile_proxy.py tests/test_lane_recommendation.py
```

Dependency scanner used a separate `/tmp/voyagr-audit-tools` virtual environment, not application requirements; pip-audit targeted the application's installed site-packages with `--vulnerability-service pypi --cache-dir /workspace/.cache/pip-audit --format json`. No dependency auto-fix or insecure trust override used.

## Coverage

Jest final aggregate for configured instrumented files: statements 82.67%, branches 75.42%, functions 80.93%, lines 84.54%. All configured thresholds passed. This is scoped coverage (weather/camera/turn/voice/lane/reroute/speed/UI/maps helpers), not whole-application coverage. The new GPS helper is within the instrumented speed-gps file. No Python coverage percentage measured. No test uses a fake coverage percentage as readiness evidence.

## Functional/local evidence

- Real Flask handlers were exercised by test clients with deterministic mocked providers: request parsing, orchestration, recovery warning, caching, privacy and finite-coordinate rejection.
- A synthetic remote unauthenticated dashcam-list request returned HTTP 200 with the mocked synthetic record. This confirms handler authorization absence; no real recording was read. Remote trip history returned 401; unconfigured admin monitoring/cache returned 503.
- Browser GPS replay runs the actual watch callback for rejected samples and checks marker/freshness preservation. It does not emulate a real vehicle or demonstrate road matching.
- 69 browser orchestration/app files were checked using node --check. This alone missed the legacy call-expression increment issue; importing the actual module through Jest exposed it.

## Unrun and blocked

Full Python directory, Kivy/Android/device builds, Playwright browser projects, PostgreSQL/Supabase live RLS, Redis multi-worker behavior, production nginx/TLS/CORS, Stripe billing/webhook flow and paid provider APIs were not validated. Local Valhalla/GraphHopper graphs are not provisioned. No controlled driving, GPS tunnels/urban canyon trace, legal speed sign dataset, independent camera survey, mobile battery test or complete offline journey was executed. Some legacy detector tests may attempt Overpass and then fall back; no inference of successful live data from a passing fallback test.

No GO claim follows from these tests. Remaining failures/limitations are separated from the passing selected development suite.
