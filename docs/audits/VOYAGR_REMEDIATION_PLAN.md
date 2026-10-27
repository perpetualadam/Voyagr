# Voyagr remediation plan

## Release decision

**NO-GO for public production release.** Phase 2 remediates the recording-access defect at application-code level; deployed session-policy/storage verification remains mandatory. Lane/posted-limit/GPS/fallback guarantees retain unresolved P1 safety issues. See [dashcam remediation](VOYAGR_DASHCAM_SECURITY_REMEDIATION.md). No automatic deployment. These are source-level findings, not a claim production has been exploited.

## Completed reversible batches

1. Admin fail-closed policy, constant-time credential compare, continued public navigation/settings, and negative authorization tests.
2. Targeted route/provider privacy logging and generic exception responses; malformed/non-object and non-finite route input rejection; regression checks at DEBUG including structured fields/stdout.
3. Remove unverifiable legacy cache reuse; mark reduced-constraint recovery degraded; preserve existing routing fallbacks with an explicit limitation warning.
4. Correct unqualified OSM maxspeed units; preserve symbolic/explicit units and existing strict-limit code.
5. Browser fix admission by validity/age/order/accuracy; retain last reliable marker/freshness on rejection; repair invalid reroute counter assignment; deterministic replay tests.
6. Repair missing Flask context in two existing traffic-tile tests, and expand Python CI selection to preserve the new web-security checks.

## Phase 2 completed

Authenticated owner scoping now covers every dashcam endpoint, metadata, file, active session, settings and retention. Legacy ownership stays NULL; no automatic attribution or deletion. Browser video requests use Bearer headers, local-only capture is explicit, account changes discard stale private responses, and the service worker bypasses caching/replay. Existing Supabase identity verification is reused with an online own-session check; absent/unavailable session policy fails closed. Final Phase 2 selected runs: 538 Python tests + 68 subtests; 1,796 Jest tests in 88 suites; 11 isolated PostgreSQL policy tests passed. Live deployment verification is still required; no deployment was performed.

## Prioritized remaining work

| Priority | Work | Why deferred / concrete acceptance criteria |
|---|---|---|
| P0 SEC-03 deployment gate | Verify deployed private dashcam protections | Code, owner-scoped SQLite/files, authenticated browser requests and live-session-check SQL are implemented and locally tested. Apply reviewed session RPC migration and verify real Supabase revocation, two-account access and proxy/static isolation before public exposure. Legacy NULL-owned rows remain quarantined and unchanged. |
| P1 NAV-03 | Explicit engine/route capability and constraint outcomes | Every primary/retry/recovery/OSRM/multidrop option must list requested/enforced/relaxed/unknown constraints. Reduced exclusions cannot claim full avoidance. Test provider failures and missing camera data; frontend must require clear user acknowledgement where route constraints relax. |
| P1 lane | Data-grounded lane instructions | Replace heading-derived lane occupancy/default lane counts with unknown/source states. Preserve genuine lane arrays; test UK motorways, roundabouts, multiple exits and directional turn lanes. Requires desktop tests and real OSM/maneuver fixtures. |
| P1 speed | Applicable posted/estimated/unknown legal-limit contract | Eliminate ungrounded legal-limit assertions without removing valid strict alerts; direction/vehicle/conditional/cache isolation tests and UK sign fixtures. Free-flow speed must remain ETA-only. |
| P1 desktop GPS | Last-reliable/unknown state across desktop consumers | Stop Barnsley substitution and guard navigation start, without breaking tuple-assuming consumers. Provision Kivy test environment and simulate GPS loss/update exception. |
| P1 dependencies | Upgrade advisory-affected runtime packages and npm transitive graph | Use advisory metadata in JSON, supported Python/Node versions and migration review (Flask/CORS/Gunicorn/JWT especially). Run CI plus proxy/header/auth integration checks; do not run blind npm audit fix --force. |
| P1 route mode | Verify public fallback profile capability | Walking/cycling requests must never silently become driving routes; controlled provider fixtures and integration checks required. |
| P2 auth/payment | Strict issuer and checkout redirect/account contract | Signed missing-issuer/cross-project fixtures; parsed allowlisted redirect origins; authenticated customer association; verified webhook reconciliation before entitlement updates. |
| P2 cache | Separate cached geometry from current prices/provider state | Change cost fields on identical geometry and prove fresh costs; test hazard dataset revision/constraint provenance and route mode isolation. |
| P2 privacy | Whole-app location retention/logging policy | Browser/desktop/speed detector/multidrop errors, request access logs, database retention/export/delete; prove coordinates and credentials absent where not operationally justified. |
| P2 performance | End-to-end budget and device profiling | Worst-case mocked provider stalls, route/hazard scaling, actual frame-time/heap/battery traces. Preserve correctness and avoid speculative large-file refactors. |
| P2 offline | Honest offline capability verification | Preloaded route/tiles/style/font data, GPS loss/resume, backend/network outage, cached-route expiry and no-route failure feedback. Do not advertise offline route computation until it exists. |

## Review and rollout constraints

Operator must configure VOYAGR_ADMIN_SECRET securely before using privileged routes; missing secret now intentionally yields 503. Never place secret values in code, reports or logs. Production nginx configuration, live databases and secrets were not changed. Existing deployment remains the Contabo pull/restart process after normal review; this audit does not authorize deployment. New GPS thresholds and generic exception responses are deliberate user-visible reliability/privacy changes and need product review plus controlled field validation. Existing documents about older optional admin behavior are historical and are superseded by the implementation and this plan.

After critical ownership/constraint work, run CI, representative provider integration fixtures, a browser navigation replay, and then controlled road validation with a human safety protocol. A GO CANDIDATE would still not establish real-world driving validation.
