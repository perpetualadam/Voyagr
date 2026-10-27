# Voyagr final technical report

Audit date: 2026-10-27. Baseline commit: `4c44f4de7bcbd2dbcb5acf2247887f452835263f`.

## Phase 2 update — secure dashcam ownership

The former dashcam P0 code defect is remediated: all dashcam endpoints require an existing Supabase user JWT plus an online own-session check; SQLite queries/files/sessions/metadata/settings/retention are owner-scoped; NULL-owned legacy recordings remain quarantined. Browser capture/upload/playback/download use authenticated requests, account-switch guards and network-only media handling; anonymous capture is explicitly device-only. No production data/configuration or deployment was changed.

Final Phase 2 results: **538 Python tests + 68 subtests**, **1,796 Jest tests across 88 suites**, and **11 isolated PostgreSQL policy tests**, all passed; no final selected-run failures/skips. The original audit's counts below remain historical baseline evidence. New implementation, endpoint inventory, file list, migrations and remaining limits: [VOYAGR_DASHCAM_SECURITY_REMEDIATION.md](VOYAGR_DASHCAM_SECURITY_REMEDIATION.md).

Application-code remediation is complete for this blocker, but the SQL function must be applied/reviewed and deployed GoTrue revocation/proxy/storage protections verified before public exposure. Overall status remains **NO-GO** for separate lane/limit/avoidance/device-validation concerns and pending security deployment acceptance.

## Phase 4 update — routing avoidance integrity

**PARTIALLY_VERIFIED; overall production NO-GO.** The active Flask/PWA now uses a canonical mandatory/preference contract, independently evaluates every returned alternative and multidrop leg, revalidates cached results and refuses automatic selection when mandatory constraints are violated, unsupported or unverified. Manual acceptance preserves the unresolved status. Shared request ordering/preferences prevent stale calculation/reroute decisions. Segment scoring fixes missed mid-route hazards; OSRM precision, legacy Valhalla geometry/units and configured driving-only OSRM fallback handling are corrected.

Final local validation: **594 Python tests + 68 subtests**, **1,821 Jest tests / 89 suites**, and **11 isolated PostgreSQL policy tests**, all passed; no final selected failures/skips. Test lint and configured coverage thresholds passed (82.71% statements, 75.47% branches, 80.99% functions, 84.56% lines). Three-alternative synthetic evaluator medians: **7.197/16.188/111.211 ms** for 100/1,000/10,000 hazard records; peak traced allocation up to 2.839 MiB. These are software/synthetic checks, not live road or mobile measurements.

Installed engine capabilities, trustworthy camera/road/zone coverage, desktop direct-provider parity, full multidrop journey geometry and real-device acceptance remain open. Mandatory CAZ/congestion and incomplete camera evidence honestly remain unresolved; a successful engine option is not proof. No live configuration, production data or deployment changed. Full data flow, matrix, evidence, fixture outcomes and remaining gates: [VOYAGR_ROUTING_AVOIDANCE_INTEGRITY.md](VOYAGR_ROUTING_AVOIDANCE_INTEGRITY.md). Earlier audit sections below are historical findings; this update supersedes their statements that Flask/PWA compliance gating is wholly unimplemented.

## Phase 5 update — complete journeys and provider evidence

**PHASE5_PARTIALLY_VERIFIED; overall production NO-GO.** Phase 4 PR #340 was normally squash-merged after all checks passed; Phase 5 starts from verified main `8010165282c60aaa5ba9e0f8f6518a1356ee5448`. Multi-stop summaries now include every leg; recovery/preference/alternate parsers also stitch complete shapes and global manoeuvre indices. Missing/disconnected/mismatched geometry fails safely. Selected assessments bind to geometry, cached partial summaries are rejected, and reroutes retain outstanding stops in order. Round-trip destination metadata is corrected. Existing mandatory gates and dashcam protections remain.

