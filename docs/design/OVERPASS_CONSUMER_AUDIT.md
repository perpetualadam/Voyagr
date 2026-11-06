# Overpass consumer audit and sequential acceptance

6 November 2026. Repository tracing distinguishes runtime Overpass acquisition,
other provider paths and offline/desktop utilities. A code trace or mocked test
is not live production acceptance. Complete one feature before changing the next.

## Item 1: Parking POI button

`templates/index.html` calls `quickSearch('parking')`, through
`static/js/app/poi-search-orchestration.js`, to `POST /api/poi-search`.
Previously TomTom was first and an empty TomTom response stopped the search.
The generic Overpass fallback queried only nodes. This increment routes this
parking category directly through `arrival_parking.search_near_destination` and
`overpass_helper.query_overpass`: mapped nodes/ways/relations, configured local
endpoint preference, bounded acquisition/cache policy and explicit failures.
Other quick POI categories keep their existing provider order.

The button remains a search within 3 km of the current/cached GPS position,
not the optional driving-arrival search centred on a chosen destination. Its
modal has price filters and fee/access/time-restriction labels. Empty results
retain the filter control; acquisition failure is not reported as “no parking”.
Late older responses cannot replace a newer filtered list. Provider text and the
selection handler are escaped. No route or navigation authority is added.

Controlled API and actual quick-search orchestration tests cover source selection,
fee filtering, ways/relations, empty/unavailable results, stale response handling,
restrictions and safe HTML/selection. Full regressions are required before merge.
Live acceptance remains pending deployment: press Parking with location available,
check any/free/paid results and empty/error states; verify source Overpass through
the deployed endpoint. Missing mapped fees remain unknown, not free.

Example operator read-only check after deployment:

```sh
curl -sS --max-time 20 -H 'Content-Type: application/json' \
  -d '{"lat":53.5227681,"lon":-1.1335312,"type":"parking","radius":3000,"price_pref":"free"}' \
  -w '\nHTTP status: %{http_code}\n' \
  http://127.0.0.1:5000/api/poi-search
```

A successful result must identify Overpass, echo the free filter and return only
reported-free entries with fee/access verification false. The search context also
reports the helper's endpoint class (LOCAL/PUBLIC/UNKNOWN), dataset timestamp,
revision and cache state when available. Require the expected local class and
November-or-newer timestamp to establish local provider use; source=Overpass
alone does not distinguish a public fallback. An empty successful list
is possible; neither free availability nor public access is guaranteed.

## Remaining consumers and acceptance queue

| Order | Feature and code path | Repository finding | Remaining feature-specific acceptance |
|---|---|---|---|
| 2 | Traffic signal map areas and selected-route overlays: `api/hazards.py`, `services/hazards.py` | `/traffic-lights/area` and `/traffic-lights` call the shared Overpass helper. Large extents are deliberately bounded/skipped; failures retain unknown/partial coverage. | Controlled web endpoint/display checks and deployed small-area/selected-route evidence. A long-route empty overlay is not proof of no signals. |
| 3 | Railway crossings: `api/hazards.py`, `services/hazards.py`, `routing/hazard_prep.py`, `routing/multidrop.py` | Area display and route hazard preparation query `railway=level_crossing` via the helper. | Known crossing area, empty/failure distinction, multi-stop and route-assessment coverage. |
| 4 | Speed limits: `speed_limit_detector.py`, `api/navigation.py` | Runtime detector uses `query_overpass` for nearby highway/maxspeed geometry; other provider evidence and ambiguity rules also participate. | Deployed source/failure evidence with road/direction/profile binding; do not promote a nearby tag to legal speed authority. Existing controlled speed-limit regressions are part of CI. |
| 5 | Web lane lookup: `_fetch_osm_lane_data` in `api/navigation.py` | Uses shared Overpass acquisition. Lane guidance requires applicable road/direction evidence and can correctly remain unknown. | Test the web lookup and ambiguity/failure handling, not just desktop lane heuristics. |
| 6 | Other quick POI categories: `api/search.py`, `overpass_helper.build_poi_query` | TomTom first; empty TomTom suppresses fallback. Generic Overpass query is node-only. Not changed in item 1. | Sequentially assess intended empty-result fallback and area/way/relation support, preserving category semantics. |
| 7 | Along-route POI: `/poi-along-route` in `api/search.py` | Samples route points using TomTom, then Nominatim. It currently does not query Overpass. | Bounded integration design/tests before adding Overpass; avoid several unbounded queries per route. |
| 8 | Arrival parking and arrival-access observations: `services/arrival_parking.py`, `arrival_map_evidence.py` | Already use the shared helper. Prior operator evidence established November data and unresolved parking approach. | Deployment/browser acceptance of latest fee and endpoint display changes; do not label entrance/connector access verified. |
| 9 | Camera markers/route camera hazards: `api/hazards.py`, `services/hazards.py` | Read the app's cameras database. Updating Overpass does not automatically refresh that table. | Establish the deployed camera ingestion/refresh job and source separately. |

