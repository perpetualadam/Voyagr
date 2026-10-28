# Phase 11B — Overpass performance

Status: **PHASE11B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: merged Phase11A PR #352, `d0482d3eb00ba883b74b362692f67a69eb873372`; Phase10 `12def1c46a4e9fc5cf7666c2fedbc3ae12b911ee` is preserved. All infrastructure/Contabo acceptance below is NOT_TESTED. No SSH, production query, deployment, restart, configuration/data/graph change, paid provider or new infrastructure dependency was used. Phase11A reports remain unchanged as historical evidence.

## Method

Executed `.venv/bin/python scripts/benchmark-phase11b-overpass.py --mock-http`, producing [raw distributions](VOYAGR_PHASE11B_OVERPASS_PERFORMANCE.json). Before loads the actual helper source from the11A baseline commit; after uses the current helper. Both execute actual helper functions with bounded synthetic transports. Twenty samples per case, median/p95/max milliseconds. The4caller test uses a caller barrier and5ms mocked service latency. Retry timing uses1ms base delay deliberately scaled for tests, not production's1s base. Expired Flask requests measure boundary overhead and are not real-engine timeout latencies. A single extra tracemalloc run measures Python-traced peak allocations, not process RSS.

|Case|Version|Samples|Median ms|p95 ms|Max ms|
|---|---|---:|---:|---:|---:|
|cache_miss|before|20|0.031|0.082|0.252|
|cache_miss|after|20|0.086|0.193|0.483|
|cache_hit|before|20|0.006|0.009|0.012|
|cache_hit|after|20|0.022|0.059|0.195|
|large_5295|before|20|9.205|10.223|10.944|
|large_5295|after|20|57.527|67.653|72.006|
|four_identical_requests|before|20|6.651|6.918|7.594|
|four_identical_requests|after|20|6.666|7.116|7.357|
|retry_exhaustion_scaled_backoff|before|20|7.548|7.833|8.983|
|retry_exhaustion_scaled_backoff|after|20|3.618|3.86|4.104|
|expired_flask_request|before|20|0.102|0.338|24.728|
|expired_flask_request|after|20|0.135|0.312|0.409|

Validation-only5,295elements: n=20, median11.239ms, p9512.117ms, max27.232ms. This is CPU parsing/schema checking, not OSM query execution.

Loopback mock HTTP10elements: n=20, median1.756ms, p952.481ms, max2.791ms. A temporary single-thread HTTPServer served a fixed response; no actual Overpass, public endpoint, routing engine or Contabo was contacted.

## Measured effects and tradeoffs

Four concurrent equivalent callers made4transport calls per sample before and1after, in all20samples. Caller throughput in this fixture was 601.41 before and 600.06 after callers/second; reduced upstream load is established, not increased production throughput. Cache-hit cases made no additional transport calls; the source/category/version key ignores merely decorative caller labels.

Strict validation and independent evidence copies increase CPU/memory cost. The5,295element peak traced allocation was 3757846bytes before and 7488134bytes after. These peaks include fixture serialization/parse/copy work and are not additive to measured request timing. The new large-response median is slower; do not present this change as a universal latency optimization. The serialized cache ceiling16MiB is not a16MiB Python heap guarantee. Two active acquisitions bound simultaneous work per process but real Gunicorn-worker memory and dispatcher limits still require measurement.

Removing the final pointless retry wait reduced scaled retry median; production exposure is instead bounded by the cooperative acquisition/parent budget and sequential endpoint caps. Cache defensive copies and metadata checks cost more than the old shared-reference cache. Monotonic expiry avoids stale-data promotion; no optimization hides changed restrictions beyond the existing <=300s cache TTL.

## Not measured

Actual installed-engine query processing, production response size distribution, memory/cgroup pressure, dispatcher queueing, multiworker shared capacity, proxy timings and real browser route latency remain NOT_TESTED. No real Contabo observations were generated. Source-reported0/5,295elements and502s do not prove resource exhaustion or explain the historical504. Before/after data is local synthetic evidence, not an availability/SLA claim.
