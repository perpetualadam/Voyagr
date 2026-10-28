# Phase 10 — Deadline Reliability

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## Confirmed mechanism

`RoutingDeadlineExceeded` derives from requests Timeout. GraphHopper and Valhalla broad/provider catches treated it as ordinary engine failure. Although the existing transport wrapper refused expired actual HTTP calls, logical retry/fallback branches could continue and log attempts after the shared budget was exhausted. The old GraphHopper message printed the configured 30-second limit, not measured elapsed time. This explains how immediate deadline rejections can share a second-level timestamp; it does not establish what consumed the specific production request.

Explicit propagation now stops expired routing through primary providers, exclusion retries, recovery and multi-stop legs. A pre-check precedes new primary GraphHopper work, Valhalla HTTP work, exclusion-loop attempts and OSRM fallback logging. All transports share the request-local monotonic budget and retain remaining-time timeout clamps. Late provider results, assessment and serialization results are rejected. No new threads or background work are introduced.

## Timing and errors

Bounded stage timers cover metadata, hazards, custom_model, graphhopper, valhalla, osrm, assessment and serialization. Success responses expose Server-Timing plus X-Routing-HTTP-Calls. Application deadline responses are JSON HTTP504 with ROUTING_DEADLINE_EXCEEDED, error_origin=application, elapsed_ms, bounded stage_timings and X-Voyagr-Error-Origin: application. Provider timeouts log actual monotonic elapsed_ms separately from configured_timeout_s, without coordinates or models.

Hazard acquisition (including external services/cache), metadata discovery, model construction and enrichment can consume time before/after provider calls. CPU work, DNS and slow-trickle reads are cooperative, not hard-preempted. Request timeouts bound connect/read inactivity separately; Flask checks discard late results but cannot guarantee delivery before every upstream limit. A blocked worker can still be killed by a proxy/process manager first.

Browser request orchestration retains cancellation/generation safeguards and the existing 35-second client timeout. Non-JSON504 does not consume/log its body or claim a specific failing component. It preserves the current route and explains that origin is unidentified.

## HTTP504 origin remains unresolved

The supplied HTML page alone cannot distinguish Cloudflare, Nginx or Gunicorn. Repository examples use Nginx proxy_read_timeout120 and Gunicorn timeout120; these are not deployed configuration evidence. Application-controlled deadlines now have an explicit origin marker. Operator must correlate status/headers and upstream timing logs with the installed configuration; do not edit production timeouts to make tests pass.

## Evidence

Deterministic clocks verify expiry before GraphHopper/Valhalla I/O, slow Valhalla late-result rejection, no subsequent provider transport, hazard-stage exhaustion, serialization exhaustion and multi-stop OSRM propagation. Full existing deadline, cancellation and fallback regressions remain included. Synthetic stage distributions are in TEST_RESULTS; no real-engine latency or proxy attribution measurement was executed.
