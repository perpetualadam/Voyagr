# Phase12F-B — Performance measurements

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** Base: merged Phase12F PR357 `8a01e63d98a15f56395bae5fae506cad0fb9cdf2`. GraphHopper remains preferred first eligible Optimised; Valhalla alternatives and honest OSRM fallback remain gated. No server access, deployment, dataset replacement, graph rebuild or restart. Live lab/device acceptance is NOT_TESTED.

Executed offline comparison loads the **actual merged12F module** via `git show` and runs the current production assessor on synthetic non-personal endpoints with repository original area geometry. No simplified baseline implementation, engine/HTTP timing or Contabo claim. Engine n=0. Reproduce: `.venv/bin/python scripts/benchmark-phase12fb-origin.py`.

|Scenario|n per version|12F median / p95 / max ms|Current median / p95 / max ms|
|---|---:|---|---|
|normal_numeric|25|0.008 / 0.023 / 0.074|0.008 / 0.012 / 0.02|
|large_dataset|25|146.068 / 153.158 / 156.694|63.466 / 86.121 / 98.494|
|multi_stop|25|428.352 / 443.979 / 450.808|86.152 / 115.39 / 121.841|
|fresh_request_same_cached_geometry|25|150.782 / 206.088 / 254.794|62.229 / 87.884 / 94.555|
|recalculation_relocated|25|140.497 / 143.889 / 145.432|65.252 / 88.939 / 89.099|
|concurrent_4|16|424.916 / 1166.955 / 1166.955|297.397 / 531.386 / 531.386|

Normal numeric work is effectively unchanged. Mandatory scans and multi-stop requests improve through one immutable request-local preparation and envelope filtering; freshness is not cached away. The cached scenario represents a fresh assessment of identical cached geometry, **not persistent DB I/O latency**. Recalculation uses a synthetic relocated geometry. Concurrent scenario uses four bounded local threads/16 finite tasks; per-task durations exclude executor queue wait and are affected by Python GIL/scheduling. It is not service capacity/p95 evidence. Source parsing, warm imports, GC, process/CPU contention and hardware limit transferability. No speedup percentage or production SLO is claimed.

Worst-case full preparation remains nonzero and required. Proposed global prepared geometry/cache was not added; it would need reliable source/graph identity invalidation and concurrency evidence. Cooperatively checked limits/cancellation remain; CPU checks are not hard preemption. Live engine startup/import/route latency, RSS/CPU, sustained requests, real cache and device moving-route costs remain NOT_TESTED.
