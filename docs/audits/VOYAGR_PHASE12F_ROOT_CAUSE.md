# Phase12F — Root cause and affected pipeline

**PHASE12F_PARTIALLY_VERIFIED. Production NO-GO for the repaired camera dataset.** Baseline main: `c3782f12767ffc165503a181b4ea2e2f30626e42` (Phase12C PR356), fetched before work. GraphHopper remains preferred first eligible Optimised. No production/lab server access, deployment, data replacement, graph rebuild or service restart. Phase12D/12E observations below are user/operator-reported, not independently replayed in this environment.

## Confirmed application defects

The ordinary `/api/route` HTTP boundary independently assessed hazard evidence and route geometry but did not compare single-leg endpoints with the original requested coordinates. Existing75m visit/endpoint checks applied to waypoint journeys, not ordinary origin integrity. Route ranking correctly preferred eligible GraphHopper routes, but eligibility did not include origin displacement. GraphHopper parsing discarded native `snapped_waypoints`; its accepted geometry was converted from precision5 to6 without preserving the native snap evidence. Cache hits were hazard-reassessed, but an old origin could still be returned as automatically eligible. Preference-mode browser navigation could accept a route without origin validation; manual confirmation must not authorise relocation.

Seven targeted HTTP tests failed before the change: five operator-distance reproductions, unsafe-GH versus eligible fallback selection, and stale cached origin claims. These now pass. Actual GraphHopper traversal/exit legality was not proven here. The supplied12E evidence establishes a snapping risk, not proof that the vehicle can legally reach the permitted snap.

## Attributed isolated-lab evidence

Operator describes lab `vmi3072171`, GH8.0, December2025 GB extract, resource-limited Docker and dedicated candidate graph. Production `vmi2887070` remains unchanged. Phase12D:128 expressions accepted on each graph, six regions,12 comparisons with identical coordinates/distances/durations, six restricted routes geometrically clear of128 candidate polygons. These support regional equivalence, not nationwide/source accuracy.

|12E fixture|Restricted displacement m|Unrestricted connection m|Restricted connection m|
|---|---:|---:|---:|
|0|46.31|1752.25|0|
|1|70.41|74.62|0|
|2|197.00|197.15|0|
|3|52.68|53.60|0|
|4|119.44|119.59|0|

All five unrestricted connections reportedly intersect area75; restricted connections collapsed to zero length. Synthetic regressions use these displacement magnitudes, **not fabricated copies of missing road geometries**. Raw12E coordinates, graph receipts and engine access were not supplied. No new private-network grant/VPN was configured. Existing main contains12C; no12D/12E code commits were assumed.

## Complete affected-code inventory

Changed runtime paths: `integrity_api.py` captures original endpoints before handlers and reassesses every successful response/cache hit; `origin_integrity.py` evaluates actual geometry/native snaps and local exclusions; `integrity.py` binds legs to current visits and gates ranking; `engines.py` preserves GH snaps; `route_entries.py` and `multidrop.py` retain evidence through conversion/legs; `request_budget.py` adds the bounded origin stage. Browser `avoidance-integrity.js` gates start/selection/reroute/resume; `gps-orchestration.js` preserves accepted raw fixes and removes sensitive console output; `calculate-route-orchestration.js` attaches matching accuracy and removes endpoint logs; lifecycle/map orchestration retain origin fail-closed behaviour if the verification module is missing.

Inspected, preserved paths: Flask main route ingress/cache/fallback and multi-stop endpoints; provider `optimised_route`, `route_variety`, Valhalla/OSRM parsers; `journey_geometry` decoding/stitch/order/binding; `hazards` camera/SCDB/OSM/CAZ models and capability-aware toll; route-selection comparison/metadata/persistence; GPS speed/fix normalization, road-match, route-progress and voice/progress pausing. No provider is trusted solely from its name or HTTP200. Existing p5/p6 geometry, source freshness, cancellation, cache and multi-stop integrity mechanisms remain in place. Complete changed-file inventory is in TEST_RESULTS.