## Speed widget integration (6 November 2026)

The browser previously always selected the road-matching owner, but its
`/api/road-context` source was an operator-provided file only. Configuring
`OVERPASS_API_URL` therefore did not supply browser road observations.

The browser now explicitly requests a speed-only Overpass fallback when no
operator evidence file is configured. An explicitly configured file keeps
priority, including when it is invalid or unavailable. The fallback uses the
shared helper and its configured endpoint policy, cache and concurrency limits,
with a cooperative 2.5-second acquisition budget, 2 MiB response/output limits,
1,000 ways and 20,000 geometry points. Small stable tiles request **all** highway
ways, including roads without speed tags, to retain competing road hypotheses.

This source remains PARTIAL. It grants no legal, lane, hazard, route-progress or
rerouting authority. A separate display-only result requires a unique stable
GPS/heading match, linked OSM identity, an inset tile position, a car/motorcycle
profile and an explicit directional or general numeric maxspeed. Conditional,
vehicle-specific, inferred/NSL, inaccessible, ambiguous and missing values remain
unknown. Existing reviewed-evidence legal/lane rules are unchanged.

The clocks are separate: GPS fixes expire after 15 seconds, original Overpass
retrieval after 60 seconds, and daily dataset snapshots after 72 hours. Cached
retrievals retain their original time; fetching an old dataset does not renew its
snapshot age. These bounds permit labelled map observations, not surveyed signs
or verified legal applicability. The widget shows a grey circle and **Mapped**,
and leaves the legal limit used by alerts empty. Unknown evidence clears it.

Controlled tests cover acquisition, clocks, operator-file priority, matching,
ambiguity, stale/unsupported data, actual owner lifecycle and widget behaviour.
Live acceptance still requires deployment and a real GPS journey: confirm the
endpoint returns PARTIAL speed-only context and original timestamps; check a
known signed numeric road after two stable moving fixes, a parallel-road case,
loss of GPS/network and expiry. Static planning previews and mocked tests do not
prove this physical acceptance. Web lane lookup remains a separate next item.

## Separate code and non-consumers

### Lane badge correction (6 November 2026)

An actionable `EXPLICIT` lane bundle from `matched_directional_source` previously
fell through the badge source checks and displayed **Estimated**. It now displays
**Mapped**. The source name alone cannot relabel unknown/inferred evidence.
This corrects presentation only; acquisition, road/direction matching, provider
selection, visibility and spoken guidance rules are unchanged. The browser lane
lookup integration gap described in item 5 remains a separate next increment.

`lane_guidance.py` and `hazard_parser.py` contain direct public Overpass requests,
but traced imports are in desktop `satnav.py`, not the web lane API. Do not confuse
passing desktop tests with web-path acceptance or silently change these utilities
while fixing the Parking button. Their source policy needs separate review if used.

`build_speed_cameras_query`, `build_toll_roads_query`, `build_lanes_query` and
`build_corridor_traffic_signals_query` exist in the helper but are not evidence
that the web features invoke them. Main-map tiles, traffic flow, weather, routing
engines and reverse-geocoded road names have other sources; they should not be
forced through Overpass merely because this database is newer.

## Scope and evidence limits

The configured local interpreter is preferred by the shared acquisition helper;
existing allowlisted fallback/rate-limit/cache/deadline policy is unchanged.
`OVERPASS_API_URL` does not make every feature an Overpass consumer. Tests of the
helper cover provenance, local preference/recovery, cache identity, failure and
partial-response behavior. They do not prove installed dataset completeness.

This environment cannot access the production provider. No production changes or
queries were performed here. Retain the original eight-objective tracker as the
master scope; this audit is a subordinate provider/UI acceptance queue. Item 1's
code/test increment is complete only when checks pass, and live acceptance remains
pending. No remaining queue item is marked fully working from static inspection.
