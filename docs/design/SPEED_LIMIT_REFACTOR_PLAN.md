# Incremental speed-display refactor

The phone's persistent unknown limit is unresolved. This plan preserves working
navigation while separating acquisition, interpretation and presentation. It
is not a claim that a refactor fixes missing map tags or the physical-device issue.

## Verified current pathways

| Responsibility | Existing owner |
| --- | --- |
| GraphHopper max_speed details to mph maneuvers | `voyagr/services/routing/route_entries.py` |
| Accepted GPS and current route-position evidence | `static/js/app/gps-orchestration.js` |
| Legal road attributes and labelled map observations | `static/js/app/road-match-orchestration.js`, `static/js/modules/navigation/road-matching.js` |
| Source selection, async context refresh and rendering | `static/js/app/speed-widget-orchestration.js` |
| Fetch/cache helpers and numeric/unit formatting | `static/js/modules/navigation/speed-limit-widget.js` |
| Fresh source-based unit refresh, with startup/legacy fallback | `static/js/app/units-preferences-orchestration.js` |
| Separate older speed API with provider-specific logic | `voyagr/api/navigation.py`, `speed_limit_detector.py` |

The normal browser path now requests a direct primary-provider observation and
selects TomTom before Overpass observations and selected-route fallback. The older
GET endpoint remains a compatibility interface; its combined response is not used
as a primary observation. See the sixth increment for the new wiring and limits.

## First increment: one display resolver and renderer

`resolveSpeedDisplay` is a pure function in the existing speed-limit-widget module.
It returns a source kind, mph value, separate legal-alert value, observation,
badge/title and unavailable reason. It validates finite numeric values and source
kinds once. Source producers retain responsibility for freshness, direction,
geometry, applicability and GPS uncertainty; this increment does not loosen them.

Preserve normal priority: applicable matched evidence, mapped observation, route
observation, unknown. The coordinator evaluates fallback sources only when needed,
and the existing renderer consumes the same resolver. Observation values never
populate the limit used for legal-speed alerts. Invalid candidates may fall through
to a valid lower-priority source instead of preventing its display. The renderer's
badge and border now agree with the selected source even if competing inputs are
supplied. No engine/profile replacement, new persistence, network calls or public
provider-name disclosure is introduced.

Unit changes now re-resolve fresh local sources when the road coordinator is
available. This prevents a mapped/route observation from disappearing merely
because its legal-alert number is null. Keep the numeric-only formatting fallback
for startup, unavailable/stale GPS and legacy configurations; do not initiate
extra provider requests for unit changes.

## Further independently reviewable increments

1. Inspect the private phone's selected-route Info using the shared outcome
   contract described below before changing matching rules.
2. Decide whether the older API/TomTom path is supported, wired explicitly or
   retired after checking actual callers/configuration and regression coverage.
   Do not claim a provider is integrated merely because its functions exist.
3. Remove obsolete duplicate helpers only after caller/compatibility checks.

Keep API signatures compatible during migration. Use the existing full-candidate
GPS/Overpass and route-section browser checks, including unknown gaps, freshness,
source precedence and legal-alert isolation. Retest on the private phone origin;
no production deployment or merge is authorized by this document. Rollback this
increment by reverting the resolver/coordinator/renderer changes together.

## Second increment: explicit speed outcomes

Mapped-observation acquisition/assessment and display resolution share
`status` (`AVAILABLE` or `UNAVAILABLE`), `reasonCode` and a coordinate-free
`reason`. Existing observation-or-null methods remain compatibility wrappers.
The detailed assessment returns its existing observation when available; it does
not relax source freshness, GPS uncertainty, geometry, vehicle or tag rules.

| Unavailable reason | Meaning |
| --- | --- |
| `SOURCE_UNAVAILABLE` / `SOURCE_INVALID` | No usable context, or an unsupported source envelope |
| `SOURCE_STALE` / `DATASET_STALE` | Acquisition or map snapshot fails the existing age policy |
| `GPS_UNAVAILABLE` / `GPS_INVALID` / `GPS_STALE` | Missing, unusable or out-of-age accepted sample |
| `UNSUPPORTED_VEHICLE` | The observation policy does not support this vehicle context |
| `INVALID_GEOMETRY` / `SOURCE_EDGE` | Invalid road index or uncertainty extending beyond source bounds |
| `NO_CANDIDATES` | No plausible drivable way found |
| `ROAD_RESTRICTIONS` | Unsupported restrictions or incomplete source identity |
| `SPEED_TAG_MISSING` / `SPEED_TAG_UNSUPPORTED` | A candidate lacks a numeric tag or requires interpretation |
| `SPEED_CONFLICT` | Plausible ways/directions disagree |