A shared 30 s cooperative request budget covers route/hazard HTTP retries and backoff; browser routing fetches support supersession cancellation and a 35 s abort timeout. These are not hard wall-clock/socket preemption, and client abort does not establish server cancellation. Local graph discovery failed for all three providers; installed versions/profiles/graph restrictions remain unknown and all 36 replay cases are unexecuted (**REAL_ENGINE_EXECUTION_NOT_TESTED**). Loopback-only replay tooling/fixture manifest is provided; production/public/paid provider services were not probed.

Final local checks: **629 Python + 68 subtests**, **1,828 Jest / 90 suites**, **11 isolated PostgreSQL policy tests** passed, no final selected failures/skips; test lint and configured coverage thresholds passed. Additional offline provider/cache checks are reported separately. Full synthetic Flask medians were 1.851 ms single / 3.331 ms three stops / 4.197 ms five stops / 0.893 ms cached / 1.519 ms failover; 10,000 hazards cost 1,412.071 ms median and 1,671.260 ms maximum. Real engine/network/browser rendering and device latency remain unmeasured. No production data/configuration/deployment changed.

Full findings, capability matrix, before/after, measurements and remaining gates: [engine validation](VOYAGR_PHASE5_ROUTING_ENGINE_VALIDATION.md), [multi-stop geometry](VOYAGR_MULTISTOP_GEOMETRY_REMEDIATION.md), [latency report](VOYAGR_ROUTING_LATENCY_REPORT.md), [test results](VOYAGR_PHASE5_TEST_RESULTS.md). This update supersedes earlier historical findings that full multi-stop geometry and cooperative request budgeting are wholly unimplemented. Graph-backed enforcement, trustworthy road/hazard evidence, desktop parity, offline stop-state persistence and real-device acceptance remain open.

## A. Executive summary

Voyagr has a substantial modular Flask/PWA test foundation and working local web development workflow. Confirmed privacy, admin access, cache, GPS, speed-unit and input-validation defects received narrow fixes. Broad feature documentation overstates evidence for offline navigation, lane accuracy and guaranteed camera avoidance. The Phase 2 dashcam ownership patch addresses public application-level access; deployed security acceptance and remaining navigation safety gaps prevent public-release approval. This review inventories the repository and traces major active flows; it is not proof that every historical file or deployed component is defect-free.

## B. Architecture assessment

Legacy `satnav.py` combines Kivy UI, GPS, desktop lane/voice/hazard integrations and SQLite. `voyagr_web.py` hosts Flask and the main route handler; blueprints and routing/cost/hazard/model helpers supply most services. Browser `voyagr-app.js` binds shared state into orchestration modules; `route-selection.js` handles route presentation, GPS orchestration drives tracking/rerouting, speed-gps provides filtering/plans. Provider routing mixes Valhalla and camera-oriented GraphHopper, then reduced-payload recovery and public OSRM. Nominatim/Overpass/TomTom supply external data; SQLite caches/trips and Supabase auth/profile storage have different trust boundaries. Full details: baseline, routing and security reports; 122-rule file/line inventory in VOYAGR_ROUTE_INVENTORY.json.

## C. Confirmed defects and evidence

Line references below are current patched source unless explicitly labeled baseline.

