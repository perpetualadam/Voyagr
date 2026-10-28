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

## Phase 6 update — evidence-bounded UK navigation

**PHASE6_PARTIALLY_VERIFIED; overall production NO-GO.** Inferred lane choices no longer become actionable; native active provider choices are preserved. Canonical legal speed evidence distinguishes mapped applicability from candidates/defaults and unknown values. Provider exit counts/fork/merge semantics survive normalization; geometry-only instructions are non-definitive. GPS ambiguity/causal-progress guards pause unsafe guidance, dense junction lookahead no longer skips manoeuvres, and arrival respects pending stops. Selected-route offline persistence invalidates stale compliance and requires fresh GPS. Desktop fallback coordinates are no longer invented on GPS errors, but full Kivy parity is unverified.

Local final checks: **662 Python +68 subtests**, **40 additional Python +4 PWA endpoint checks**, **1,856 Jest /91 suites**, **11 isolated SQL policy tests**, test lint and coverage thresholds passed. All 16 synthetic GPS scenarios pass; real road/graph/sensor acceptance remains unverified. Current lane/speed acquisition lacks trusted driven-road matching and conservatively reports unknown; national/conditional/heavy-vehicle rules are not implemented as verified legal values. Prior raw helper tests do not establish live navigation accuracy. See [Phase 6 report](VOYAGR_PHASE6_UK_NAVIGATION_ACCURACY.md), [test/performance results](VOYAGR_PHASE6_TEST_RESULTS.md).

Next priority: trusted versioned directional road/provider evidence and supervised UK device/junction/sign acceptance, alongside pending deployed dashcam session/proxy and avoidance-data acceptance. No deployment or production change.

## Phase 7 update — shared directional road evidence

**PHASE7_PARTIALLY_VERIFIED; production NO-GO.** New versioned source-linked matching combines a bounded spatial index, direction/one-way, continuity, shared-node path distance and supported restrictions; ambiguous hypotheses cannot become definitive attributes. A single PWA owner supplies lane/legal-speed/hazard consumers and gates route progress; source-backed wrong turns still use existing reroute hysteresis. POST/no-store/network-only evidence endpoints avoid cached GPS replay. Legacy hazard matching no longer clears mandatory constraints from stale/untyped road IDs.

Local checks: **702 Python +68 subtests**, **44 additional Python**, **1,890 Jest /93 suites**, **11 isolated SQL policy tests** passed with test lint/coverage. Twenty new synthetic directional scenarios and all prior Phase 6 scenarios pass. Real-source acquisition was denied HTTP 403; the acquisition tool and 14-category manifest do not establish authoritative UK junction validation. No production/self-hosted Contabo API was contacted; no configuration/data/deployment change. Phase 7 does not implement Kivy or native Android.

Operator confirms Contabo API self-hosting and enabled GitHub auto-merge; main still reports unprotected/no applicable rules. Required CI gates must be configured before check-gated squash auto-merge. Phase 6 PR #343 is an explicit unmerged dependency. Next priority: approved offline source/graph fixtures from the self-hosted pipeline, trustworthy coverage/directional attributes, supervised UK PWA device acceptance, deployed dashcam security and engine/avoidance acceptance. See [road matching](VOYAGR_PHASE7_DIRECTIONAL_ROAD_MATCHING.md), [fixture provenance](VOYAGR_PHASE7_UK_JUNCTION_FIXTURES.md), [validation](VOYAGR_PHASE7_TEST_RESULTS.md).

## Phase 8 update — bounded evidence and acceptance tooling

**PHASE8_PARTIALLY_VERIFIED; production NO-GO.** Bounded operator-only Overpass/offline export and shared evidence QC preserve original source age, partial coverage, restrictions/licensing and uncertain hazard association. Loader/browser indexes reject contradictory node identity and duplicate way evidence. Graph replay no longer accepts generic HTTP errors as no-route evidence; it checks all alternatives/ordered stops, requires reviewed graph oracles and blocks mismatched/unknown installed versions. PWA vehicle changes immediately invalidate stale attributes; unknown future offline schemas are refused while selected route/stops and mandatory guards remain.

