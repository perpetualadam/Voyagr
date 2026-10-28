# Phase12C — Release and dataset decision

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

**CANDIDATE_NOT_VERIFIED.** No production replacement or deployment is authorised. GraphHopper remains installed/operational with the existing original and retains preferred eligible primary ordering regardless of candidate status.

| Acceptance gate | Status |
|---|---|
| Candidate identity, properties, validity and geographic equivalence | PASS offline |
| Official JSON/JTS compatibility | PASS offline; not compiler evidence |
| Installed all-area custom-model compatibility | NOT_TESTED |
| Actual graph-backed geographic/edge exclusions | NOT_TESTED |
| Original/candidate route and boundary parity | NOT_TESTED |
| No unexplained edge regressions | NOT_TESTED |
| Backup and rollback review | Procedure proposed; operator review NOT_TESTED |
| Required automated suites | See test results and GitHub PR |
| Production physical-device and independent release criteria | NOT_TESTED |

Candidate invalidity was repaired in12B without coverage change. This phase found no demonstrated application routing defect requiring a rewrite. It adds refusal-safe acceptance tools and evidence boundaries. Tests cannot resolve missing graph evidence.

Before any separately authorised replacement, operator must record immutable original/candidate/graph/config hashes, verify a secured backup and rollback copy of the original, establish exact load/reload requirements without executing them under this audit, review paired results and resources, and independently approve any later deployment/rollback operation. Do not install candidate as part of acceptance. No automatic engine demotion is permitted.

Recommended next phase: bounded operator-owned isolated GH8 paired acceptance with independently reviewed road/edge fixtures, all128 expressions, boundary/partial-edge/no-path and topology cases, accurate graph/import binding and resource measurements. Reconcile137 provenance separately. Then reassess dataset deployment review and remaining physical-device/release gates; no broad routing rewrite is warranted from current evidence.