| Severity / ID | Files and functions | Evidence / consequence | State |
|---|---|---|---|
| P0 SEC-03 (original finding) | `dashcam_blueprint.py` and related service/browser code | Original anonymous shared-recording access is now guarded by JWT/session verification and owner SQL/file checks | Remediated in Phase 2 code; live deployment/migration acceptance pending |
| P1 SEC-01 | `voyagr_web.py:1209` calculate_route; baseline :1227/:1229; hazards/engines logging | Exact body/endpoints/cache keys/OSRM URL and provider errors could expose journey data | Targeted paths fixed/tested; whole-app retention/logging open |
| P1 SEC-02 | `voyagr/utils/admin_auth.py:38` check_admin_request | Missing secret previously bypassed all shared privileged gates | Fixed/tested, 503 unconfigured / 401 invalid |
| P1 NAV-01 | `voyagr_web.py:1363` calculate_route cache block | Unknown legacy avoidance provenance reused after keyed miss | Fixed/tested by requiring new computation |
| P1 NAV-02 | `voyagr_web.py:2087` recovery response | Reduced payload success omitted limitation flag | Degraded flag/warning added and tested; hard enforcement remains open |
| P1 GPS-01 | `static/js/app/gps-orchestration.js:841`; `speed-gps.js:1102` validateNavigationGpsFix | Unchecked old/inaccurate/invalid fixes refreshed active state | Fixed for browser watch ingress, six replay tests |
| P1 GPS-02 | `gps-orchestration.js:1393` applyRouteDeviationFromApplyPlan | Increment of getter call cannot update state and can throw on reroute | Replaced with state setter; real module imports and replay suite pass |
| P1 SPEED-01 | `speed_limit_detector.py:266` _parse_osm_maxspeed_to_mph | Bare OSM km/h incorrectly treated as mph in UK/US | Fixed/tested |
| P1 lane | `lane_guidance.py:89,147`; `voyagr/api/navigation.py:138`; JS lane defaults :23 | Heading-derived occupancy and invented fallback counts can yield unsupported advice | Open, requires provenance/unknown contract and UK fixtures |
| P1 speed | `speed_limit_detector.py:335,1059` inference/cache pipeline | Missing posted data can become numeric legal-limit estimates; direction/vehicle/conditional matching incomplete | Open |
| P1 desktop GPS | `satnav.py:7257` on_location, error branch around :7314 | Error substitutes Barnsley for actual position | Open; desktop tests blocked by Kivy |
| P2 validation | `voyagr/utils/validation.py:68` validate_coordinates | NaN passes numeric range comparisons and can reach provider processing | Fixed with finite checks; four ingress regressions |
| P2 tests | `tests/test_traffic_tile_proxy.py` | Direct Flask handler calls lacked request/application context | Test setup fixed, original response assertions retained |

Dependency advisories are confirmed scanner matches, not proven exploits; details and priority are in the security report. No confirmed SQLi/XSS/SSRF exploit claimed from pattern searches alone.

## D. Security findings

Shared privileged gates now fail closed and use constant-time secret comparison. Public navigation/settings behavior remains available. Coupon admin already had its own fail-closed gate. Trip-history ownership checks and profile-snapshot SQL RLS exist; live deployment verification remains outstanding. Dashcam ownership enforcement is implemented in Phase 2; deployed session verification and storage containment remain release gates. Checkout accepts broader redirect origins than documented, JWT issuer fallback deserves hardening, CSP allows inline/eval, and source-level secret/logging review is incomplete across historical utilities. No credentials were printed, no live production database touched and no payment call authorized/executed.

Advisories: npm reports 11 vulnerable package entries (8 high/1 moderate/2 low); pip-audit reports nine affected packages and 38 distinct package/advisory-ID pairs (63 raw records). No dependency auto-upgrade was mixed into this navigation patch.

## E. Navigation reliability

- Routing: deterministic request, cache, recovery and scoring tests pass; reduced-constraint recovery now warns. Remaining retry/multidrop/OSRM constraints and road-mode capabilities need explicit provenance and enforcement tests.
- GPS: browser watch ingress rejects invalid/stale/inaccurate/out-of-order fixes and preserves prior reliable marker; no actual vehicle/sensor-fusion validation. Desktop default substitution remains unresolved.
- Speed: corrected OSM units; inference, direction/vehicle restrictions and legal applicability remain unsafe to assert as grounded posted limits. Current PWA documentation says GPS speedometer only; strict legacy functions retained.
- Cameras: real software paths use custom-model polygons/exclusion points and hazard scoring; no independent camera dataset/direction/junction/age validation. Alerts and map markers do not prove avoidance.
- Lanes: provider lane arrays are preferable; fallback lane counts/heading logic lack evidence. Existing UK normalization tests do not establish complex-junction accuracy.
- Offline: cached route/tiles and GPS may support continuation, but offline route computation and complete map coverage are unproven. No offline driving claim.

