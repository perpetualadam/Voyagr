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
| 2 | Traffic signal map areas and selected-route overlays: `api/hazards.py`, `services/hazards.py` | `/traffic-lights/area` and `/traffic-lights` call the shared Overpass helper. Large extents are deliberately bounded/skipped; failures retain unknown/partial coverage. | Controlled endpoint/display checks passed (item 2 below); deployed small-area/selected-route evidence remains pending. A long-route empty overlay is not proof of no signals. |
| 3 | Railway crossings: `api/hazards.py`, `services/hazards.py`, `routing/hazard_prep.py`, `routing/multidrop.py` | Area display and route hazard preparation query `railway=level_crossing` via the helper. | Controlled acquisition/display/snapshot and multi-leg checks passed (item 3 below); known-location and deployed/device acceptance remain pending. |
| 4 | Speed limits: `speed_limit_detector.py`, `api/navigation.py` | Runtime detector uses `query_overpass` for nearby highway/maxspeed geometry; other provider evidence and ambiguity rules also participate. | Deployed source/failure evidence with road/direction/profile binding; do not promote a nearby tag to legal speed authority. Existing controlled speed-limit regressions are part of CI. |
| 5 | Web lane lookup: `_fetch_osm_lane_data` in `api/navigation.py` | Uses shared Overpass acquisition. Lane guidance requires applicable road/direction evidence and can correctly remain unknown. | Test the web lookup and ambiguity/failure handling, not just desktop lane heuristics. |
| 6 | Other quick POI categories: `api/search.py`, `services/fuel_poi.py`, `overpass_helper.build_poi_query` | Fuel, Food, Charging, Pharmacy, Hospital and Groceries controlled verification recorded below; usable TomTom first, empty/unavailable then bounded Overpass nodes/ways/relations. Other legacy categories/aliases retain their existing provider policy and node-only query. | Fuel/Food/Charging/Pharmacy/Hospital/Groceries live VPS/device acceptance pending. Unit audit and dynamic cost follow-ups are tracked alongside the remaining category queue in UI_IMPROVEMENT_TODO.md. |
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

### GraphHopper and positive OSM lane connectivity (6 November 2026)

[GraphHopper lane matching](GRAPHHOPPER_LANE_CONNECTIVITY.md) distinguishes stock
GraphHopper 8 lane counts from native turn-lane recommendations. The selected
GraphHopper path now has an optional bounded same-snapshot Overpass relation
enrichment and a dedicated positive from/via/to matcher. Simple direct lane
connections can produce `MAPPED_CONNECTIVITY` recommendations after both approach
and outgoing-road checks. Missing, ambiguous, conditional, conflicting and
unsupported cases retain neutral layout. This is mapped evidence, not native
GraphHopper lane output, generic complete coverage or occupied-lane recognition.
Live acceptance is pending deployment on a junction with an explicit relation.

### Specification-based provider lane integration (6 November 2026)

[Lane protocol research and acceptance](LANE_SPEC_INTEGRATION.md) records the
primary online sources and the implemented gaps: native Valhalla masks and lane
requests, scoped OSRM intersection lanes, preserved valid/preferred choices and
arrows, blank OSM markings, and directional destination labels. A separate
bounded junction-approach check can now authorize native provider recommendations
without granting complete-coverage authority to raw Overpass lane observations.
Raw markings alone still cannot establish complex junction connectivity or the
vehicle's occupied lane. Live provider-version and device acceptance is pending.

### Web lane layout connection (6 November 2026)

The road owner now explicitly requests lane observations alongside speed
observations through `/api/road-context`. Both use the same bounded shared
Overpass response, preserving all nearby highway competitors. No additional
lane query or public-provider bypass is introduced. Operator-file priority,
source timestamps, PARTIAL coverage and acquisition limits remain unchanged.

