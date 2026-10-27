# Phase 8 — performance and reliability

Date: 2026-10-27. **PHASE8_PARTIALLY_VERIFIED — production NO-GO.** Integration baseline: latest main `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` plus existing Phase 6 `c5c67686` and Phase 7 `0701f4df`; these changes are not present on fetched main. PR refs #343/#344 still point to those commits; current PR state/rules cannot be read because GitHub API access returns HTTP 403. Phase 8 branch: `codex/phase8-evidence-and-pwa-acceptance`, based on `0701f4df`. No previous changes duplicated. No Contabo access, production configuration/database/graph/service mutation, deployment, paid API call, Kivy/native Android change or deployment automation change.

All measurements here are **synthetic local CPU** observations, not Contabo, graph-backed or device measurements. Python 3.12/Linux and Node 24/AMD EPYC 9V74 shared cloud machine. Reproduce: `.venv/bin/python scripts/benchmark-phase8-evidence.py` and `node scripts/benchmark-phase7.cjs`. Raw JSON: [Python](VOYAGR_PHASE8_PERFORMANCE_PYTHON.json), [frontend](VOYAGR_PHASE8_PERFORMANCE_FRONTEND.json).

Python uses 3 warmups/20 samples and one separately traced call for peak allocation; QC includes full source index construction and runs on source load, not every fix. Node uses 20 warmups/300 samples except 30 index builds and 100 complete 20-case replays. Frontend uses the actual modified matcher and existing replay/attribute/hazard/progress helpers.

| Operation | Samples | Median ms | p95 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| JSON_parse_100_segments | 20 | 0.040942 | 0.099080 | 0.099080 |
| evidence_QC_and_index_100_segments | 20 | 0.220874 | 0.444942 | 0.444942 |
| JSON_parse_1000_segments | 20 | 0.536780 | 0.951196 | 0.951196 |
| evidence_QC_and_index_1000_segments | 20 | 2.455407 | 3.145009 | 3.145009 |
| JSON_parse_10000_segments | 20 | 6.165064 | 13.598293 | 13.598293 |
| evidence_QC_and_index_10000_segments | 20 | 31.390442 | 61.858231 | 61.858231 |
| candidate_generation_100_segments | 300 | 0.004366 | 0.011507 | 4.123845 |
| directional_matching_100_segments | 300 | 0.014071 | 0.065309 | 0.325601 |
| index_build_100_segments | 30 | 0.053241 | 0.127503 | 0.472213 |
| candidate_generation_1000_segments | 300 | 0.002123 | 0.003225 | 0.342427 |
| directional_matching_1000_segments | 300 | 0.010626 | 0.041102 | 0.422488 |
| index_build_1000_segments | 30 | 0.337870 | 0.985838 | 2.070476 |
| candidate_generation_10000_segments | 300 | 0.004077 | 0.005068 | 1.823202 |
| directional_matching_10000_segments | 300 | 0.021632 | 0.044658 | 1.242005 |
| index_build_10000_segments | 30 | 4.488306 | 8.957512 | 15.359507 |
| road_attribute_lookup | 300 | 0.000621 | 0.000942 | 0.046340 |
| hazard_association | 300 | 0.000911 | 0.001211 | 0.052670 |
| route_progress_lookup | 300 | 0.000381 | 0.000541 | 0.178299 |
| 20_scenario_pipeline_replay | 100 | 1.108694 | 1.667207 | 6.081010 |

At 10,000 segments Python parse peak traced allocation was 2,857,018 bytes, QC/index 4,348,816 bytes. Node raw heap deltas are noisy observations, not peak/device guarantees. New source QC costs 31.390 ms median at this size; indexed matching 0.021632 ms median /0.044658 ms p95. No measured physical battery or memory improvement is claimed.

No actual road-context acquisition, routing-engine response, Contabo latency or physical-browser processing was measured. Existing selected-route/hazard/multi-stop regression behavior passes; earlier synthetic full route timings remain historical Phase 5/7 evidence, not new engine benchmarks. Requests are sequential, explicitly approved, timeout/size bounded and never production load tests. Stream read timeouts are inactivity limits, not a guaranteed total deadline against a trickling peer.