Local validation: **722 Python +68 subtests**, **44 additional Python**, **1,901 Jest /94 suites**, **11 isolated SQL policy tests**, lint/coverage passed. No real source was acquired; 36 graph combinations and 20 physical-device cases remain NOT_TESTED. Operator-run export/QC and device protocols are provided, prioritising approved Doncaster/South Yorkshire data without invented coordinates. No Contabo/production configuration/data/graph/service change, deployment, native Android or Kivy work.

Recovery update (2026-10-27): Phase 6 #343 and Phase 7 #344 are merged on main `4c1db053`. GitHub API access is verified; effective main rules require all three CI jobs and squash-only PR merges. Earlier Phase 7 access/protection observations above are historical and superseded. Phase 8 is recovered from `070d0be5` without duplicating those dependencies. Remaining release gates: trustworthy source/graph/profile evidence and supervised real-device/navigation/offline acceptance, independently verified routing/avoidance coverage and deployed dashcam session/storage protections. See [road evidence](VOYAGR_PHASE8_CONTABO_ROAD_EVIDENCE.md), [engine validation](VOYAGR_PHASE8_ENGINE_VALIDATION.md), [device protocol](VOYAGR_PHASE8_PWA_DEVICE_ACCEPTANCE.md), [test evidence](VOYAGR_PHASE8_TEST_RESULTS.md).

## Phase 9 — evidence handoff and validation

**PHASE9_PARTIALLY_VERIFIED; production NO-GO.** Baseline Phase 8 PR #345 is merged at `1cd21ebf`; main CI verified green. No real UK source export, installed graph/profile bundle or physical device is available in Codex. Local metadata discovery found all three engines unavailable: **36 NOT_TESTED, zero routing requests**. Actual UK source/graph-backed matching, all 20 physical-device cases, offline device continuation and deployed dashcam security remain unverified. No production access/deployment/configuration/data/graph mutation.

Confirmed acquisition defects silently discarded contradictory OSM tags; source normalization now refuses conflicting node/way/restriction tags. Device result validation now rejects invalid, timezone-free and future timestamps. Shared QC exposes SOURCE_VALIDATED/PARTIAL/STALE/CONFLICTING/UNAVAILABLE without relaxing existing applicability guards. No navigation/security algorithm rewrite. Local validation: **736 Python +68 subtests**, **44 additional Python**, **1,901 Jest /94 suites**, **11 isolated SQL tests**, lint/coverage passed. All timings remain synthetic local CPU.

Exact bounded operator export/import/checksum/provenance steps, installation/replay evidence requirements, preserved device IDs, offline and dedicated-account dashcam acceptance procedures are recorded in [real road evidence](VOYAGR_PHASE9_REAL_ROAD_EVIDENCE.md), [engine replay](VOYAGR_PHASE9_ENGINE_REPLAY.md), [road matching](VOYAGR_PHASE9_ROAD_MATCHING.md), [PWA acceptance](VOYAGR_PHASE9_PWA_ACCEPTANCE.md), [offline recovery](VOYAGR_PHASE9_OFFLINE_RECOVERY.md), [dashcam acceptance](VOYAGR_PHASE9_DASHCAM_ACCEPTANCE.md), [performance](VOYAGR_PHASE9_PERFORMANCE.md) and [test results](VOYAGR_PHASE9_TEST_RESULTS.md). Operator-supplied source/export and isolated engine manifests are the next boundary; no fabricated coordinates or acceptance results. Phase 10 should execute and independently review these real-source/engine/device/security checks before any release decision.


## Phase 10 update — 2026-10-28

