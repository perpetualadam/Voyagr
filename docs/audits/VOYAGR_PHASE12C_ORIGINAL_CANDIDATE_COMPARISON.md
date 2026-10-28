# Phase12C — Original versus candidate

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

| Comparison | Result / evidence |
|---|---|
| Original unchanged / candidate separate | PASS, git and SHA checks |
| Features and identity | PASS,128 each, exact IDs/properties |
| Components | Original8301; candidate6452 (Phase12B metrics reproduced) |
| Invalid MultiPolygons | Original102; candidate0, GEOS/JTS |
| Duplicate source components |106, preserved geographic union |
| Per-feature union / coverage loss / expansion | PASS, exact equality, zero difference |
| Both datasets load in GH8 engine | NOT_TESTED |
| All128 expressions compile per imported graph | NOT_TESTED |
| Edge exclusions / availability / geometry / distance / duration / instructions | NOT_TESTED |
| No-path and boundary parity | NOT_TESTED |

Original invalidity may have caused undefined or unexpected engine handling, but no actual routing difference has been observed here. Geographic equivalence does not prove GraphHopper treats invalid and valid representations equivalently.

Paired plans must attest identical engine build, source roads, car/custom profile, encoded values, request parameters and reviewed oracle. Only area dataset/import binding differs. Import receipts must explain each graph revision and the source area SHA used; native `/info` generally cannot attest installed custom-area contents. File SHA alone is insufficient proof that a running graph loaded those bytes.

The runner compares route availability, complete geometry in returned alternative order, distance/duration deltas, manoeuvre sequences and exposed edge sequences. Different alternative order/ties are reported, not automatically called regressions. Missing edge details remain NOT_TESTED. No raw coordinates, street names, instructions, model bodies or provider error messages are written to its reports. Private fixtures stay operator-local.

Mandatory gate and primary ranking code is untouched. The candidate remains opt-in offline data. No source/candidate regeneration or application runtime dataset switch was made.
