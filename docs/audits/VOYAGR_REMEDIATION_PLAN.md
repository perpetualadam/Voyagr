# Voyagr remediation plan

## Release decision

**NO-GO for public production release.** Phase 2 remediates the recording-access defect at application-code level; deployed session-policy/storage verification remains mandatory. Phase 4 adds evidence-bounded Flask/PWA avoidance enforcement; installed providers, road data and desktop parity remain unverified. Lane/posted-limit/GPS and field acceptance retain unresolved P1 safety issues. See [dashcam remediation](VOYAGR_DASHCAM_SECURITY_REMEDIATION.md). No automatic deployment. These are source-level findings, not a claim production has been exploited.

## Completed reversible batches

1. Admin fail-closed policy, constant-time credential compare, continued public navigation/settings, and negative authorization tests.
2. Targeted route/provider privacy logging and generic exception responses; malformed/non-object and non-finite route input rejection; regression checks at DEBUG including structured fields/stdout.
3. Remove unverifiable legacy cache reuse; mark reduced-constraint recovery degraded; preserve existing routing fallbacks with an explicit limitation warning.
4. Correct unqualified OSM maxspeed units; preserve symbolic/explicit units and existing strict-limit code.
5. Browser fix admission by validity/age/order/accuracy; retain last reliable marker/freshness on rejection; repair invalid reroute counter assignment; deterministic replay tests.
6. Repair missing Flask context in two existing traffic-tile tests, and expand Python CI selection to preserve the new web-security checks.

## Phase 2 completed

Authenticated owner scoping now covers every dashcam endpoint, metadata, file, active session, settings and retention. Legacy ownership stays NULL; no automatic attribution or deletion. Browser video requests use Bearer headers, local-only capture is explicit, account changes discard stale private responses, and the service worker bypasses caching/replay. Existing Supabase identity verification is reused with an online own-session check; absent/unavailable session policy fails closed. Final Phase 2 selected runs: 538 Python tests + 68 subtests; 1,796 Jest tests in 88 suites; 11 isolated PostgreSQL policy tests passed. Live deployment verification is still required; no deployment was performed.

## Phase 4 completed at Flask/PWA code level

**PARTIALLY_VERIFIED; overall NO-GO.** Canonical mandatory/preference requirements, independent per-alternative/leg compliance, cache reassessment, bounded coverage/age, direction/road-aware evidence matching, explicit manual acceptance and automatic reroute refusal are implemented. Stale responses cannot overwrite newer requests/preferences. Segment scoring fixes mid-route misses; OSRM precision and legacy adapter geometry/units are corrected. Public OSRM fallback defaults to driving-only capability.

Final local validation: **594 Python tests + 68 subtests**, **1,821 Jest tests in 89 suites**, and **11 isolated PostgreSQL policy tests passed**; no final selected failures/skips. This includes previous dashcam security/lifecycle regressions. Synthetic three-alternative compliance overhead was 7.197/16.188/111.211 ms median for 100/1,000/10,000 hazards. See [Phase 4 report](VOYAGR_ROUTING_AVOIDANCE_INTEGRITY.md) for exact scope, fixtures, engine matrix and measurements. No production configuration/data/deployment changes.

## Phase 5 completed at software level

**PHASE5_PARTIALLY_VERIFIED; overall production NO-GO.** Full multi-stop journey geometry, manoeuvre offsets/leg identity, mixed format/precision normalization, incomplete-route rejection, geometry/assessment consistency and remaining-stop rerouting are implemented. A 30 s cooperative routing budget and 35 s browser fetch cancellation preserve stale-response and mandatory gates. They do not guarantee hard socket/CPU preemption or cancellation of already-running server work.

Validation: **629 Python + 68 subtests**, **1,828 Jest / 90 suites**, **11 isolated PostgreSQL policy tests** passed; test lint/coverage passed. Additional offline integration is recorded separately in the Phase 5 test report. Local engines/graphs are unavailable: **REAL_ENGINE_EXECUTION_NOT_TESTED**; all 36 replay cases unexecuted. Full synthetic Flask request medians: 1.851 ms single, 3.331 ms three stops, 4.197 ms five stops, 0.893 ms cache, 1.519 ms failover, 1,412.071 ms with 10,000 hazards. These mock-provider measurements do not establish production latency or road accuracy.

