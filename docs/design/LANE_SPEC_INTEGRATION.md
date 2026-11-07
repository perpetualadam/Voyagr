# Lane protocol research and integration

Researched 6 November 2026 against primary online documentation. This is map-based
navigation lane guidance. Physical occupied-lane detection and lane-departure
warnings are different camera/sensor capabilities and are not implemented here.

## Sources and observed gaps

| Primary source | Relevant semantics | Integration |
| --- | --- | --- |
| [Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/#other-request-options) and [lane output](https://valhalla.github.io/valhalla/api/route/api-reference/#trip-legs-and-maneuvers) | Request `turn_lanes`; native directions, valid and active values are bitmasks. Active identifies preferred route lanes; valid can require subsequent lane changes. | Driving requests enable lane output. A bounded adapter decodes masks, preserves all directions and distinguishes valid/preferred lanes. Malformed masks and contradictory subsets are rejected. The minimal compatibility retry remains minimal. |
| [OSRM lane/intersection objects](https://project-osrm.org/docs/v5.24.0/api/#lane-object) | Lane indications and Boolean validity belong to an intersection; the first intersection corresponds to the step maneuver. | Preserve only lanes from the matching first intersection, with provider and maneuver scope. OSRM validity is not labelled an independently known preferred lane. |
| [OSM turn markings](https://wiki.openstreetmap.org/wiki/Key:turn) | Pipe separates lanes, semicolon combines markings; blank equals unmarked/none. Turn markings do not replace legal restrictions. | Preserve shared arrows, sharp/reverse indications and blank slots. Unmarked slots display a neutral dot and never create a through recommendation. |
| [OSM per-lane keys](https://wiki.openstreetmap.org/wiki/Key:*:lanes) | Direction and conditional suffixes matter; lane attributes include destinations and restrictions. | Keep directional counts and optional destination/ref labels, checking vector lengths. Render source labels as text. Unsupported access/bus/change/conditional combinations still suppress map layout. |
| [OSM connectivity relations](https://wiki.openstreetmap.org/wiki/Relation:connectivity) | Explicit lane connections across complex junctions carry more information than turn arrows. | No raw-arrow-to-junction guess. [GraphHopper's simple positive node-via subset](GRAPHHOPPER_LANE_CONNECTIVITY.md) has a dedicated matcher; complex connectivity inference remains unsupported. |
| [NHTSA driver-assistance definitions](https://www.nhtsa.gov/vehicle-safety/driver-assistance-technologies) | Lane-departure and lane-centering systems monitor physical lane markings and vehicle position, generally with cameras. | GPS/map matching is not relabelled as camera lane recognition. No occupied-lane, departure warning or steering claim. |

## Runtime behaviour

The shared Overpass context remains PARTIAL, with all nearby highway competitors,
the same acquisition caps and original clocks. It cannot grant generic legal,
hazard, lane-permission or navigation authority. Ordinary mapped layouts remain
neutral and silent.

Native route-provider recommendations have a separate applicability check: a
fresh, stable, unique moving car/motorcycle match must be compatible with the
selected route. The maneuver must retain normalized native provider provenance.
Its junction must lie within eight metres of the current directional way end.
The intervening route, sampled at vertices and midpoints, must stay within six
metres of that same source way, progress in the correct direction and span
15–400 metres. Work is bounded to 80 route segments and 1,000 source vertices.
Unbound, stale, ambiguous, reversed, detoured, passed and unsupported contexts are
rejected. No OSM way/graph IDs are invented. Recalculations and vehicle/GPS changes
invalidate the owner context as before.

The web overlay preserves full provider arrows, valid lanes and preferred lanes;
all explicitly selected lanes survive the confidence merge. Valhalla valid-only
lanes are retained as metadata but do not become preferred instructions. Source
OSRM valid lanes can be displayed as usable route lanes without claiming that a
provider supplied a unique preference. The normal overlay's GPS, distance,
visibility and voice gates still apply. Current-road mapped layout remains the
fallback when no applicable recommendation exists.

## Validation and limits

Controlled tests cover the documented Valhalla masks, OSRM intersection scoping,
normalization failure states, actual owner-to-overlay provider selection,
wrong/passed junctions, route detours/reversals, stale/ambiguous inputs, blank OSM
slots and destination vector consistency. Existing web regression and coverage
checks remain required.

This is protocol and integration acceptance, not live-engine/device acceptance.
After deployment, confirm the installed Valhalla version returns native lanes
when requested, inspect the selected route's normalized lane source and masks,
then test a known mapped approach, shared turn lanes, opposite direction,
recalculation and GPS loss. Missing provider lanes or unsupported junctions remain
unknown/neutral. No production graph rebuild, camera processing or vehicle-control
integration is included.
