# Phase 5 — routing latency and resource report

**Synthetic software measurements only. No real-engine/network/device latency measured.** Date: 2026-10-27.

## Reproduction and scope

Run `.venv/bin/python scripts/benchmark-phase5-routing.py` and `node scripts/benchmark-phase5-frontend.cjs`. Raw evidence: [Flask latency](VOYAGR_PHASE5_LATENCY.json), [frontend processing](VOYAGR_PHASE5_FRONTEND_LATENCY.json). The Flask harness executes the actual `/api/route` request boundary, parser, provider adapters/fallbacks, geometry normalization/stitching, avoidance evaluation, ranking/enrichment and response serialization. Provider HTTP, remote hazard acquisition and route-cache writes are deterministic mocks; scoring uses an isolated in-memory SQLite preference table/defaults. No network/paid API/production data/configuration is used. Local test-client requests exclude real sockets/proxies/HTTP download/GPU work.

Twenty latency samples per workload, plus one separate traced-memory sample. p95 uses nearest rank; this small sample describes this run only. Peak traced allocations exclude already-created fixture inputs and are not process RSS. Cached responses are copied/reassessed; no new paid/provider query is added. The provider call column counts mock calls across all 21 requests, including the memory sample, and exposes retry/alternative fan-out rather than real quota usage.

| Workload | Median ms | p95 ms | Maximum ms | Peak traced MiB | Mock calls / 21 requests |
|---|---:|---:|---:|---:|---:|
| single | 1.851 | 4.103 | 5.791 | 0.071 | 63 |
| three_stops | 3.331 | 4.004 | 4.464 | 0.161 | 84 |
| five_stops | 4.197 | 6.305 | 8.885 | 0.264 | 126 |
| alternatives | 2.032 | 3.712 | 3.82 | 0.071 | 63 |
| cached | 0.893 | 1.438 | 46.085 | 0.071 | 0 |
| failover | 1.519 | 1.977 | 2.189 | 0.075 | 42 |
| large_hazards | 1412.071 | 1642.732 | 1671.26 | 5.362 | 147 |

The large-hazard workload uses 10,000 synthetic records and the actual scoring/enrichment/checksum/serialization path. It is materially more expensive than the small fixtures; do not extrapolate the earlier matching-only microbenchmark to full requests. No claim this is fast enough on a phone or deployed VPS is made. Cache hits avoid provider calls, but provenance still needs verification and geometry reconstruction. Per-category contract requests continue to bypass coarse legacy cache keys; production hit rate was not measured.

## Stage measurements

The raw JSON includes call distributions (median/p95/max/count) for parsing, mocked provider work, geometry decoding, geometry stitching, hazard fixture acquisition, avoidance assessment, ranking/enrichment and JSON serialization. Measurements wrap real functions where available. Times are **inclusive/nested and not additive**; repeated decoding and alternative generation are visible. The hazard acquisition number measures fixture copying, not Overpass/TomTom/SQLite ingestion latency. Serialization includes Flask's test-client request-body encoding as well as response dumps. There is no fabricated production stage breakdown or network delay.

Node processing uses the shared five-vertex full-journey fixture, selection normalization, polyline decoding, remaining-distance calculation and checksum validation, with 200 samples for one and three alternatives. Median was approximately 0.0073/0.0052 ms, p95 0.0428/0.0096 ms and maximum 3.483/0.326 ms. JIT/warmup/noise mean this does not show that more alternatives are faster. This excludes MapLibre rendering, DOM layout, browser scheduling and device behavior.

## Request budget and cancellation

Confirmed cause: independent 10–20 s transport timeouts plus retries/alternative requests and Overpass exponential backoff could multiply total work. Public routing requests now have one request-local **30 s cooperative budget**. Provider and route-hazard HTTP connect timeout is capped at 3 s and read timeout at remaining budget/configured limit; exhausted requests send no further budgeted HTTP calls. Overpass retry waits refuse delays that consume remaining budget. Late results are discarded at the response boundary as HTTP 504 / ROUTING_DEADLINE_EXCEEDED; stage/call timing headers are emitted for successful assessed responses. This is not a global limit on unrelated APIs or desktop direct requests.

Browsers give each routing fetch an AbortController and 35 s timeout, abort the previous fetch on supersession/preference invalidation and dispose owned timers on completion. Phase 4 sequence/revision/snapshot guards remain because aborting is not proof work stopped. Geocoding can still finish separately and is rejected when stale. Browser abort does not cancel a provider request already running in Flask.

**Limits:** Requests read timeouts measure inactivity, not a hard total socket deadline. A slow trickle response, DNS, CPU work, serialization or unbudgeted local operation can exceed the wall-clock budget before control returns. No forced server-thread/process cancellation or global cross-request quota scheduler was introduced. Budgeting prevents further attempts and late response use; it does not claim hard preemption or prove production p95. Test isolation verifies shared budget shrinkage, late result rejection, backoff refusal, 429 handling and independent concurrent request state.

## Next measurements

Replay with installed graph/profile/data manifests and fault proxy, then measure real socket/provider/acquisition delays, deployment proxy timeouts, CPU/RSS under concurrency, rate limits/quotas, device/GPU frame time and GPS/offline stop transitions. Keep production NO-GO until graph-backed and device/security acceptance is complete. No production deployment occurred.
