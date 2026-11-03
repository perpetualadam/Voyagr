# Purpose-aware endpoint snapping: evidence inventory and implementation design

Status: proposed design, 3 November 2026. Source baseline: main `fd4f3df2`.
This document changes no runtime behavior, limits, navigation gates or deployment.

## Problem and evidence

A searched place coordinate is not necessarily a drivable arrival point. A raw
GPS measurement, a map-matched vehicle position, a place entrance and a provider
road snap answer different questions. Current origin integrity compares original
coordinates with returned route endpoints using the same two-metre numerical
tolerance regardless of the request's planning/live purpose or endpoint kind.

The captured Sheffield–Doncaster fixture has GraphHopper origin displacement
23.651 m and destination displacement 22.793 m. Native provider snaps agree with
both returned geometry endpoints exactly. Four Valhalla alternatives have
approximately 23.7 m offsets but only geometry-derived endpoint evidence.
Fresh operator probes reproduced the city-search offsets. A controlled reroute
using the original route's road endpoints produced offsets below one metre and
passed endpoint continuity. That control proves numerical consistency, not actual
vehicle location, property access or full navigation eligibility.

Existing planning already permits an idle preview of a refused route. Therefore
phase 1 below is an evidence/classification improvement, not an authorization
relaxation or a claim that planning cannot currently work.

## Repository evidence inventory

| Component | Evidence available now | Gap / limit |
| --- | --- | --- |
| `voyagr/services/routing/engines.py` GraphHopper adapter | Native `snapped_waypoints`, route geometry, instructions, selected per-edge details and provider limitations | Snap precision currently assumed to be 5. No endpoint-specific edge identity, entrance proof or matched-vehicle confidence is preserved. A routable snap is not property-access proof. |
| `voyagr/services/routing/route_entries.py` / `multidrop.py` | Carry GraphHopper snap fields into normalized routes/legs | Need consistent endpoint contracts across providers, alternatives and all ordered stops. |
| `voyagr_web.py`, `voyagr/api/routing.py`, Valhalla paths | Send requested locations and receive route/trip responses | Inspected location builders use coordinates; there is no common endpoint heading/approach/search-policy contract. Provider features must be checked against the deployed engine version before use. |
| `voyagr/services/routing/valhalla_parsing.py` | Normalizes geometry, legs and maneuvers | Does not preserve independent native snap/correlation evidence as the GraphHopper path does. Geometry-only evidence must remain labeled as such. |
| `voyagr/api/search.py` / `services/geocoding.py` | Nominatim results and ranked TomTom address/POI results; coordinates, address, type and source metadata are available in search processing | TomTom normalization uses `position`; it does not preserve `entryPoints`. Do not assume an entrance exists in every response. Search ranking is not a road-access certificate. |
| `static/js/app/geocoding-orchestration.js` | Selected coordinate, display label and `journeySource` stored on endpoint inputs | Selected semantic class, provider identity, bounds and access-point evidence are not carried as a verified routing-endpoint record. |
| `voyagr/services/routing/journey_context.py` | Planning/live purpose, endpoint kind, original kind and ordered stops | Explicitly `authority: request_metadata_only`. Client declarations cannot authorize navigation or prove GPS ownership. |
| `voyagr/services/routing/origin_integrity.py` | Raw-to-route displacement; native-snap/geometry consistency; endpoint exclusion checks; GPS uncertainty classification | Two metres means numerical continuity, not a universal snapping radius. No general legal connector solver or purpose-aware access policy is implemented here. |
| `voyagr/utils/road_matching.py` / `services/road_context.py` | Source-linked directional candidates, ambiguity, GPS age/accuracy, graph identities, connectivity and restrictions | Requires configured reviewed road evidence (`VOYAGR_ROAD_EVIDENCE_FILE`). Production readiness/coverage was not inspected. Results are PROBABLE, not surveyed truth or automatic live permission. |
| `static/js/app/journey-modes.js` | Fresh-GPS recalculation, second fix, cancellation generations, staged commit, active-journey preservation | Existing ownership/freshness checks must survive any new endpoint policy. A new preview must not implicitly activate or replace live navigation. |

## Invariants

1. Preserve requested location, resolved routing anchor and any accepted raw GPS
   fix separately. Never silently overwrite one with another.