PHASE10_PARTIALLY_VERIFIED; production remains NO-GO. GraphHopper-first display follows independent geometry/mandatory assessment, not nearby-camera minimization. Conflicting-source evidence deduplication and shared-deadline exception propagation are corrected. Browser errors avoid HTML body logging and unsupported504 attribution. Local configured backend, Jest/coverage, lint and isolated SQL checks pass; installed-engine, dataset provenance,20/10 discrepancy, real504 origin and physical-device acceptance remain unexecuted. See [routing quality](VOYAGR_PHASE10_ROUTING_QUALITY.md), [test results](VOYAGR_PHASE10_TEST_RESULTS.md) and [operator acceptance](VOYAGR_PHASE10_CONTABO_ACCEPTANCE.md). No production changes or deployment.


## Phase 11B — 2026-10-28

PHASE11B_PARTIALLY_VERIFIED; production remains NO-GO. Confirmed11A invalid-empty, endpoint recovery, duplicate-miss, viewport ownership and deadline defects are remediated with strict bounded validation, full evidence cache envelopes, ordered cooldown/fallback policy, process-local coalescing and independent cooperative budgets. Active PWA speed/lane/search acquisition uses the common policy. Unknown UK dataset completeness remains PARTIAL; no mandatory safety gate or GraphHopper-first policy was weakened. Existing11A reports remain historical evidence. Final local backend882tests +68subtests, Jest1,924tests/coverage, lint and SQL11tests pass. Hosted results are recorded on the PR. No deployment or infrastructure change.

See [remediation](VOYAGR_PHASE11_OVERPASS_REMEDIATION.md), [retry/deadline tests](VOYAGR_PHASE11_RETRY_AND_DEADLINE_TESTS.md), [performance](VOYAGR_PHASE11_OVERPASS_PERFORMANCE.md) and [unexecuted operator acceptance](VOYAGR_PHASE11_CONTABO_ACCEPTANCE.md). Synthetic4caller queries reduced4HTTP calls to1, while validation/copies increased large-payload CPU/memory cost. Phase11C must verify source provenance/coverage, actual502/invalid-response/504 origin, multiworker load and graph/device acceptance before production GO.


## Phase12B — camera-area candidate, 2026-10-28

PHASE12B_PARTIALLY_VERIFIED; production NO-GO. A separately versioned candidate repairs the102invalid MultiPolygon aggregations through per-feature union of valid members, preserves128IDs/properties and exact source union coverage, removes106proven duplicate geometry components without deleting source camera records, and passes GEOS/JTS. Original camera/point files remain unchanged. A reproduced env137-versus-loaded128reporting precedence bug is corrected while preserving missing-file fallback. Actual production137attribution, source direction/road/section/time provenance and all128installed GraphHopper expressions/graph-backed enforcement remain unverified. User/operator attests original installed hash identity; no new Contabo access/deployment was performed. See the nine Phase12B reports, versioned manifest and per-feature metrics. Candidate generation is offline/opt-in, not an automatic replacement or release GO.

## Phase12C — acceptance evidence, 2026-10-28

PHASE12C_PARTIALLY_VERIFIED. Candidate remains CANDIDATE_NOT_VERIFIED and production NO-GO. Reproduced original/candidate hashes, all128 identities/properties, exact geographic equivalence and offline GH8 JSON/JTS validity; actual profile compilation and graph-backed enforcement remain NOT_TESTED because no approved isolated engine/graph/oracle was supplied. Neither HTTP200 nor hard-zero rule construction is promoted to geographic compliance. Paired runner separates baseline/restricted segments, boundaries/holes, genuine no-path, capability metadata and optional edge evidence with bounded cooperative calls and privacy-safe output. Original/candidate files and runtime routing policy remain unchanged: GraphHopper preferred first eligible Optimised, mandatory gates intact, Valhalla and honest OSRM fallbacks preserved.137 provenance and physical-device/production release acceptance remain open. See [release decision](VOYAGR_PHASE12C_RELEASE_DECISION.md), [operator procedure](VOYAGR_PHASE12C_CONTABO_OPERATOR_ACCEPTANCE.md), and [test results/inventory](VOYAGR_PHASE12C_TEST_RESULTS.md). No production access, deployment, rebuild or service change.