## F. Performance

Five-repeat microbenchmarks measured 10,000-point decoding at median 5.445ms and 20-waypoint cache-key construction at 0.0140ms. These are synthetic cloud measurements, not mobile frame/battery results. No speedup claim or large-file rewrite. Sequential provider retries and per-tick geometry/proximity work warrant profiling; detailed limitations are in VOYAGR_PERFORMANCE_AUDIT.md.

## G. Changes implemented

- `.github/workflows/ci.yml`
- `speed_limit_detector.py`
- `static/js/app/gps-orchestration.js`
- `static/js/modules/navigation/speed-gps.js`
- `tests/test_admin_auth.py`
- `tests/test_calculate_route_smoke.py`
- `tests/test_graphhopper_attempt.py`
- `tests/test_speed_limit_detector.py`
- `tests/test_speed_limit_fixes.py`
- `tests/test_traffic_tile_proxy.py`
- `voyagr/services/hazards.py`
- `voyagr/services/routing/engines.py`
- `voyagr/services/routing/hazard_prep.py`
- `voyagr/utils/admin_auth.py`
- `voyagr/utils/validation.py`
- `voyagr_web.py`

New tests: `tests/test_route_logging_privacy.py` (cache/provider/exception privacy, invalid JSON, finite endpoints and legacy bypass) and `static/js/__tests__/gps-fix-replay.test.js` (six deterministic cases). New deliverables: nine requested audit Markdown reports plus endpoint inventory, dependency findings and microbenchmark JSON. Production configuration, dependency manifests/lockfiles, live services and database schema were not changed. No deployment or destructive Git operation.

Behavior changes are intentional: admin APIs require configured secret, malformed bodies return 400, unexpected route errors return generic 500, non-finite endpoints are rejected, legacy routes recalculate, recovery warns, OSM numbers use proper units, invalid GPS fixes leave the last reliable position visible. Thresholds (15s age, 1s future skew, <=150m accuracy) require device validation.

## H. Test results

Before edits: Python 397 passed +61 subtests (3.93s); Jest 85 suites/1,771 passed (4.817s). Final expanded CI selection: **494 passed +68 subtests, no failures/skips reported, 5.59s** (6.18s process). Jest: **86 suites/1,777 passed, 5.165s**, configured coverage thresholds passed (82.67% statements, 75.42% branches, 80.93% functions, 84.54% lines). Additional overlapping web-security selection: 82 passed (0.57s). No unique-test total is obtained by summing overlapping runs.

Desktop test_input_validation collection blocked by missing Kivy; broader Python/live-provider scripts were not all run. Two traffic tests initially failed due absent Flask context and now pass after fixture repair. Intermediate privacy regression exposed and corrected a DEBUG URL leak; existing exception/unit fixtures were updated to assert the corrected contracts. Advisory scanners are findings, not passed checks. Full commands and unrun capabilities are in VOYAGR_TEST_RESULTS.md.

## I. Remaining work

First complete deployment acceptance of the Phase 2 owner/session protections and reviewed migration. Next establish enforced/relaxed/unknown route and lane/limit provenance, remove desktop fake-location behavior under tests, and upgrade affected dependencies in a dedicated reviewed batch. Validate realistic UK junction/camera datasets, device GPS loss/resume and controlled offline/road behavior. See VOYAGR_REMEDIATION_PLAN.md for acceptance criteria and deferred-change rationale.

## J. Production-readiness assessment

**NO-GO — pending dashcam security deployment acceptance and insufficient navigation safety evidence.** Selected automated checks passing does not establish real-world driving or public-deployment safety. No production deployment performed. After critical fixes and integration gates, a GO CANDIDATE would mean ready for controlled field validation only, never that driving validation already passed.