2. Keep two metres for encoding/native-snap/geometry consistency checks. Do not
   turn it into a universal permitted snap radius.
3. A planning acceptance or entrance selection never grants live authority.
4. Client endpoint kind, claimed GPS origin, confirmation and provider branding
   are not trusted verification evidence.
5. Mandatory avoidance applies to the selected route and every actual driven
   connector. Unknown connector geometry cannot be treated as an empty segment
   or an invented straight line that passes a safety check.
6. Evaluate both endpoints and every ordered stop. Preserve order, identity,
   independent alternatives, assessment expiry and current journey ownership.

## Proposed endpoint record (additive contract)

Introduce a versioned server-generated `endpoint_resolution` for origin,
destination and each stop, alongside existing assessment fields:

- `requested`: original coordinate and source reference; semantic class such as
  locality, address, POI, explicit road point or unknown. Retain a selected place's
  name/bounds when available and validate coordinate ranges server-side.
- `routing_anchor`: coordinate, provider/profile, geometry endpoint and any native
  road/edge/approach identifiers. Missing fields remain unknown.
- `offset_m`: measured original-to-anchor distance; do not interpret as driving
  distance or GPS accuracy.
- `anchor_evidence`: `NATIVE_SNAP_CONSISTENT`, `GEOMETRY_ONLY`, `MISMATCH` or `MISSING`.
- `access_evidence`: `UNKNOWN`, `PROVIDER_ACCESS_POINT`, `VERIFIED_CONNECTOR`,
  `AMBIGUOUS` or `BLOCKED`, plus source/revision and what was actually checked.
  An entrance coordinate alone does not establish legal vehicle access.
- `planning_disposition`: `ROAD_SNAPPED`, `REVIEW_REQUIRED`, `UNAVAILABLE` or
  `NO_VALID_GEOMETRY`. These describe inspectability/anchor selection only.
- For live evaluation, bind accepted-fix identity/time, route and endpoint
  coordinates, route/profile identity, road-source revision, policy version,
  request generation and verification time. Server generates/revalidates evidence;
  clients must not submit a boolean claiming connector verification.

Roll out the producer and consumers under an explicit contract version. Current
frontend code rejects `transition_verified: true` and expects the current origin
status; adding a new backend success flag alone cannot safely enable connector-
or match-based navigation. Unsupported versions must retain existing live refusal.
Server-normalized geocoder references are evidence provenance, not bearer proof
that a client actually occupies a coordinate.

For legacy payloads, keep existing gates and label missing evidence unknown. Do
not infer entrance/road class from the route name, geocoder label or provider.

## Acceptance rules

| Situation | Planning behavior | Live behavior |
| --- | --- | --- |
| Searched locality; consistent provider snap; valid geometry | Inspectable road-snapped plan; retain locality point and road anchor. A city is a broad target, not an exact vehicle origin. | Recalculate from fresh actual GPS; planning disposition grants no authority. |
| Address/POI with usable entrance/access reference | Prefer the reference for anchor selection; retain original place and record provenance. Validate selected vehicle profile/access where evidence exists. | Evaluate origin position and destination access independently; entrance metadata alone cannot bypass restrictions. |
| Geometry-only provider endpoint | Preview with explicit lower evidence; do not fabricate native snap corroboration. | Retain existing gate until required evidence for the applicable endpoint policy exists. |
| Snap outside a known selected-place boundary, conflicting road candidates, or unknown exact-property access | Mark review required and show both points. Let the user choose a different place/arrival anchor without moving their claimed vehicle position. | No automatic authorization through ambiguous access or vehicle relocation. |
| User explicitly chooses a roadside arrival point | Retain original requested place plus the newly chosen road-arrival point; describe where driving guidance ends. | Check the driven route to that point. Do not claim the property itself is reachable or mark an unverified off-road connector as driven. |
| Live GPS is stale/inaccurate, candidates disagree on carriageway, or heading/level/connectivity is unresolved | Preview may remain inspectable. | Refuse or pause live start/guidance under the existing freshness and ownership protocol. |
| Candidate route or a required driven connector conflicts with mandatory restrictions | Show an inspectable refusal where geometry is valid; explain the requirement. | Refuse; confirmation or planning purpose cannot override the conflict. |
| Malformed geometry, bad binding, corrupt indices, missing stops or stale response generation | Reject candidate publication and preserve previous journey. | Reject; preserve/recover existing guidance through current transaction protocol. |