When several candidate issues coexist, the assessment reports a deterministic
primary code; it does not claim that code lists every issue. These are per-source
outcomes: an unavailable mapped observation does not prevent a valid route value.
The display resolver has its own available source codes and `NO_USABLE_SPEED`
when none qualifies. Only the existing collapsed Info prints mapped outcome
reasons. No coordinates, raw tags, provider URLs or credentials enter that text;
no logs, uploads, caches or backend API schemas change.

Tests cover each primary reason, conflicting parallel ways in either order,
legacy output behaviour, and acquisition-to-Info propagation. The private phone's
unknown speed remains unverified until this diagnostic contract is observed there.

## Third increment: isolate fallback producers

`resolveSpeedSources` owns lazy legal → mapped → route evaluation. Each producer
failure is isolated so it cannot abort a usable lower-priority source. Stable
`SOURCE_ERROR` attempt codes omit exception messages, coordinates and URLs. Missing
or rejected values continue through the same display resolver; all failures yield
unknown and never retain a prior value. No GPS eligibility, evidence acceptance,
provider wiring or legal-alert rules change. The normal widget still does not
invoke the older speed API or TomTom. Producer exceptions are a demonstrated
fallback failure mode, not a verified cause of the physical-phone symptom.

## Fourth increment: one selection-to-state adapter

The normal source chain and legacy API success/error paths now use
`buildSpeedSelectionApplyPlan` to construct the existing widget/state update.
The adapter revalidates selected evidence with the display resolver, clears stale
legal values for advisory or unknown results, and forwards advisory observations
without granting alert authority. API acquisition, throttling, source order and
GPS eligibility are unchanged. The older API remains a compatibility path rather
than an additional provider fallback in the normal widget. No phone fix is claimed.

## Fifth increment: legacy API caller/provider audit

The normal widget uses the road coordinator and returns before the legacy fetch.
The compatibility branch in `speed-widget-orchestration.js` remains a real caller
when that coordinator is absent. Deployment smoke scripts and tests also call the
GET endpoint. The batch dispatcher has a speed-limit placeholder returning a success message
without speed data; it does not invoke the detector or supply the normal widget. These callers prevent retiring the endpoint now.

Within `SpeedLimitDetector`, a ten-minute coordinate/context-keyed candidate cache
precedes TomTom Snap (only with `TOMTOM_API_KEY`), then Overpass, then optional
road-class inference. Optional TomTom/OSM cross-checks collect diagnostics rather
than changing TomTom priority. These are candidate-source rules, not evidence of
legal applicability. The public GET does not supply trusted road evidence;
`get_speed_limit_for_location` separates its candidate estimate from the applicable
legal result. No live credentials, quota usage or provider freshness was verified
by this repository audit. Candidate cache age is not a proof of current signage.

`resolveSpeedApiResponse` now defines the frontend compatibility boundary with
`API_UNAVAILABLE`, `API_INVALID_RESPONSE`, and `API_EVIDENCE_UNVERIFIED` outcomes.
Only applicable evidence accepted by the shared resolver can yield a value here;
source strings, estimated mph and alternate km/h fields cannot grant authority.
Existing signatures and backend responses remain unchanged. Legacy parser/cache
helpers retain tests and exports; removing them is a separate compatibility task.

Explicitly integrating TomTom as an advisory normal-widget fallback would require
freshness, road/direction association, uncertainty and provider-access policies.
This increment does not silently enable new requests or reuse a cached candidate
as current road evidence. The physical-phone issue remains unresolved.

## Sixth increment: wire the primary provider into the normal widget

