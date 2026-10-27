# Phase 6 — validation and performance

Date: 2026-10-27. Baseline: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` (latest fetched main; Phase 5 PR #341 merged). Branch: `codex/phase6-uk-navigation-accuracy`. **PHASE6_PARTIALLY_VERIFIED; production NO-GO.** No deployment, production access/data/configuration change or paid provider call.

## Exact local results

- CI Python file selection (including `tests/test_phase6_navigation_evidence.py`): **662 passed + 68 subtests**, 6.37 s; no failures/skips.
- Additional GraphHopper costing/hazard/fallback/request, cache-key and PWA static checks: **40 passed**, 0.58 s; no failures/skips. These are separate files from the CI selection.
- Legacy PWA speed-warning endpoint checks: **4 passed**, 0.39 s; revised to require unknown rather than invented road-class law.
- Jest configured coverage run: **91 suites / 1,856 tests passed**, 4.574 s; no failures/skips, configured coverage thresholds passed (82.53% statements / 75.55% branches / 81.26% functions / 84.43% lines overall).
- Isolated PostgreSQL migration/session-policy tests: **11 passed**, 0.689 s. No production DSN.
- Test lint: passed. Final whitespace and staged security-pattern review are recorded in the PR validation.

Commands: `.venv/bin/python -m pytest -q` with the exact file list in `.github/workflows/ci.yml`; `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`; `/tmp/voyagr-sql-tools/bin/python scripts/test-dashcam-session-sql.py`. Additional Python files: `test_graphhopper_costing_parity.py`, `test_graphhopper_hazard_parity.py`, `test_graphhopper_fallback.py`, `test_graphhopper_route_request.py`, `test_route_cache_key.py`, `test_pwa_index_and_sherpa_static.py`.

Original baseline: 629 Python +68 subtests and 1,828 JS tests. Final changes add 33 Python and 28 JS cases. Intermediate failing runs included deliberately unsafe old public expectations, contradictory voice fixtures and a test returning new route identity on every read. Candidate numeric/private legacy checks remain while public assertions now require evidence. A new arrival test initially expected the wrong action spelling (`end_navigation` vs product `end`); corrected without changing product semantics. An initial all-test pass still failed the configured lane coverage gate: disconnected second-exit pinning functions were now dead. Removing that obsolete unsafe implementation restored coverage without lowering thresholds. A final review also added a regression preventing candidate defaults from overwriting MAPPED_CONDITIONAL provenance. Final selected runs above have no failures. The complete historical tests directory includes live services/custom routing/Kivy and was not all executed. Kivy application/device acceptance and installed graph/real provider validation are NOT VERIFIED.

## Performance (local CPU milliseconds)

Reproduce Node timings: `node scripts/benchmark-phase6.cjs`. Python measurement calls canonical `legal_speed_evidence` 1,000 times after 20 warmups with fixed mapped context and no I/O. Raw runtime/CPU/results: [VOYAGR_PHASE6_PERFORMANCE.json](VOYAGR_PHASE6_PERFORMANCE.json). Node 24 on AMD EPYC 9V74 Linux; shared cloud host, results are not mobile performance guarantees. Node tests use 200 samples after 20 warmups, complete replay uses 50. Manoeuvre timing includes constructing its input. JSON timing measures serialization/deserialization, not IndexedDB IO. Route matching scans all segments (linear complexity); spatial indexing may be needed for larger geometry after device measurements.

| Operation | Median ms | p95 ms | Max ms |
|---|---:|---:|---:|
| route_matching_100_segments | 0.024597 | 0.135665 | 0.508388 |
| route_matching_1000_segments | 0.079991 | 0.361646 | 0.516159 |
| route_matching_10000_segments | 0.956384 | 1.455478 | 3.520221 |
| provider_lane_parsing | 0.000481 | 0.000962 | 0.066831 |
| manoeuvre_lookup_1000 | 0.038227 | 0.158950 | 0.908912 |
| turn_instruction | 0.000150 | 0.000230 | 0.002574 |
| persisted_state_JSON | 0.054552 | 0.190648 | 0.318942 |
| complete_16_scenario_replay | 0.137427 | 0.380064 | 0.469689 |
| legal_speed_evidence_no_network | 0.002864 | 0.003265 | 0.132282 |

No provider/network, DOM rendering, audio scheduling latency, actual GPS service cost, battery drain or device memory was measured. Voice text consistency is tested; scheduling performance is not verified. Full engine latency remains subject to Phase 5 limitations. No claim of production accuracy/security from mocks or microbenchmarks.