No new automatic distance band is selected by this design. A large search radius
is candidate retrieval, not permission. Place semantics, bounds, candidate
ambiguity, vehicle profile and access evidence must drive classification. Where
those are missing, report review required instead of guessing a safe distance.
Any future numeric search/review caps require a versioned policy, recorded cases
and review before they can influence live permission.

## Live map matching: separate implementation boundary

Keep raw fixes unchanged. A matched location is a hypothesis about the vehicle's
road position, not evidence that it drove from a noisy raw coordinate across a
barrier. Before accepting new match-based live authority, require fresh accepted
fixes, reliable source-linked graph data, compatible heading/vehicle access,
ambiguity handling, plausible successive movement and a route anchored to that
same graph hypothesis. Do not promote the existing PROBABLE label or
`attributes_allowed` flag into live route permission; their current scope differs.

If the vehicle is genuinely off road, require a legally traversable access route
or keep live permission unresolved. Do not solve this by moving the raw fix onto
a permitted road. The existing live two-metre policy remains until this separate
policy is implemented, validated and reviewed.

## Implementation sequence and review boundaries

1. **Preserve evidence:** retain geocoder class/bounds/provider reference and
   entrance fields when actually returned; normalize available native provider
   endpoint evidence without changing live eligibility. Add contract tests.
2. **Planning classification:** add endpoint records and distinct planning UI;
   label ordinary locality snapping accurately. Draw requested and road-anchor
   points; represent any gap as informational, never as a navigable connector.
   Keep current live gates and active-journey transaction semantics.
3. **Arrival-point policy:** support explicit road arrival/access selection and
   provider entrance evidence. Preserve the original place; verify the route to
   the selected arrival point and all mandatory constraints. No inferred final
   property-access guarantee.
4. **Live-origin matching:** separately review the evidence contract, deployed
   source coverage and recorded driving traces. Implement only after negative
   cases establish that barriers, parallel roads, excluded areas and poor GPS
   cannot gain authority through snapping or metadata manipulation.
5. **Acceptance:** repeat stationary planning and device navigation checks, then
   review deployment separately. No production graph rebuild, data replacement,
   rate-limit change or deployment is authorized by this design document.

## Regression/acceptance matrix

- Sheffield–Doncaster capture retains exact native-snap/geometry agreement and
  offsets (23.651/22.793 m). Planning remains inspectable; live permission is not
  gained from this fixture or a client `searched`/`planning` declaration.
- Extend a separately captured search fixture with actual locality class/bounds;
  do not invent geocoder metadata for the original legacy route fixture.
- Address roof point / valid entrance; town centroid / representative road;
  missing entrance; wrong entrance; destination outside known place bounds.
- Motorway behind a property, parallel carriageways, fence/river, tunnel/bridge
  ambiguity, private access, unsupported turn restriction and disconnected road.
- GPS uncertainty, poor heading, stationary vehicle, stale/out-of-order fixes,
  expired source context, missing road dataset and source revision changes.
- Ordinary snap near an exclusion versus a snapped route/actual connector that
  enters the exclusion; preserve preference/mandatory distinction.
- Multi-stop and round-trip endpoints, coincident visits, alternative selection,
  route-binding mismatch, provider precision differences, cached legacy payloads.
- Spoofed client provenance/entrance/verified flags, purpose changes, confirmation
  attempts, old async results, endpoint edits and signaled GPS movement.
- Planning does not start GPS or live guidance; simulation grants no live
  authority; failed replacement retains the active journey and pending visits.
- Existing map/cache/traffic recovery, private-media and avoidance suites remain
  required. Local passing tests do not replace recorded device/server acceptance.

## External reference context

Public vendor capabilities inform this design, not claims about proprietary app
internals or the deployed providers' exact feature/version support:

- [Google waypoint locations](https://developers.google.com/maps/documentation/routes/specify_location)
- [Google vehicle stopovers](https://developers.google.com/maps/documentation/routes/stop_over)
- [Waze official community entry-point guide](https://www.waze.com/discuss/t/wazes-entry-point-logic/393048)
- [Valhalla location controls](https://valhalla.github.io/valhalla/api/route/api-reference/)
- [OSRM routing and map matching](https://project-osrm.org/docs/v26.6.1/http)
