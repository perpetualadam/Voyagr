# Phase12C — 128 versus137 reconciliation

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

The repository area export has128 features and128 IDs; the point export has8301 records. Phase12B reproduced and fixed an environment count precedence defect: when the file is loaded, its actual feature inventory takes precedence over `GRAPHHOPPER_CAMERA_AREAS_COUNT=137`. The existing regression was rerun unchanged.

The observed Contabo137 log is **not reconciled**. It could be a stale deployed revision, configured fallback count, another source/version, dynamic sections or a grouping difference.128 area features and137 road sections need not be the same unit. No automatic conversion, dropping nine records, graph rebuild or production data repair is justified.

Prior operator attestation proves installed original file SHA, not active application loader revision or running graph import identity. `camera_points.json` provenance lacks authoritative direction/road/source timestamps; nearby/opposite-road associations remain uncertain.106 duplicated point positions and seven references with multiple positions were documented in Phase12B; these are not proof of duplicate driven-road encounters.

Use the bounded read-only procedure in the operator report: compare application revision, allowlisted count/path settings, loader source names, file hashes, feature/component inventories and graph import receipts. Retain original source identity and acquisition times locally; share only redacted aggregate findings. Actual active runtime source, any dynamic source and reason for137 remain NOT_TESTED.
