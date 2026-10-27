# Phase 7 — performance and resource observations

Date: 2026-10-27. **PHASE7_PARTIALLY_VERIFIED — production NO-GO.** Latest main at start: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a`. Phase 6 PR #343 was open, CI green; Phase 7 branch `codex/phase7-directional-road-matching` includes its dependency commit `c5c67686541a7dcb30f3d82d5d24d1a2f2b27951`. Phase 7 changes are reviewed relative to that commit; inherited Phase 6 work is not newly implemented Kivy/native work. No Phase 7 Kivy/Android changes, VPS access, production configuration/data change, deployment or paid API call.

Reproduce: `node scripts/benchmark-phase7.cjs`. Raw observations: [VOYAGR_PHASE7_PERFORMANCE.json](VOYAGR_PHASE7_PERFORMANCE.json). Node 24.19.0, Linux, AMD EPYC 9V74 shared cloud CPU. Twenty warmups; 300 samples per operation except 30 index builds and 100 complete 20-case replays. Milliseconds, no network/provider/DOM/audio/device calls.

| Operation | Median ms | p95 ms | Maximum ms |
|---|---:|---:|---:|
| candidate_generation_100_segments | 0.004777 | 0.010636 | 0.443851 |
| directional_matching_100_segments | 0.011597 | 0.049104 | 0.260554 |
| index_build_100_segments | 0.031898 | 0.113452 | 0.160933 |
| candidate_generation_1000_segments | 0.002133 | 0.004367 | 0.295637 |
| directional_matching_1000_segments | 0.010446 | 0.028824 | 0.699918 |
| index_build_1000_segments | 0.230498 | 0.806989 | 0.929134 |
| candidate_generation_10000_segments | 0.003926 | 0.004698 | 1.804195 |
| directional_matching_10000_segments | 0.023275 | 0.067692 | 0.770414 |
| index_build_10000_segments | 3.426496 | 5.773325 | 7.755465 |
| road_attribute_lookup | 0.000361 | 0.000411 | 0.002664 |
| hazard_association | 0.000351 | 0.000471 | 0.020071 |
| route_progress_lookup | 0.000221 | 0.000280 | 0.043375 |
| 20_scenario_pipeline_replay | 0.692706 | 1.951298 | 2.373665 |

| Network segments | Grid cells | Observed heap delta bytes |
|---|---:|---:|
| 100 | 3 | 110440 |
| 1000 | 25 | 645464 |
| 10000 | 125 | 1945584 |

Heap deltas are noisy process observations (GC/shared runtime), not peak allocations, retained memory guarantees or mobile measurements. Source construction is bounded; hot matching queries only nearby grid cells and caches the source index. Route binding uses direct source-segment lookup rather than scanning the source network. Active-route geometry compatibility still scans the route; existing Phase 6 matching is also linear in active-route size. Source/route index construction should remain outside repeated matching. High-density competing roads increase query work and intentionally remain ambiguous; no artificial nearest-only candidate cap hides uncertainty.

The operational source tile limit is 1,000 ways /2 MiB, 100,000 core segments /200,000 grid references; GPS hot path introduces no network call. Context refresh is bounded to once per 30 s and request timeout 4 s. These are documented software guardrails, not proven mobile budgets. Real PWA throughput, large-route DOM work, source-file IO under concurrency, proxy rate limits, memory peaks and battery require acceptance on actual deployment/devices. No claimed battery improvement.
