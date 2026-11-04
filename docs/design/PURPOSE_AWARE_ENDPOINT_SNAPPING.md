# Purpose-aware endpoint snapping: evidence inventory and implementation design

Status: phased implementation, 3 November 2026. Original design baseline: main
`fd4f3df2`. Implementation notes below distinguish shipped evidence contracts from
future arrival-selection and live-authorization work. No deployment is implied.

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

## First implementation: planning evidence

The first slice carries bounded autocomplete metadata from origin/destination
selection through canonical request context to a per-alternative
`endpoint_resolution` response. Metadata is bound to the requested coordinate;
edits and saved selections discard stale search evidence. Swapping and restoring
endpoints preserve the corresponding metadata. TomTom entry points are retained
as candidates, without moving the requested point or asserting access legality.

Version 1 records retain requested coordinates, routing geometry anchors, native
provider snaps when supplied, measured offsets, ordered stop identity and the
assessment's geometry binding. Native snaps consistent with geometry can receive
`ROAD_SNAPPED` planning presentation when within the existing continuity tolerance,
or when a searched locality's declared bounds contain both points. Locality
metadata remains untrusted request metadata. Geometry-only, mismatched or missing
evidence requires review. Every record has `navigation_authority: NONE` and
`access_evidence: UNKNOWN`; the existing live gate and mandatory restriction checks
remain unchanged. No connector is inferred or drawn.

Preview notices display this planning classification and offsets separately from
navigation warnings. Legacy responses remain supported. Each alternative keeps
its own record; stale cached records are recomputed server-side. Ordered stops
receive geometric resolution records, but autocomplete evidence capture for new
intermediate stops remains future work.

Regression coverage includes the captured Sheffield–Doncaster provider response,
synthetic locality metadata explicitly separated from captured evidence, the HTTP
assessment-to-browser candidate preparation path, malformed/spoofed metadata,
mandatory restrictions, ordered stops and single-route envelopes. Verified arrival
access, road-edge identity, provider matching and fresh-GPS live authorization
remain subsequent phases requiring their own acceptance evidence.

## Arrival-reference correspondence policy, version 1

The next implementation adds `arrival_access` evidence to destination and ordered
stop records, scoped to the enclosing alternative's geometry binding. It compares
sanitized geocoder entry references with that alternative's routing anchor. It
never selects an entrance, relocates a request or calls an additional paid API.

| Evidence | Result |
| --- | --- |
| No valid reference | `NO_REFERENCE` |
| Multiple distinct reference coordinates | `AMBIGUOUS_REFERENCES` |
| Single reference outside supplied place bounds | `REFERENCE_OUTSIDE_DECLARED_BOUNDS` |
| Missing, geometry-only or mismatched native snap evidence | `UNCORROBORATED_ANCHOR` |
| Single reference agrees with native-consistent anchor within the existing encoding tolerance | `ANCHOR_ALIGNED_REFERENCE` |
| Otherwise | `DIFFERENT_ROUTING_ANCHOR` |

The rules run in table order. Duplicate coordinates do not constitute competing
entrances. Missing bounds stay unknown; they are not treated as positive coverage.
Straight-line distances to requested and routed points are measurements only,
never connector lengths. Provider name/reference and entrance type retain their
`request_metadata_only` provenance. No status establishes road identity, vehicle
profile compatibility, barrier absence, legal access or mandatory-connector
compliance. Every result has selection `NONE`, vehicle access `UNKNOWN`, connector
`NOT_EVALUATED` and navigation authority `NONE`.

Preview notices explain correspondence or the reason review is needed, with fixed
text rather than rendering supplied entrance labels. Unsupported policy versions
or authority claims are not presented. Existing route and navigation gates remain
unchanged. Regression tests cover alternatives, ordered visits, duplicate/invalid
references, conflicting authority claims, mandatory refusals, and the HTTP response
through the shipped browser route normalization and preview summary.

Explicit arrival-point selection and rerouting, trusted access provenance and
vehicle/connector validation remain future work. Coordinate alignment is not an
implementation of those checks and must not be promoted into permission.

## Explicit driving arrival selection

An optional Driving arrival point field uses the existing search service. Users
can select a named car park, entrance or roadside address, then calculate again.
There is no automatic nearest-car-park selection, parking availability promise,
entrance legality claim or walking-route calculation. A selected parking POI may
still represent its centre rather than a vehicle entrance; users must check this.

The routing request uses the explicit choice as `end`. Canonical journey context
retains the original place under a versioned `arrival_choice.requested_destination`
and binds the choice target to the actual routed destination. Context remains
request metadata, with navigation authority NONE and onward connection unchecked.
Existing geometry, endpoint continuity, vehicle restrictions and mandatory
avoidance gates evaluate the route to the chosen point, never an invented connector
to the original place. This does not relax GPS start requirements.

