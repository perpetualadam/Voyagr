# Phase 10 — Contabo Acceptance

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## Operator-run acceptance — unexecuted

Production remains NO-GO. These steps are an operator checklist after a separately approved deployment; this task does not authorize deployment, SSH, production cache writes, graph rebuilds, restarts, data replacement or configuration changes.

1. Record deployed commit, routing engine versions, active profile, graph import metadata and browser asset versions locally. Read installed `/info` using `curl --fail --silent --max-time 5 http://127.0.0.1:8989/info`; retain only supported encoded-value/profile summaries in the audit, no secrets or full routes. Verify toll absence is represented as a limitation rather than a rejected expression.
2. Locally checksum the actual camera-area file with `sha256sum /operator/verified/path/camera_areas.geojson`; count IDs, source/version and geometry types without publishing polygons. Validate against the same GraphHopper8 JTS/schema offline. Compare128/137 only with source/version evidence. Do not modify the installed file.
3. On an isolated installed-engine clone or an operator-approved controlled local routing harness, use private test journeys and trusted graph-edge/road identities: camera-only, multiple OSM areas, mixed camera/CAZ, adjacent/opposing carriageways, missing toll capability, preference and mandatory modes. Keep bodies/geometry out of logs. Confirm returned geometry avoids the actual blocked graph areas; HTTP200 is insufficient. Record pass/fail and limitations by fixture, not fabricated accuracy percentages.
4. With the approved PWA build, inspect each eligible alternative: GraphHopper first in preference mode despite higher Nearby count; engine, assessment, possible/applicable counts and limitation follow manual selection. Confirm ineligible mandatory alternatives cannot silently navigate, malformed shapes fall back, all visits remain ordered and style recovery restores all alternatives. Exercise GPS, offline and multi-stop flows on a physical device. Record browser/version and observations without private locations.
5. In an isolated harness simulate exhausted budgets, slow responses, provider timeout, repeated exclusion failures, browser cancellation and out-of-order responses. Observe JSON ROUTING_DEADLINE_EXCEEDED and X-Voyagr-Error-Origin only when Flask controls the response. Confirm no later provider HTTP attempt after exhaustion. Collect Server-Timing stage distributions with sample counts/median/p95/max; no live performance samples have been supplied.
6. If a real504 recurs, inspect only status, Content-Type, X-Voyagr-Error-Origin, Server-Timing, CF-Ray/Server and request correlation IDs in browser Network. Never copy authentication headers or full bodies. Under local operator control correlate existing Nginx request/upstream timing, Gunicorn worker-timeout and Flask deadline/provider-timeout logs for the same window. Cloudflare headers alone do not prove Cloudflare generated the body. Obtain actual installed read/worker timeouts read-only; do not change them. Same-second log lines are not elapsed-duration measurements.

## Acceptance record

All six real-world steps remain unexecuted. Required evidence includes graph-backed exclusion enforcement, trusted road association,20/10 comparison, dataset provenance/invalid geometry disposition, physical-device selection/style/GPS behavior, real latency distributions and504 generator attribution. Automated results are in TEST_RESULTS; no production GO is implied.
