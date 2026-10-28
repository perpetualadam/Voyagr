# Phase12C — Engine discovery

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

## Evidence

Workspace discovery is recorded in `VOYAGR_PHASE12C_ENGINE_DISCOVERY.json`. Java and Docker CLI exist; Maven does not. No listeners on default engine ports8989/8990/8002, no `/opt/graphhopper` or `/workspace/graphhopper` installation, and no approved OSM extract, imported graph or independently reviewed road oracle were supplied. Docker read-only container/image inspection returned1: unavailable or denied, **not proof of an empty daemon**. Repository and known temporary parser directory searches found parser libraries, not a runnable routing service/graph.

`/tmp/voyagr-gh8-parser` contains six checksum-verified GraphHopper8 web-api/Jackson/JTS jars. These are sufficient for offline deserialization and geometry validity, not expression compilation against a profile or graph routing. No engine was downloaded, installed, started or inferred from those jars. No private network/VPN was available. Contabo was not probed.

Phase12B PR355 and its main CI were confirmed merged/passing before this branch. User/operator evidence establishes installed original SHA and GraphHopper8/car/custom plus one area reference; these remain attributed prior observations, not new measurements. The active graph revision, imported area identities and all-area runtime acceptance remain NOT_TESTED.

## Disposition

No approved isolated graph-backed service can be used in this execution. A default-off paired acceptance runner is supplied. Actual graph-backed acceptance, not additional synthetic maps, is the next evidence requirement.
