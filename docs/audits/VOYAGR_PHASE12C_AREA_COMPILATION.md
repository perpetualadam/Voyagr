# Phase12C — Area identifiers and compilation

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

## Offline PASS; installed compilation NOT_TESTED

`VOYAGR_PHASE12C_OFFLINE_DISCOVERY.json` resolves the candidate by matching the manifest SHA against sibling GeoJSON files; the Phase12B manifest has no candidate path field. Exactly one match is required. It verifies source hash, all128 unique IDs `camera_area_0`–`camera_area_127`, unchanged non-geometry properties, candidate validity and exact per-feature geographic union equivalence. No dataset is rewritten.

Original SHA256: `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`.
Candidate SHA256: `6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7`.

The offline artifact explicitly lists **256 NOT_TESTED expression results**,128 per dataset. Unit tests verify all128 exact `in_camera_area_N` expressions with `multiply_by: "0"`; this is construction evidence only. Re-executed official GH8 JSON/JTS checks are in `VOYAGR_PHASE12C_PARSER.json`: candidate128 and mixed140 areas accepted; original102 invalid features rejected as expected. This is **not** runtime custom-model compilation.

The operator runner requires two isolated high-port literal-loopback services, reviewed import receipts, graph revisions and common build/road/profile/encoded-value provenance. Fresh `/info` must advertise8.0 and car, the complete canonical encoded-values SHA must match the reviewed metadata receipt on both services and recognised capabilities must match, and any native `graph_revision` must match the attestation. Graph/profile/import binding absent from native metadata remains **operator attestation**, never upgraded to engine proof. The runner records that limitation.

Each batch first sends three rejection controls: nonexistent area, malformed expression and unsupported value (toll when absent, otherwise a sentinel value). Ignored or unclassified controls stop the batch. Area batches are at most16 per instance. ROUTE means REQUEST_ACCEPTED_ENFORCEMENT_UNVERIFIED; genuine NO_PATH remains NO_PATH_COMPILATION_UNVERIFIED because a failing route alone cannot prove compiler ordering. Other failures produce nonzero CLI exit. Inspect every result; no automatic candidate acceptance.
