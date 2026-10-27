# Voyagr routing and lane reliability audit

## Active architecture

`voyagr_web.py:calculate_route` validates/parses input, looks up memory/persistent caches, prepares cameras/incidents/OSM hazards, attempts GraphHopper camera/custom-model routing, builds Valhalla requests, enriches alternatives, scores hazards and formats a common response. Valhalla is the main general routing path; GraphHopper is attempted early for suitable camera avoidance and also contributes an Optimised candidate. Recovery uses reduced Valhalla payloads; OSRM is the final public fallback. `routing_engines.py` is a separate provider abstraction, not the complete active Flask pipeline. Local Valhalla/GraphHopper endpoints and public OSRM are configuration defaults; no local routing graph was built or real provider route validated.

Valhalla `orchestrator.py` owns payloads, transport outcomes and parsing; `engines.py` owns GraphHopper/traffic helpers; `enrichment.py`, `discovery.py` and `optimised_route.py` generate and merge preference alternatives. `route_cache_key.py` fingerprints route-shaping preferences, points and departure time. Frontend `route-selection.js` presents choices; `routing-request.js` and calculate-route orchestration dispatch responses and warnings. Maps use browser map rendering; Nominatim/Overpass and optional TomTom/geocoding providers supply external data. SQLite holds route/hazard caches and private trip records; Supabase supplies auth/profile synchronization.

## Findings

| ID | Severity | Root cause / consequence | Result |
|---|---|---|---|
| NAV-01 | P1 | `calculate_route` retried coord-only pre-migration cache rows after a preference-keyed miss. Such rows cannot prove avoidance, waypoints or departure settings. | Removed automatic legacy reuse; retained legacy storage helper for compatibility. New regression confirms fresh calculation begins and legacy lookup is not used. Existing cache invalidation/preferences tests pass. |
| NAV-02 | P1 | Recovery can omit exclude_locations, then use locations+costing without avoidance preferences while labeling success normally. | Recovery responses now explicitly set routing_degraded and warn that camera/light/crossing/CAZ and other constraints are not guaranteed. Existing frontend warning dispatch consumes this flag; recovery regression asserts the warning. Actual avoidance enforcement is not newly guaranteed. |
| NAV-03 | P1 | Primary Valhalla exclusion retries reduce hazard locations, and recovery/OSRM can produce a route without selected exclusions. | Open enforcement policy: warning added to recovery; existing OSRM warning remains, but reduced-exclusion retry responses still need exact capability/provenance metadata. No claim every fallback preserves hard constraints. |
| NAV-04 | P1 | OSRM public endpoint is queried with driving/foot/bike profiles; endpoint URL/profile names alone do not establish installed profile capabilities. | Open: verify upstream capabilities; never accept car routing as pedestrian/cycle-safe based only on profile string. |
| NAV-05 | P2 | Sequential provider/retry/enrichment requests can multiply latency despite bounded individual timeouts. | Open total deadline/cancellation and measured latency instrumentation. |
| NAV-06 | P2 | Cached responses contain computed cost and warning/engine state; key focuses on routing preferences rather than all price parameters and current provider availability. | Open cached geometry versus dynamic costs/provenance separation. |

Non-finite endpoint coordinates are now rejected by `voyagr/utils/validation.py:validate_coordinates` before provider calls. Tests cover NaN/infinities; numeric range comparisons alone did not reject NaN.

## Cameras and constraints

`voyagr/services/hazards.py` fetches camera buckets, merges incidents, selects route-area camera polygons/exclusion points, and scores proximity of hazards to route geometry. GraphHopper requests use flexible custom models and refuse unfiltered fallback when hard camera/area/costing rules are present (`graphhopper_fallback.py`). Valhalla receives exclude_locations. Scoring/ranking, map display and spoken proximity alerts are distinct operations: displaying/alerting on a camera does not mean its road was excluded, and a lower penalty does not prove legal/safe avoidance.

Tests exercise real custom-model generation, request wiring, route scoring/parity, maneuver geometry indices, cache preferences and mocked complete Flask route paths. They support software behavior only. No independent camera ground-truth sample, carriageway/directional matching evaluation, junction-distance calibration, data-age quality check or real detour comparison was performed. Some overlay queries deliberately skip large bounding boxes, so missing hazards are not evidence of no cameras. Average-speed endpoints/sections and cameras near parallel roads require direction-aware map matching. No claim camera avoidance is effective in real driving.

## Lane guidance

Confirmed P1: `lane_guidance.py:89` falls back to road-class lane counts; `:147` infers occupied lane from compass heading; `_get_recommended_lane` defaults generic exits to the rightmost lane. Heading cannot identify which parallel lane a car occupies. This is used by legacy desktop `satnav.py:get_lane_guidance`, and its existing tests tolerate/expect heuristic results.

Web `voyagr/api/navigation.py:138` also uses default lane counts when OSM is missing. JavaScript `modules/navigation/lane-guidance.js:23` has deterministic defaults and confidence bands; provider maneuver lane data takes priority, but heuristic confidence can cross the display threshold (70). Numeric confidence is not calibration against real junctions. Do not describe these fallbacks as grounded lane facts.

Deferred rather than changing all lane semantics without desktop and UK junction fixtures. Next change should carry explicit source/unknown-lane state, preserve real maneuver lanes and suppress unsupported instructions. Required fixtures: left-driving motorway exit/slip road, multiple valid exit lanes, signed turn restrictions, directional OSM lane tags, lane-count transition and multi-exit roundabout. Existing UK normalization/recommendation tests passed; new real-layout fixtures were not fabricated.

## Failures and offline boundaries

Timeout/HTTP400/mocked OSRM fallback tests pass; GraphHopper rejects certain unfiltered avoidance fallbacks. TomTom/Overpass failures can fall back to camera caches or estimated data; service health warnings must not be interpreted as verified absence of hazards. Browser route storage/corridor tile caching support resuming a previously obtained route; no local route computation engine or complete offline map package is established. GPS can continue without mobile data if the device supplies fixes, but offline route recalculation and every required tile are not guaranteed. Cached map coverage is bounded (precache URL budget 180) and route persistence expires (four hours). Network-loss/suspension/driving behavior remains unvalidated on a device.
