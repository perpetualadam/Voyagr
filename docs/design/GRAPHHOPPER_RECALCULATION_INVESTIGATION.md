# GraphHopper recalculation investigation

Investigated 9 November 2026 against main `1d8fbff7`. Runtime behavior unchanged.
One confirmed selection defect, engine fallback behavior and verified stop
preservation were found in Voyagr's shared automatic-reroute pipeline.
These observations use synthetic responses and production functions; they do not
establish the cause of a particular drive or the health of the VPS routing engine.

## 1. The first response route gates all later alternatives — confirmed

`gps-orchestration.js:1642` checks `data.routes[0]` and returns immediately when its
integrity gate refuses. Source/name selection only happens afterward through
`reroute-decision.js:buildAutomaticRerouteOutcomePlan`.

Probe: first route Valhalla with a mandatory violation; second route GraphHopper
independently permitted by the real integrity gate. The real picker would choose
GraphHopper, yet the GPS reroute handler performs **zero map updates** and clears
`rerouteInProgress` before reaching selection. This is conditional on response
order, not proof that every GraphHopper reroute fails.

Proposed first fix: assess/select eligible candidates before committing one,
without bypassing any gate. Verify refused-first/eligible-second, all-refused,
malformed candidates and stale responses. Retain current guidance on failure.

## 2. Engine continuity is best effort — policy decision needed

`reroute-decision.js:pickRerouteRouteFromResponse` prioritizes:

1. Same route name and engine family.
2. Same route name from any engine.
3. First remaining selectable route.

There is no same-engine-only fallback before step 2. With a previous GraphHopper
Optimised route, a Valhalla Optimised candidate and a GraphHopper Scenic candidate,
the production picker selects Valhalla. This explains a possible engine switch;
it is not evidence that the GraphHopper server failed. Decide whether engine
continuity or retaining the named routing intent takes precedence before changing
this fallback policy. Never retain a refused route just to keep an engine label.

## 3. Remaining stops are restored downstream — preservation confirmed

The initial builder (`reroute-map-orchestration.js:100` and
`routing-request.js:284`) omits stops. However, the outgoing fetch applies
`avoidance-integrity.js:augment` first. For a route with `leg_geometry_ranges`,
that step obtains canonical remaining visits through `VoyagrJourneyPlan.liveIntent`,
sets `stops`, clears legacy via points, and preserves stop order. It also carries a
selected arrival choice through its corresponding branch.

The corrected probe captures the **final serialized fetch body**, with the browser's
window/global route property correctly mirrored in Node. One pending visit is
present in the outgoing request; once its leg is completed the augmented body has
zero remaining stops. An earlier intermediate-builder observation suggested stops
were missing; that conclusion was too broad and is withdrawn. Normal automatic
rerouting has not been shown to lose stops by this investigation.

The augmentation is conditional on leg-range metadata. Legacy/malformed metadata
and full durable replacement deserve additional coverage, but are not established
normal-path stop-loss defects. Preserve this existing behavior when fixing route
selection rather than rewriting it based on the intermediate body alone.

## Existing behavior verified during the trace

- Reroute bodies set `is_reroute=true` and `force_refresh=true`. The backend cache
  bypass explicitly recognizes both (`route_cache_key.py:should_bypass_route_cache`
  and the route endpoint), so this path requests fresh routing.
- Avoidance preferences and normalized assessment requirements are carried by
  the request builder/integrity augmentation. Selection and map replacement retain
  integrity/geometry/intent checks. Their refusal is distinct from engine failure.
- Default off-route detection uses a 50 m base threshold widened by GPS accuracy,
  three consecutive readings, then a 10-second dwell. Accuracy above 65 m is not
  trusted for deviation. A 30-second debounce and post-reroute grace also apply.
- Rerouting is suppressed within 100 m of arrival. Initial route joining has an
  85 m gate; successful replacement can seed the joined state.
- Network/error retry delays are 4, 6.5, 10 and 14 seconds, with active-journey and
  auto-reroute guards. The first-candidate integrity refusal exits without that
  network-failure retry schedule; a later GPS deviation can trigger another attempt.
- Browser fetch has cancellation via the integrity request ticket. A separate
  client wall-clock deadline is not visible in this automatic-reroute handler;
  server cooperative request budgets exist. A hanging transport scenario has not
  been reproduced here and is a separate follow-up, not a confirmed outage.

## Reproduction and validation

Run `node scripts/diagnose-graphhopper-recalculation.cjs`. It uses jsdom, production
GPS/request/picker functions and deterministic device/network/map adapters, without
contacting a routing server, saving a journey or changing production data. Output
records current observations, rather than asserting that defects should persist.
Selected observations at the investigated revision (the stop object is abbreviated):

```json
{
  "first_candidate_probe": {
    "graphhopper_independently_allowed": true,
    "picker_would_choose": "GraphHopper",
    "actual_map_updates": 0,
    "in_progress_after": false
  },
  "request_probe": {
    "remaining_stops_in_active_context": 1,
    "stops_in_final_request": ["one synthetic remaining visit; see script output"],
    "via_points_in_final_request": [],
    "preserve_stop_order": true,
    "stops_after_visit_completed": 0,
    "force_refresh": true,
    "is_reroute": true
  },
  "engine_probe": { "previous": "GraphHopper", "picked": "Valhalla" }
}
```

Baseline verification: 3,291 JavaScript tests with coverage/lint; declared web
backend selection 2,244 tests plus 74 subtests passed, one skipped. Existing suites
passing do not invalidate the uncovered scenarios above. No runtime patch, live
VPS test, deployment or production configuration/data change was made.

## Resolution of finding 1

The eligible-alternatives fix validates each candidate before the existing picker,
retains the route if none qualify, and preserves independent final map checks.
Non-object alternatives are excluded before provenance tagging. The diagnostic now
records `actual_map_updates: 1` instead of `0`; remaining-stop preservation and
engine-fallback observations are unchanged. The historical output above records
the investigated revision. Real-device/server acceptance still remains pending.
