# Phase 9 — performance and reliability

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

All executed measurements are **SYNTHETIC_LOCAL_CPU** on this shared Codex machine: Python 3.12.14, Node 24.19.0, Linux x86_64, Intel Xeon Platinum 8573C. Not Contabo, real graph, real road, network, physical-device or battery measurements. No actual source acquisition/engine latency can be measured without source/services. No full browser GPS/rendering/IndexedDB latency claimed.

Reproduced with `.venv/bin/python scripts/benchmark-phase8-evidence.py`, `node scripts/benchmark-phase7.cjs`, `.venv/bin/python scripts/benchmark-phase5-routing.py`, `node scripts/benchmark-phase5-frontend.cjs`, and `node scripts/benchmark-phase9-offline.cjs`. Raw artifacts: `VOYAGR_PHASE9_PERFORMANCE_PYTHON.json`, `VOYAGR_PHASE9_PERFORMANCE_FRONTEND.json`, `VOYAGR_PHASE9_PERFORMANCE_JOURNEY_PYTHON.json`, `VOYAGR_PHASE9_PERFORMANCE_JOURNEY_FRONTEND.json`, `VOYAGR_PHASE9_PERFORMANCE_OFFLINE.json`.

Python evidence benchmark: 3 warmups/20 samples, separately traced allocation. Node matcher: 20 warmups/300 samples, except 30 index builds/100 complete 20-scenario replays. Flask: 20 actual Flask test-client requests per case with provider/acquisition/cache transport mocked and in-memory preferences; nested stage distributions are not additive. Frontend journey: 200 samples, five synthetic vertices. Offline restore: 20 warmups/200 samples using actual helpers plus mandatory/fresh-GPS assertions; first harness attempt lacked the browser integrity binding and used an invalid assessment fixture, so it failed its guard. Corrected harness uses the same valid binding/assessment contract as the product regressions; no application fix was needed. Reported CPU restore excludes storage I/O. Percentiles use each existing script's sorted-sample convention; small samples/shared scheduling produce noisy tails. No statistical speedup claim or benchmark CI threshold added.

| Operation | Samples | Median ms | p95 ms | Maximum ms |
|---|---:|---:|---:|---:|
| JSON_parse_100_segments | 20 | 0.046426 | 0.094961 | 0.094961 |
| evidence_QC_and_index_100_segments | 20 | 0.260187 | 0.358457 | 0.358457 |
| JSON_parse_1000_segments | 20 | 0.620603 | 0.883389 | 0.883389 |
| evidence_QC_and_index_1000_segments | 20 | 2.897695 | 6.796071 | 6.796071 |
| JSON_parse_10000_segments | 20 | 6.575170 | 8.647375 | 8.647375 |
| evidence_QC_and_index_10000_segments | 20 | 34.673715 | 51.586271 | 51.586271 |
| candidate_generation_100_segments | 300 | 0.007524 | 0.012577 | 0.530508 |
| directional_matching_100_segments | 300 | 0.025053 | 0.134692 | 1.217301 |
| index_build_100_segments | 30 | 0.063393 | 0.459381 | 0.510639 |
| candidate_generation_1000_segments | 300 | 0.002368 | 0.003922 | 0.158062 |
| directional_matching_1000_segments | 300 | 0.012024 | 0.030939 | 0.623491 |
| index_build_1000_segments | 30 | 0.633943 | 3.971648 | 10.977123 |
| candidate_generation_10000_segments | 300 | 0.004089 | 0.007124 | 3.203363 |
| directional_matching_10000_segments | 300 | 0.026842 | 0.267967 | 9.816998 |
| index_build_10000_segments | 30 | 5.580143 | 14.353720 | 17.822599 |
| road_attribute_lookup | 300 | 0.000470 | 0.000506 | 0.034953 |
| hazard_association | 300 | 0.000550 | 0.001064 | 0.220188 |
| route_progress_lookup | 300 | 0.000252 | 0.000452 | 0.515704 |
| 20_scenario_pipeline_replay | 100 | 1.236054 | 6.705237 | 7.401720 |
| Flask_single | 20 | 1.899000 | 2.577000 | 4.200000 |
| Flask_three_stops | 20 | 3.035000 | 3.274000 | 3.553000 |
| Flask_five_stops | 20 | 3.957000 | 5.226000 | 6.520000 |
| Flask_alternatives | 20 | 2.213000 | 2.808000 | 3.412000 |
| Flask_cached | 20 | 1.101000 | 1.493000 | 21.911000 |
| Flask_failover | 20 | 1.236000 | 1.980000 | 2.137000 |
| Flask_large_hazards | 20 | 1214.381000 | 1266.645000 | 1288.193000 |
| frontend_journey_1_alternatives | 200 | 0.010092 | 0.074776 | 0.720213 |
| frontend_journey_3_alternatives | 200 | 0.009997 | 0.029520 | 0.574514 |
| in_memory_offline_restore | 200 | 0.007461 | 0.031744 | 0.566095 |

Evidence acquisition, graph-backed engine response/enforcement, live Contabo latency, physical GPS processing/background behavior, battery and actual offline continuation remain **NOT_MEASURED**. Do not derive production sizing or mobile reliability from these local CPU numbers. For future approved measurements, pin versions/digests, use sequential bounded queries, retain raw samples and distinguishing oracles, record failures/timeouts and report sample counts/median/p95/max separately by environment.