`lane_observations_only` permits a **current-road layout**, not lane-choice
authority. A stable moving GPS/direction match must also be compatible with the
active route geometry or typed road binding. Explicit directional counts and
turn tokens must agree; generic tags apply only to explicitly one-way roads.
Conditional, bus/access/change-lane restrictions, unsupported tokens, conflicting
counts, ambiguity, unsupported vehicles and expired evidence hide the layout.
GPS fixes, retrieval and daily snapshots retain their separate 15-second,
60-second and 72-hour observation limits.

The web overlay shows **Current road lanes / Mapped** with neutral arrows and
“Mapped lane layout — follow road signs”. It never highlights a recommended lane,
identifies the occupied lane, speaks a lane-choice instruction or enables
navigation/rerouting authority. Existing actionable guidance takes priority.
The legacy `/api/lane-guidance` remains non-authoritative; its first nearby way
cannot establish a junction/route association. Full live Overpass lane-choice
recommendations remain gated on stronger route/junction applicability evidence.

Controlled API, matcher, owner and actual DOM tests cover this flow and its
failure states. After deployment, live acceptance must check a known directionally
mapped multi-lane approach, opposite direction, parallel roads, missing tags,
lost/stale GPS and unchanged ordinary navigation. No physical-device or live VPS
acceptance is claimed by the controlled tests.

### Lane badge correction (6 November 2026)

An actionable `EXPLICIT` lane bundle from `matched_directional_source` previously
fell through the badge source checks and displayed **Estimated**. It now displays
**Mapped**. The source name alone cannot relabel unknown/inferred evidence.
This corrects presentation only; acquisition, road/direction matching, provider
selection, visibility and spoken guidance rules were unchanged by that correction.
The current-road layout increment above connects bounded observations separately;
actionable junction lane-choice recommendations still require stronger evidence.

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

## Item 2: Traffic-light overlay verification (7 November 2026)

Controlled implementation/verification is complete; deployed source and device
acceptance remains open. Both viewport and selected-route displays now use the
shared bounded traffic-signal acquisition service and configured Overpass client.
Coverage retains endpoint class, dataset timestamp, revision, retrieval/cache and
response state. Route requests share the two-slot/12-second acquisition boundary,
accept at most 10,000 coordinates, inspect at most 1,000 returned nodes and show
at most 200 markers. Existing 0.35-degree bounds remain; an oversized request is
explicitly PARTIAL/NOT_QUERIED rather than a successful assertion of no signals.

Reproduced on unmodified main: a signal directly on a sparse segment midpoint,
about 660 m from either vertex, was omitted. Display proximity now uses the
existing segment index within 150 m. This is **geographic proximity only**, not
same-road/direction association, an applicable signal or avoidance verification.
The routing avoidance evaluator, mandatory policy and navigation gates are not
changed by this endpoint/display increment.

Route fetches are cancelled/invalidate on newer selections, clear or toggle-off;
viewport responses require the current generation, bounds, map and owner runtime.
Older responses cannot restore old markers. Unknown/failed, valid-empty, stale,
partial and oversized results retain distinct coverage messaging in the preview
or map settings. Provider names are escaped in route popups. OSM markers stay
neutral with state unknown; location-only responses do not start a countdown timer.
Camera markers still use their separate database source.

Verification includes deterministic API tests with the **real shared client and
parser** against fixture HTTP, real segment matching, bounds/caps/admission and
failure evidence; browser owner tests cover response overlap, toggle/clear, panning,
teardown, invalid records and empty/error distinctions. A new per-file traffic-
light coverage floor supplements existing floors. `node scripts/check-traffic-light-overlays.cjs`
checks real bundled MapLibre marker/popup mounting and coverage copy in portrait
and landscape Chromium using a synthetic background style and API responses.
It makes no tile/provider/GPS requests and is not live acceptance.

After a separately authorized deployment, inspect the small-area response:

```sh
curl --fail --silent --show-error --max-time 20 \
  'http://127.0.0.1:5000/api/traffic-lights/area?north=53.53&south=53.51&east=-1.12&west=-1.15'
```