Changing the destination selection or swapping endpoints clears the arrival field;
stale or edited arrival text cannot publish a new request. Round trips require
clearing the one-way arrival choice. Saved previews restore the original place and
arrival fields separately. GPS recalculation and deviation rerouting retain the
arrival target and original place, with existing cancellation and ownership rules.
A separate planning notice prevents the periodically refreshed navigation-safety
warning from overwriting endpoint/arrival information.

### Arrival search resilience

Route preparation failures, including an unselected arrival, now produce an
on-screen warning and release their request ticket on all exit paths. They do
not send a route request, replace the active journey or change safety authority.
Autocomplete aborts superseded requests and rejects stale responses by generation
and input identity. Provider failures show retry guidance, separately from valid
empty results. Nominatim transport, JSON and result-list errors are classified as
provider unavailability so existing retries/fallbacks can run; provider exception
content is not returned for those expected errors.

For generic car-park/parking searches in the arrival field, returned candidates
are ordered by straight-line proximity to the currently selected destination.
Distances are labeled explicitly; they are not driving or walking distances.
Specific-name searches retain provider ordering. The candidate set still comes
from the existing search service: this is no exhaustive nearby parking search,
entrance verification, availability check or automatic selection.

## Destination-context parking search: bounded objective

Typing only `car park`, `car parks`, `carpark`, `carparks` or `parking` in the
optional arrival field now uses the selected destination coordinate as search
context. The map centre and current GPS position are never substituted. Missing
or unresolved destinations prompt a selection rather than guessing a location.
Named/explicit-location queries keep the existing geocoder path and provider order.

A dedicated candidate endpoint uses the existing configured Overpass client to
retrieve parking nodes, ways and relations in a fixed 2 km radius. It supports
feature centres for candidate selection, not verified vehicle entrances. The query
is capped at 200 features and the response at 10 distance-ranked candidates; this
is not an exhaustive inventory or a guarantee that every nearby car park appears.
The 2 km radius is a search boundary, never a permitted navigation-snap distance.
Acquisition respects a 12-second budget and any tighter parent budget. Provider
failure is a retryable failure, distinct from a valid empty search.

The UI states the destination and radius, labels straight-line distances, shows
reported access tags as unverified, and requires explicit user selection. Cache
keys and pending-response ownership include the destination label, coordinates
and selected search metadata. Destination edits clear the selected arrival;
late responses cannot populate the new destination's results. Focusing a selected
endpoint preserves its coordinate. Preview labels name the selected arrival and
retain the original destination independently for each route alternative.

Acceptance coverage includes the actual HTTP boundary with mocked acquisition,
retrieval before top-result truncation, invalid coordinates, malformed/duplicate
features, provider/deadline failures, parent-budget preservation, Overpass
provenance, contextual browser requests/cache ownership, literal named queries,
stale responses and preview labels. These are synthetic/provider-mocked checks;
production provider coverage, opening/access legality and physical GPS navigation
remain unverified. Navigation gates and mandatory restrictions are unchanged.

## Reported-access shortlist policy, version 1

Nearby parking is ranked across the retrieved candidate set before the top-ten
response limit: named reported-general access, named customer-only access,
unnamed reported-general access, unnamed customer-only access, named unknown,
unnamed unknown, named restricted/private, then unnamed restricted/private.
Distance and stable source identity break ties within a tier. Blank and generic
names such as “Parking” do not count as meaningful names. Restricted candidates
are retained farther down; absence from the top ten is not a claim of absence.
The browser preserves this server order for bare nearby-parking searches.

Reported access uses motorcar, motor_vehicle, vehicle and access tags in that
specificity order. More-specific prohibitions cannot be hidden by general `yes`.
Conditional rules and conflicting positive/restricted reports are classified as
unknown pending review. All relevant reported values remain visible, with explicit
customer eligibility, restriction, unknown-access and unparsed-opening warnings.
None establishes current opening, availability, entrance reachability or permission.
Every candidate still has `access_verified: false`; selection passes only bounded
request metadata and cannot change navigation authority.

### Proposed access-validation acceptance criteria — future work

A validated driving arrival would require a versioned policy and evidence that:

1. The chosen facility and actual vehicle entrance are identified separately from
   its mapped centre and original requested destination.
2. The entrance is connected to the selected route's directed road graph, with
   approach direction, one-way/turn restrictions, barriers and levels resolved.
3. Complete applicable vehicle, ownership/permission, customer/permit and timed
   access rules have been evaluated for the selected vehicle and arrival time.
   A user declaration cannot override an explicit prohibition or missing evidence.
4. Any required driven connector has actual traversable geometry and passes all
   mandatory restrictions; no straight-line connector is invented.
5. The result carries source/revision, verification time and binding to the selected
   entrance, route geometry, vehicle profile and time context. Relevant changes,
   stale/missing sources or conflicting evidence invalidate it.

These are acceptance criteria, not implemented checks or guaranteed legal truth.
Any eventual validated status must say which evidence was checked and which
limitations remain. It would cover the chosen driving arrival, not an uncomputed
onward walk to the original place. Fresh-GPS origin validation and live journey
ownership remain separate requirements even after arrival validation succeeds.
