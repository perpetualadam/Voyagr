# Phase12C — Performance and resource evidence

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

| Metric | Actual engine n | Median / p95 / max |
|---|---:|---|
| Dataset load / import / startup |0| NOT_TESTED |
| Expression compilation |0| NOT_TESTED |
| Route computation / no-path |0| NOT_TESTED |
| Original versus candidate latency |0 paired| NOT_TESTED |
| Large combined model |0| NOT_TESTED |
| CPU / memory |0| NOT_TESTED |

No mock timings are reported as engine measurements. Existing Phase12B geometry benchmarks concern offline processing only. Python/Jest wall times in test results are test-run durations, not routing latency.

Approved runner batches cap at48 HTTP calls,60s default cooperative wall budget (absolute constructor cap120s),2s connect/5s read bounded by remaining budget,2MiB response,64KiB request,128KiB plan,10 waypoints and at most16 area tests or4 fixtures per instance. Defaults are8 areas or2 fixtures. No retries, redirects, thread pool or background tasks. Expired and late results stop; underlying socket/CPU work is cooperative and not a hard preemptive guarantee. Explicit operator cancellation stops the process; no further application attempts are scheduled.

Stage output includes n, median, nearest-rank p95 and max milliseconds measured monotonically around the complete call including failures. `compilation_plus_seed_route` is end-to-end and **cannot isolate compiler time**. Cold versus warm JVM/import, compilation, GC,CPU and RSS require separate engine instrumentation/import receipts. Keep batches paced and review resource observations before continuing. Do not infer Contabo performance from isolated services.