Require the expected LOCAL endpoint class and dataset timestamp/revision to
establish use of the updated local interpreter; source labels alone do not prove
that. A VALID_EMPTY result differs from UNAVAILABLE, but proves no physical absence.
Then select a short actual route in the browser, inspect `/api/traffic-lights`,
verify neutral markers/unknown state and geographic-only coverage, change routes
quickly, pan/zoom and switch each independent overlay off/on. Check a known signal
location separately; no production coordinate inventory or complete UK coverage
has been verified here. Long-route segmentation remains separate future work;
this increment preserves the bounded skip rather than issuing many route queries.

Local final verification: 134 JavaScript suites / 2,946 tests, lint and coverage
floors passed; CI web backend selection 1,933 passed, one platform skip and
74 subtests passed. Portrait/landscape Chromium checks passed with real MapLibre
and the production marker helper for both viewport and selected-route displays.

Final acquisition review also verifies that the shared worker inherits any shorter
parent request deadline and bounds its wait to remaining time. Two regressions
prove that an already-expired request performs no transport, and expiry during
transport cannot publish/cache the result. Cooperative cancellation and the
two-slot no-backlog policy remain intact, including for existing shared callers.

## Item 3: Railway-crossing overlay verification (7 November 2026)

Controlled verification is complete; known-location, deployed-source and device
acceptance remains open. The real shared Overpass client requests
`node["railway"="level_crossing"]`; pedestrian `railway=crossing` is not the
queried category. Both map display and route hazard preparation use
`fetch_railway_crossings_osm_bbox`. Multi-stop preparation retains that list and
its coverage in the hazard snapshot. No routing algorithms, avoidance policy,
mandatory thresholds, engine requests or camera ingestion are changed.

Reproduced on unchanged main: a delayed area response mounts a crossing after
the user switches the overlay off. The corrected viewport path requires current
request generation, bounds, map and owner runtime before mounting. New fetches,
toggle-off and restored off preferences clear old crossing markers; old requests
cannot restore them. Source failures, mapped-empty results, stale observations
and oversized/not-queried areas retain distinct settings copy. The popup and
status describe mapped locations, never live barrier or train state.

The API validates finite ordered WGS84 bounds before acquisition and preserves
the existing 0.35-degree size limit, 200-node display acquisition cap and shared
two-slot, 12-second worker with shorter parent deadlines. Service results retain
endpoint class, dataset timestamp/revision, retrieval time and cache state.
Malformed coordinates are skipped conservatively; duplicate node IDs do not
inflate results. Existing default routing fetch limits are retained.

Verification:
- Real shared client/parser with fixture HTTP proves the correct category query,
  LOCAL source metadata, valid empty versus unavailable outcomes and a second
  request's cache hit retaining its original retrieval time.
- Real hazard preparation preserves the coverage-bearing crossing list in the
  request snapshot. Real multi-leg assessment refuses mandatory crossing avoidance
  for partial/unknown acquired data on every leg; no permission is inferred from
  merely having a mapped point or a successful acquisition.
- Actual map owner tests cover newer/older requests, toggle and preference restore,
  panning, map replacement, teardown, failed HTTP/JSON, malformed records, duplicate
  positions, display caps and zoom-out. Other overlay markers remain untouched.
- `node scripts/check-railway-crossing-overlays.cjs` uses real Chromium, bundled
  MapLibre and the production marker helper for portrait/landscape mounting,
  popup, coverage, empty/error and toggle-clear checks, with a synthetic background
  style/API and no provider, tile, GPS or train-state calls.
- Local full regressions: 135 JavaScript suites / 2,962 tests, lint and coverage
  floors passed; CI web backend selection 1,948 passed, one platform skip and
  74 subtests passed. Syntax and diff checks passed.

After a separately authorized deployment, inspect a small viewport around a
known level crossing, using `/api/railway-crossings/area?north=...&south=...&east=...&west=...`.
Require expected LOCAL source class and dataset timestamp/revision to establish
use of the updated interpreter; then verify the known point in the actual map.
Repeat after panning rapidly, zooming out, toggling off/on and restoring an off
preference. Mapped-empty is not proof of physical absence. Confirm mandatory
route assessments separately; map markers never establish road/profile applicability
or live barrier state. No production queries, configuration changes or deployment
were performed for this increment.


