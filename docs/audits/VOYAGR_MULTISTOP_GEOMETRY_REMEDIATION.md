# Phase 5 — multi-stop geometry remediation

**Geometry software remediation: verified by deterministic integration tests. Real-road/device behavior remains unverified. Overall Phase 5 PARTIALLY_VERIFIED; production NO-GO.**

## Root causes and before/after

| Confirmed issue | Before | After |
|---|---|---|
| Optimized summary | `all_geometry[0]` selected as journey geometry | Decode/validate every leg, stitch in optimized visit order and emit complete polyline6 summary |
| Normal/recovery/preference Valhalla parsers | Separate first-leg selection logic | Shared multi-leg geometry normalization, including every alternate independently |
| Manoeuvre alignment | Concatenate leg-local shape indices unchanged | Journey indices offset into the stitched shape; original per-leg indices remain local; leg_index retained |
| Missing/invalid leg | Haversine estimate or another good leg could leave a partial journey | Explicit INCOMPLETE_ROUTE, geometry_complete=false and automatic_selection_allowed=false; no connector fabricated and no optimized fall-through that skips visits |
| Geometry/assessment mismatch | Valid first leg could hide a partial summary | Recompute all leg assessments and compare reconstructed journey with selected summary; mismatches fail the geometry gate |
| Reroutes | Request went directly to final destination | Retain outstanding stop identities/durations in visit order, with preserve_stop_order; completed visits removed using route progress |
| Non-optimized requests | Greedy reorder despite no optimization request | Preserve supplied visit order |
| Round trip | Geometry returned to origin but end metadata retained unused end | Returned destination metadata points to origin |
| Stale assessments in browser | No binding between geometry and assessment | Matching geometry checksum required; changed geometry requires recalculation and cannot be manually overridden |

## Geometry contract and compatibility

`journey_geometry.py` accepts polyline precision 5/6, lat/lon coordinate arrays and GeoJSON LineString/MultiLineString (GeoJSON is lon/lat). All returned complete multi-stop summaries and display legs use polyline6; converting precision5 does not create extra source accuracy. Original source precision is recorded. Adjacent boundaries within 2 m are treated as quantization-equivalent, retain the earlier boundary and drop the repeated first vertex. Larger gaps fail instead of synthesizing road links. A leg endpoint must match its assigned waypoint within 75 m to accommodate provider snapping; these are explicit tolerances, not a promise of correct road/lane association. Invalid/non-finite/reversed coordinates, degenerate/missing legs and invalid manoeuvre indices fail validation. Polygon/complex junction/legal routing accuracy remains dependent on the graph.

Existing `legs`, `all_geometry`, `all_maneuvers`, totals and route-option shape remain. Added fields: `geometry_complete`, `leg_geometry_ranges`, per-manoeuvre `leg_index`, `intermediate_arrival`, source precision and per-assessment geometry binding. Each range carries waypoint/stop identity. Complete summary replaces the broken first-leg geometry; this is an intentional compatible correction, not a separate API version. The existing formatter unit fixture now supplies the new core-produced summary fields; its original output assertions were retained.

Distances/durations remain per-leg and aggregated at journey level; stop duration remains included in total time. Stop identity, original index, sequence and visit order are retained. Intermediate arrival manoeuvres are tagged while final completion uses whole-journey remaining distance. Client stop/reroute progression remains GPS-derived rather than proof a service stop was completed; ambiguous snap/loop/closely spaced stop behavior still needs device acceptance.

The independent evaluator validates all legs, aggregates worst enabled status and binds the aggregate to the actual journey geometry. Every alternative has separate evidence; a later conflict cannot be hidden by an earlier compliant leg. Cached first-leg-only journeys are rejected on reassessment. Requested visits and multi-stop start/destination are checked geometrically at the HTTP boundary, so fallback omissions cannot silently become a complete journey. Checksums use FNV-1a over quantized vertices for consistency only: they are not cryptographic authentication, do not replace server verification and are not a security boundary.

## Frontend consumers and validation

- `route-selection.js` carries complete geometry, precision, ranges and selected assessment into preview/navigation state.
- MapLibre route layers and per-leg drawing consume canonical polyline6. Tests invoke real selection and waypoint layer-plan functions and assert the last leg's final coordinate is present. A real GPU/browser rendering pass is not claimed.
- Route geometry/progress functions calculate remaining distance against all legs. At the first stop the shared fixture has more than 600 m remaining and arrival is `none`; at the final destination remaining distance is below 1 m and arrival is `end`.
- Global manoeuvre indices drive turn-step lookup, lane/instruction association and GPS snapping across boundaries. Existing lane/GPS/ETA/deviation suites remain in regression validation; no new real-world lane accuracy claim is made.
- Automatic GPS/traffic reroutes preserve outstanding ranges/stops. `preserve_stop_order` requests route through the multi-stop builder without reoptimization. Phase 4 mandatory gates, snapshots, stale response exclusion, explicit offline acceptance and camera/dashcam protections remain.
- Existing offline persistence may lack full new range metadata. Such legacy mandatory routes remain unverified and gated; upgraded multi-stop/offline stop-state persistence and real-device resume acceptance remain outstanding.

Deterministic scenarios cover 2/3/5 stops, optimized ordering, shared boundaries, precision5/6, GeoJSON, missing/invalid/disconnected/reversed geometry, indices, total distance/time, intermediate/final-leg cameras, mismatched/cached summaries, omitted visits, reversed visit order on one segment, round trips, normal/recovery/preference parsers, actual Flask response shaping and frontend progress/selection. Providers are mocked; road-network ground truth is not fabricated. Exact final counts are in [test results](VOYAGR_PHASE5_TEST_RESULTS.md).

## Changed areas and deployment

Core: `multidrop.py`, `journey_geometry.py`, `route_entries.py`, `valhalla_parsing.py`, `request_params.py`, `integrity.py`, `integrity_api.py`, `voyagr_web.py`. Browser: avoidance-integrity, route-selection, calculate/GPS/traffic orchestration and versioned template assets. Tests include real core/HTTP/browser processing boundaries with synthetic UK fixtures. No migrations, new paid calls, production database updates or deployment occurred.

Deploy only through normal review after checks, then verify a complete updated client shell and all-leg navigation with isolated graph fixtures and real devices. Partial-leg navigation must not be restored as a fallback. Desktop direct-provider/Kivy parity remains unverified.