Reports: [engine validation](VOYAGR_PHASE5_ROUTING_ENGINE_VALIDATION.md), [geometry remediation](VOYAGR_MULTISTOP_GEOMETRY_REMEDIATION.md), [latency](VOYAGR_ROUTING_LATENCY_REPORT.md), [tests](VOYAGR_PHASE5_TEST_RESULTS.md). No production configuration/data/deployment change.

## Prioritized remaining work

| Priority | Work | Why deferred / concrete acceptance criteria |
|---|---|---|
| P0 SEC-03 deployment gate | Verify deployed private dashcam protections | Code, owner-scoped SQLite/files, authenticated browser requests and live-session-check SQL are implemented and locally tested. Apply reviewed session RPC migration and verify real Supabase revocation, two-account access and proxy/static isolation before public exposure. Legacy NULL-owned rows remain quarantined and unchanged. |
| P1 NAV-03 acceptance | Validate deployed engine/data avoidance and desktop parity | Flask/PWA evidence contract and selection gates are implemented/tested in Phase 4. Verify installed engine restrictions, camera direction/coverage/age, CAZ/congestion road polygons, deployed full-journey geometry/stop-state acceptance and real-device/offline acceptance. Desktop direct paths remain NOT_VERIFIED; do not claim universal mandatory avoidance. |
| P1 lane | Data-grounded lane instructions | Replace heading-derived lane occupancy/default lane counts with unknown/source states. Preserve genuine lane arrays; test UK motorways, roundabouts, multiple exits and directional turn lanes. Requires desktop tests and real OSM/maneuver fixtures. |
| P1 speed | Applicable posted/estimated/unknown legal-limit contract | Eliminate ungrounded legal-limit assertions without removing valid strict alerts; direction/vehicle/conditional/cache isolation tests and UK sign fixtures. Free-flow speed must remain ETA-only. |
| P1 desktop GPS | Last-reliable/unknown state across desktop consumers | Stop Barnsley substitution and guard navigation start, without breaking tuple-assuming consumers. Provision Kivy test environment and simulate GPS loss/update exception. |
| P1 dependencies | Upgrade advisory-affected runtime packages and npm transitive graph | Use advisory metadata in JSON, supported Python/Node versions and migration review (Flask/CORS/Gunicorn/JWT especially). Run CI plus proxy/header/auth integration checks; do not run blind npm audit fix --force. |
| P1 route mode acceptance | Verify installed fallback profile capability | Configured public fallback now refuses non-driving modes by default. Operator-declared extra profiles still require actual graph-backed walking/cycling validation; a URL profile name is not evidence. |
| P2 auth/payment | Strict issuer and checkout redirect/account contract | Signed missing-issuer/cross-project fixtures; parsed allowlisted redirect origins; authenticated customer association; verified webhook reconciliation before entitlement updates. |
| P2 cache | Separate cached geometry from current prices/provider state | Change cost fields on identical geometry and prove fresh costs; test hazard dataset revision/constraint provenance and route mode isolation. |
| P2 privacy | Whole-app location retention/logging policy | Browser/desktop/speed detector/multidrop errors, request access logs, database retention/export/delete; prove coordinates and credentials absent where not operationally justified. |
| P2 performance | End-to-end budget and device profiling | Phase 5 adds cooperative budgets/cancellation and full mocked HTTP timings. Verify hard slow-trickle/proxy limits, actual graph/provider latency and dense/large-data CPU behavior (10k synthetic records reached 1.67 s), plus frame-time/RSS/battery/concurrency; do not extrapolate synthetic medians to devices. |
| P2 offline | Honest offline capability verification | Preloaded route/tiles/style/font data, GPS loss/resume, backend/network outage, cached-route expiry and no-route failure feedback. Do not advertise offline route computation until it exists. |

## Review and rollout constraints

Operator must configure VOYAGR_ADMIN_SECRET securely before using privileged routes; missing secret now intentionally yields 503. Never place secret values in code, reports or logs. Production nginx configuration, live databases and secrets were not changed. Existing deployment remains the Contabo pull/restart process after normal review; this audit does not authorize deployment. New GPS thresholds and generic exception responses are deliberate user-visible reliability/privacy changes and need product review plus controlled field validation. Existing documents about older optional admin behavior are historical and are superseded by the implementation and this plan.

After critical ownership/constraint work, run CI, representative provider integration fixtures, a browser navigation replay, and then controlled road validation with a human safety protocol. A GO CANDIDATE would still not establish real-world driving validation.

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