### Item 6a — Nearby Fuel (2026-11-08)

The existing Fuel POI button retains usable TomTom results first. An empty,
unavailable or unusable response now falls through to the configured shared
Overpass client, querying `amenity=fuel` nodes, ways and relations with centers.
The existing Nominatim last resort remains for failed Overpass acquisition.
Valid mapped-empty and acquisition failure stay distinct; neither establishes
physical absence. Other Nearby categories and along-route provider policies
remain separate future increments.

Fuel validates finite WGS84 coordinates (including zero longitude), radius
1–5,000 metres and provider positions; filters by straight-line radius, ranks
by distance and offers at most 15 candidates. Acquisition uses an 18-second
cooperative parent budget and a 12-second Overpass child budget, bounded query
size/output, and the shared client's transport/cache safeguards. Context retains
LOCAL/PUBLIC source class, dataset revision/time, retrieval time and cache state
when supplied. This is candidate coverage, never verified opening, stock,
compatibility, vehicle permission or an entrance.

The Fuel modal clears stale rows before searching, qualifies reported hours and
fuel types, distinguishes errors from mapped-empty results, and preserves the
existing endpoint invalidation/route-planning selection flow. Controlled tests
exercise the real shared parser/local endpoint transport with fixture HTTP, cache
provenance, area candidates, radius/identity validation, provider fallback and
expired budgets. Browser checks at 390×844 and 844×390 exercise real modal and
selection code with fixture provider data, no live provider or GPS calls:
`node scripts/check-fuel-poi.cjs`. Live VPS/provider and actual-device acceptance
remain pending after a separately authorized deployment.

Local full regressions: 136 JavaScript suites / 2,967 tests, lint and coverage
floors passed; declared web backend selection 1,966 passed, one platform skip
and 74 subtests passed. No production configuration, data or deployment changed.


### Item 6b — Nearby Food (2026-11-08)

Food retains usable TomTom results first and now falls through on empty, failed
or unusable primary results to the configured shared Overpass client. The fixed
category query covers restaurant, fast_food and cafe nodes/ways/relations with
centers. Other category meanings and along-route provider policies are unchanged.
The existing Nominatim last resort remains for failed map acquisition, with
partial candidate coverage rather than a complete search guarantee.

Food and Fuel share the 18-second cooperative provider admission/fallback path,
with separate category parsers and a 12-second Overpass child budget. Food
validates finite WGS84 coordinates (including zero longitude), a 1–5,000 metre
radius, exact category tags and provider positions; deduplicates, filters by
straight-line distance and offers at most 15 ranked candidates from a bounded
200-element query. Available endpoint class, original dataset/retrieval times,
revision and cache state are retained. Centers are map points, not entrances.
Hours and cuisine are reported facts, not current opening, dietary suitability
or access guarantees. Valid mapped-empty results remain distinct from failed
acquisition.

The Food button clears old selections on new searches; stale network/GPS results
cannot replace a newer action. Distance display continues through the settings
formatter. Selection retains endpoint-request invalidation and the existing
route planner. The modal escapes provider text and qualifies empty/unknown states.
Controlled regressions cover actual shared client parsing and local transport
with fixture HTTP, category/area semantics, source/cache metadata, validation,
provider fallback, deadlines, stale responses and planning selection.
`node scripts/check-food-poi.cjs` uses the actual template Food button and modal
owner at 390×844 and 844×390, checking selection, empty/error states and escaped
text with fixture data. No live providers or GPS are used.

Live VPS/provider and actual-device acceptance remain pending after separately
authorized deployment. No production configuration, data or deployment changed.

Local full regressions: 137 JavaScript suites / 2,973 tests, lint and coverage
floors passed; declared web backend selection 1,983 passed, one platform skip
and 74 subtests passed. Existing Fuel and Parking regressions remain passing.


