# Phase12C — Graph-backed enforcement

Scope: Phase12C at Phase12B base `9363d3c05a183c96b65572330504e25fa9df3548` (PR355). Decision **PHASE12C_PARTIALLY_VERIFIED**; dataset **CANDIDATE_NOT_VERIFIED**; production **NO-GO**. No production access, deployment, dataset change, graph rebuild or service restart. GraphHopper remains the preferred first eligible Optimised engine; independent mandatory gates, Valhalla alternatives and honest OSRM fallback remain unchanged. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory and execution boundaries.

## Acceptance matrix

| Area | Synthetic harness | Actual engine |
|---|---|---|
| Full segment crossing between vertices | PASS | NOT_TESTED |
| Hole versus excluded interior | PASS | NOT_TESTED |
| Boundary-only contact | PASS | NOT_TESTED |
| Unknown area / invalid expression / unsupported value classification | PASS | NOT_TESTED |
| Multiple area hard-zero composition | PASS | NOT_TESTED |
| True no-path versus validation/HTTP failure | PASS | NOT_TESTED |
| Expired budget / late response / no retry | PASS | NOT_TESTED |
| Hard-zero edge exclusion and partial edge semantics | No synthetic claim | NOT_TESTED |
| Parallel/opposing roads, slips, bridges, junction topology | No reviewed oracle | NOT_TESTED |
| Camera+OSM, camera+CAZ, supported preferences | Existing composition regressions PASS | NOT_TESTED |
| Mandatory uncertainty/cache reassessment/GH-first | Existing application regressions PASS | No device/live claim |

The runner uses Shapely LineString/Polygon relations over **all route segments**, including holes and multiple polygons. It separately reports interior intersection and boundary-only contact. It does not substitute vertex sampling or the older replay helper's simple-ring oracle. Boundary policy must be reviewed explicitly. Output is geographic evidence, not grade-separated or directional road identity proof; bridge/tunnel and opposing carriageway cases require graph-backed edge/direction evidence.

Every reviewed fixture declares expected baseline relation INTERIOR, BOUNDARY or OUTSIDE. A baseline route must exist and match that relation; otherwise a harmless outside route cannot pass as an avoidance demonstration. Every returned restricted alternative is checked. HTTP200 is not compliance. Only a400/404 hint with the exact GraphHopper ConnectionNotFoundException is classified NO_PATH; generic400, HTML504, malformed JSON and provider errors never mean no compliant road exists.

`multiply_by: 0` is preserved exactly. Whether GH8 actually makes relevant edges inaccessible, how preprocessing affects this and whether partial/boundary intersections are excluded remain **NOT_TESTED**. Graph acceptance never sets application SATISFIED. Independent integrity and mandatory navigation gates remain authoritative.

Optional `details.edge_id` evidence can be compared with a reviewed blocked-edge oracle and between instances. If absent it is NOT_TESTED. Even when present PATH_DETAILS_ONLY does not establish a complete graph membership proof; snapping/edge splitting and directions require operator inspection. Geometry simplification is disabled through `way_point_max_distance=0`, but output geometry still is not a full graph dump.
