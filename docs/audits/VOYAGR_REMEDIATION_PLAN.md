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