### Item 6c — Nearby EV Charge (2026-11-08)

The existing `EV Charge` quick button uses `/api/poi-search` with type `charging`.
It now retains usable TomTom results first and falls through on empty, failed or
unusable primary results to the configured shared Overpass client. The bounded
query covers `amenity=charging_station` nodes, ways and relations with centers;
parking sites are not guessed to be chargers. Valid mapped-empty results remain
successful candidate searches; failed map acquisition can try the existing
Nominatim last resort, and failed/unusable acquisition returns unknown coverage
rather than claiming no chargers exist.

Charging joins Fuel/Food's 18-second cooperative acquisition budget, with a
12-second Overpass child budget, 7-second query timeout, 2 MiB query size cap,
200-element bound and 5-minute shared cache. Input requires finite WGS84 numeric
coordinates and a 1–5,000 metre integer radius. Results are deduplicated, filtered
by independently calculated straight-line distance and limited to 15. Synthetic
Northern Ireland and zero-longitude cases verify that neither is excluded by
geographic filtering. Available local endpoint class, original dataset/retrieval
times, source revision and cache state are preserved, not regenerated on hits.

OSM operator, network, opening-hours and allowlisted socket type/count/output tags
are **reported map facts**. Missing/zero/negative/malformed socket counts do not
create connector claims; missing output is not inferred. Values are bounded and
escaped for display. All sources explicitly retain unverified live availability,
vehicle/connector compatibility, charging power, opening and access. The UI asks
users to check the operator for availability/tariffs; reported output is not a
promised charging speed. This does not add a charger-status API, compatibility
filter, tariff feed or change EV route-cost inputs. Map centers are not entrances.

The quick button uses candidate-search stale response/GPS cancellation, clears
old selections on a new search and qualifies empty/error states. Selection still
invalidates old endpoint requests and invokes the existing route planner, not
live navigation. Distance display remains under the user's selected units.
The separate `/api/charging-stations` OpenChargeMap endpoint and along-route
provider/coverage behavior are outside this increment. Pharmacy, hospital and
groceries retain their existing policies and remain next in the category queue.

Validation: 32 focused backend cases cover real shared-client parsing and cache
provenance with fixture HTTP, provider precedence, malformed/out-of-radius/area
records, reported connectors, fallback, deadlines and UK/NI coordinates. Fuel and
Food regressions remain passing; their unrelated-category policy checks now use
Pharmacy because Charging intentionally joins the reviewed fallback path.
Six browser-owner tests cover category dispatch, text escaping, stale responses,
late GPS callbacks, empty/error state and planner selection. The controlled
`node scripts/check-charging-poi.cjs` harness passed at 390×844 and 844×390 with
the actual EV Charge button, production modal/owner and fixture data.

Full local checks: 143 JavaScript suites / 3,062 tests, lint and coverage floors
passed; declared backend selection 2,105 passed, one platform skip and 74 subtests.
No live provider/GPS or deployed-device acceptance was performed. No production
configuration, database, credentials or deployment were changed.


### Item 6d — Nearby Pharmacy (2026-11-08)

The existing Pharmacy button now joins the bounded candidate-search admission
path: usable TomTom first, shared configured Overpass after empty/failed/unusable
primary results, existing Nominatim last resort after map acquisition failure.
It preserves the existing exact `amenity=pharmacy` category meaning while adding
nodes, ways and relations with centers. Hospitals, clinics and general chemist/
drug stores are not automatically reclassified as pharmacies. Hospital and
Groceries nearby searches and along-route acquisition remain outside this change.

The search uses the shared 18-second cooperative budget and a 12-second Overpass
child budget. The query has a 7-second server timeout, 2 MiB maxsize setting and
200-element bound, with the existing 5-minute shared cache. Inputs require finite
numeric WGS84 coordinates and a 1–5,000 metre integer radius. Candidates are
independently distance-filtered, deduplicated, ranked and capped at 15. Available
endpoint class, original dataset/retrieval timestamps, revision and cache state
are preserved. A valid mapped-empty response is distinguished from unavailable
acquisition/unknown coverage; neither establishes complete geographic coverage.