This supersedes the earlier audited omission of TomTom from the normal path. The
existing road owner now requests POST `/api/speed-limit/observation` using a fresh
GPS sample. This calls TomTom directly with the corrected speed-only fields and
never runs server-side Overpass, inferred road defaults or the ten-minute candidate
cache. Missing key, HTTP failure, timeout, malformed tags or incompatible context
return an unavailable outcome, so they cannot masquerade as primary successes.

The shared resolver evaluates primary TomTom → applicable road evidence/Overpass
observation → selected-route observation → unknown. Road context still acquires
independently because lanes and hazards use it too; source priority is a display
policy, not a sequential delay before loading fallback data. No second widget,
provider SDK, script loader or extra local persistence is introduced. Legacy GET
callers and exported compatibility helpers remain supported.

Primary observations are PassengerCar-only (other vehicles keep fallback), accept
GPS accuracy up to 35m and fixes at most 15s old, and are reused for at most 10s
within 35m and 45° heading agreement when both headings exist. Acquisition is
throttled to one request per 10s, with a four-second client abort and existing
three-second provider timeout. Route/vehicle changes and GPS invalidation clear
primary data and invalidate delayed responses. Simulation cannot use it. It is
a provisional mapped estimate, not proof of road identity, current signage,
conditional applicability or lane/route identity. The renderer labels it Provider
est.; it never sets the legal-alert limit or changes navigation eligibility.
Current GPS-derived local-road plausibility still rejects motorway-sized values.

The API response is no-store; there is no new candidate database/cache. Coordinates
travel to the configured primary provider as part of the authorized lookup; the
server key stays server-side. Existing upstream logging/terms remain outside this
code test. Info gives coordinate-free primary availability. Unsupported units or
non-maximum speed types fall through instead of being guessed.

Tests cover the actual Flask-to-detector request, failure/no-key/no-OSM behavior,
priority through the real road owner/coordinator/DOM, asynchronous repaint without
a GPS replay, stale/moved/heading/route/stop rejection, unit changes and legal-alert
isolation. Browser provider responses are controlled fixtures, not live credentials
or moving-phone evidence. This work must be deployed and checked on the actual
phone before claiming resolution of its persistent unknown display.

## Native GPS request correction

The first primary integration copied `GeolocationCoordinates` with `Object.assign`.
Native browser fields can be inherited getters, so that copy omits latitude,
longitude and accuracy. JSON then drops those undefined fields, the primary
endpoint rejects the request, and the widget remains on fallback. It also loses
the coordinate snapshot used to reject responses after movement.

Copy the required latitude/longitude/accuracy/heading fields explicitly, as the
accepted-GPS owner already does. A regression using inherited enumerable getters
with zero own keys fails on the old code (missing request fields) and passes on
the correction, including asynchronous widget repaint. The full-page browser
fixture now validates the actual request body before returning provider data;
its earlier unconditional success response masked the malformed request.

No source priority, provider endpoint, freshness limit, GPS threshold or alert
policy changes. This is a proven primary-provider request bug, not evidence that
it caused the older Overpass-only symptom. Actual-phone verification remains
necessary after deployment.

## Stationary jitter and primary refresh continuity

The stationary report is reproducible with a false 8.5m/s device reading while
positions remain only 9m apart inside their 12m uncertainty radii: the old raw
picker emits 19.0145mph. Before movement is established, fixes remaining inside
the combined uncertainty envelope now cannot promote themselves into speed.
The guard considers up to five recent samples (at most five seconds); established
motion or travel out of that envelope still displays normally. An explicit zero
inside overlapping uncertainty clears moving state. Missing accuracy does not
establish a stopped position. GPS noise below the display deadband resets the
movement counter rather than gradually lowering its own noise threshold.

Primary refresh formerly began at the same ten-second boundary as expiry. Refresh
now starts after six seconds while an estimate is usable, preserving the old valid
value during the request without extending its ten-second freshness or movement
bounds. Failed/unavailable acquisition keeps the ten-second retry cadence; healthy
lookups can rise from six to ten per minute. Expired values still fall through.
Heading changes alone do not invalidate an estimate when both device samples
report below 1m/s; moving/unknown-speed heading checks remain.

Regression tests fail on the previous code for the false stationary speed,
stationary heading changes and lack of early refresh. Moving-start/established
travel, stale-response rejection, expired pending refresh and no legal-alert
authority remain covered. Real-phone behavior needs rechecking after deployment.
