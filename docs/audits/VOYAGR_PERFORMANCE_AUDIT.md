# Voyagr performance and resource audit

## Actual measurements

Python 3.12.14 / Node 24.19.0 in this cloud machine. Synthetic in-process timeit, five repeats, median per invocation:

| Operation | Iterations/repeat | Median | Minimum |
|---|---:|---:|---:|
| Decode precision-5 route polyline with 10,000 points | 100 | 5.445ms | 5.236ms |
| Build route cache key with 20 via points | 1,000 | 0.0140ms | 0.0139ms |

Input: points `(51.5 + i*0.00001, -0.1 + i*0.00001)` encoded with polyline, decoded by `voyagr.utils.geometry.decode_route_geometry`; cache key uses auto/petrol_diesel and 20 synthetic via points. These are reproducible microbenchmarks, not HTTP throughput or mobile frame-time measurements. Machine-readable measurements are in VOYAGR_MEASUREMENTS.json. There is no measured before/after speedup and no performance refactor was justified by these results.

## Structure and plausible hotspots

Discovery counted 1,375 tracked files, 331 Python and 248 JavaScript files. Measured source lengths at profiling time: satnav.py 10,926; voyagr_web.py 2,347; voyagr-app.js 3,128; route-selection.js 4,663 lines. Length alone does not establish a bottleneck; no sweeping rewrite attempted.

- Routing: serial GraphHopper/Valhalla retries, preference-alternative enrichment, TomTom and Overpass can dominate latency. Individual timeouts do not provide an end-to-end deadline. Failure paths should have total budget/cancellation and per-engine latency histograms.
- Geometry/hazards: route decoding and hazard scoring may repeat per alternative. Profile representative dense camera corridors before indexing/reusing geometry. Existing tests verify scoring outputs, not a route-quality/performance bound.
- GPS/rendering: every accepted tick can trigger snapping, marker/camera and geometry/proximity work. Cached route projection/spatial indexes and lower-priority refresh throttling merit real device traces; new invalid-fix rejection only avoids work for rejected data, with no measured battery/performance claim.
- Network: auto-GPS timer, live traffic/hazard refresh and resume recovery can overlap. Existing auto-GPS tests verify one timer per module, not aggregate network consumption across the app.
- SQLite: route/hazard caches, initialization and shared services need concurrency/load measurements. No production EXPLAIN or database load performed. Preserve user isolation and correct invalidation before optimizing hit rate.
- Memory/tasks: caches and browser listeners/timers need long-session leak testing. Gunicorn imports differ from __main__ monitoring startup; live processes are not snapshot state. No mobile battery or heap profile recorded.

Recommended next measurement: offline/replay-driven browser trace on a representative Android device, plus mocked worst-case provider timeout/request count and actual route-length/hazard-count distributions. Set budgets from evidence before changing update rates or data structures.