The modal escapes provider text, labels opening hours/operator as reported, and
asks users to check current hours, services, medicine stock and access with the
pharmacy. All sources retain `opening_hours_verified=false`,
`access_verified=false`, `services_verified=false` and `stock_verified=false`.
These are location candidates, not confirmation of present opening, prescription
services, stock or an entrance. No medical-services or stock feed was added.
Distances stay under the selected display units. New searches clear old modal
selections; stale HTTP/GPS callbacks cannot replace newer searches. Selecting a
candidate invalidates old endpoint requests and invokes the existing planner;
it does not start live navigation.

Validation: 25 focused backend cases cover real shared-client parsing with
fixture HTTP and cached provenance, exact category/area semantics, provider
precedence/fallback, invalid and distant records, candidate bounds/ranking,
deadlines, Northern Ireland/zero-longitude coordinates and unverified provider
claims. Existing Fuel/Food/Charging cases remain passing. The unrelated-category
empty-primary assertions now use Hospital because Pharmacy intentionally joins
the reviewed fallback path. Six browser-owner regressions cover request/units,
escaping, stale responses/GPS, empty/error states and planner selection.
`node scripts/check-pharmacy-poi.cjs` passed at 390×844 and 844×390 using the real
template button and production modal/owner with fixture data.

No live provider, GPS, deployed-device acceptance or production changes were
performed. Next nearby category: Hospital, then Groceries, each separately.

Full local Pharmacy validation: 144 JavaScript suites / 3,068 tests, test lint and
coverage floors passed; declared backend selection 2,130 passed, one platform
skip and 74 subtests. These checks do not establish live provider/device behavior.


### Item 6e — Nearby Hospital and clinics (2026-11-08)

The Hospital quick button retains its existing hospital/clinic category scope.
Usable TomTom results stay first; empty/failed/unusable primary results now fall
through to bounded shared Overpass `amenity=hospital|clinic` nodes, ways and
relations with centers. The existing Nominatim last resort remains after failed
map acquisition. Groceries and along-route provider/coverage behavior are outside
this increment. Valid mapped-empty results are separate from acquisition failure,
which retains unknown coverage rather than claiming there are no facilities.

Mapped hospital and clinic tags produce distinct `facility_kind` values. The
browser displays these as **Reported facility: Hospital / Clinic**. A provider's
general search-category label is not promoted to a confirmed OSM facility type;
non-OSM candidates retain `facility_kind=unknown`. All sources retain unverified
current services, emergency services, opening hours and access. A clinic is not
necessarily a hospital or emergency department; the UI makes that distinction
explicit and asks users to check services/hours/access with the facility. Neither
a map tag nor a POI result establishes current emergency care or a vehicle entrance.
No clinical triage, emergency-status or medical-service availability feed was added.

The search shares the 18-second cooperative provider budget, a 12-second Overpass
child budget, 7-second query timeout, 2 MiB query maxsize and 200-element bound,
with a 5-minute shared cache. Finite WGS84 numeric coordinates and a 1–5,000 metre
integer radius are required. Independent straight-line distance filtering,
deduplication, ranking and the 15-candidate cap remain in place. Endpoint class,
original dataset/retrieval times, revision and cache state are retained. Synthetic
Northern Ireland and zero-longitude cases verify geographic acceptance, not live
national coverage.

The existing Hospital button uses stale HTTP/GPS result protection and clears
old candidate selections. Provider text is escaped, hours/operator are labelled
reported, selected distance units remain authoritative, and selecting a result
invalidates old endpoint requests before using the existing planner. It does not
authorize or start live navigation. Existing nearby categories retain their
separate semantics; unrelated-category policy fixtures now use Groceries because
Hospital intentionally joins the reviewed fallback path.

Validation includes real shared Overpass client/cache parsing with fixture HTTP,
node/way/relation and hospital/clinic distinctions, provider fallback, input and
radius checks, deduplication/ranking, deadlines, UK/NI coordinates, unverified
emergency/service claims and unknown third-party facility types. Six browser-owner
cases and `node scripts/check-hospital-poi.cjs` exercise the actual Hospital button,
production modal/planner flow, escaped text, empty/error states and stale results
at 390×844 and 844×390 with fixture state. No live provider, GPS, production
configuration/data changes or deployment were performed. Next category: Groceries.

Full local Hospital validation: 27 focused backend cases and six browser-owner
cases; 145 JavaScript suites / 3,074 tests, lint and coverage floors passed.
Declared backend selection: 2,157 passed, one platform skip and 74 subtests.
These controlled checks do not establish live provider or deployed-device behavior.


### Item 6f — Nearby Groceries (2026-11-08)

The Groceries quick button retains its exact existing shop scope: supermarket,
greengrocer and convenience. Usable TomTom results remain first; empty/failed/
unusable primary results now fall through to the configured shared Overpass
client, querying matching shop nodes, ways and relations with centers. Nominatim
remains the last resort after map acquisition failure. Usable primary results
are not merged with additional provider searches, so this remains a candidate
list, not an exhaustive directory of all three shop kinds. The separate legacy
`supermarket` alias, ATM and along-route acquisition retain their existing policy.

Mapped shop types produce `shop_kind=supermarket|greengrocer|convenience`, shown
as reported Supermarket, Greengrocer or Convenience store. Non-OSM provider
categories are not promoted to confirmed map classifications and retain unknown
shop kinds. Operator and opening hours are reported, bounded and escaped; current
opening, stock and access stay unverified for every source. The modal asks users
to check the store and explains that a map point may not be a vehicle entrance.
No product inventory, opening-now evaluation or access guarantee was added.

The search shares the 18-second cooperative provider admission budget, a
12-second Overpass child budget, 7-second query timeout, 2 MiB maxsize setting,
200-element bound and 5-minute shared cache. Inputs require finite numeric WGS84
coordinates and a 1–5,000 metre integer radius. Candidates are independently
straight-line distance-filtered, deduplicated, ranked and capped at 15. Available
endpoint class, original dataset/retrieval times, revision and cache state are
retained. A valid mapped-empty response remains distinct from failed acquisition
with unknown coverage. Synthetic NI and zero-longitude cases verify geographic
acceptance only, not live coverage.

The Groceries button clears old candidates and ignores late HTTP/GPS callbacks.
Selection preserves endpoint-request invalidation and the existing route planner;
it does not start live navigation. Distance display follows the user's selected
units. Other reviewed nearby categories remain under their existing contracts.
The unrelated-category empty-primary fixtures now use ATM because Groceries
intentionally joins the bounded fallback path; a separate test preserves the
legacy `supermarket` alias behavior.

Validation: 28 focused backend cases cover real shared-client acquisition and
cache provenance with fixture HTTP, all three shop and element types, category
rejection, input/radius bounds, fallback, invalid/distant/duplicate records,
ranking/caps, deadlines, UK/NI coordinates and unverified stock/opening claims.
Six browser-owner cases and `node scripts/check-groceries-poi.cjs` exercise the
actual template button, production modal/owner, escaped text, selected distance
format, planning selection, stale responses/GPS and empty/error states. Controlled
Chromium checks passed at 390×844 and 844×390; no live providers or GPS were used.

No production configuration, credentials, database changes or deployment were
performed. The listed nearby quick-button categories now have controlled audit
records, but their live VPS/provider/device acceptance remains open. Next in the
original functional queue is bounded along-route POI acquisition/design (item 7),
separate from the continuing UI/unit/arrival and deferred road-test workstreams.

Full local Groceries validation: 146 JavaScript suites / 3,080 tests, test lint
and coverage floors passed; declared backend selection 2,185 passed, one platform
skip and 74 subtests. Existing reviewed nearby-category regressions remain passing.
