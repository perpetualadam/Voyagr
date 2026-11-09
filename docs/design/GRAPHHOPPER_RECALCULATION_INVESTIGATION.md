# GraphHopper recalculation investigation

Investigated 9 November 2026 against main `1d8fbff7`. Runtime behavior unchanged.
Three findings in Voyagr's shared automatic-reroute pipeline affect GraphHopper.
These observations use synthetic responses and production functions; they do not
establish the cause of a particular drive or the health of the VPS routing engine.

## 1. Remaining stops are absent from the automatic reroute request — fix first

`voyagr-app.js:949` delegates to `reroute-map-orchestration.js:100`, which calls
`routing-request.js:284`/`:255`. That path collects origin, final destination,
avoidance/preferences and costs, but does not collect the active continuation,
remaining stops, via points or journey context. The automatic GPS handler sends
that body without adding them (`gps-orchestration.js:1624`).

The probe supplies a selected GraphHopper journey with one remaining stop. The
actual builder emits no `stops`, `via_points` or `journey_context` fields. Thus a
recalculation can request a direct trip to the final destination instead of the
remaining visit sequence. The map replacement installs the returned candidate and
resets progress (`reroute-map-orchestration.js:300`); it does not reconstruct the
omitted visits there. Full live replacement and durable checkpoint consequences
need a focused regression before a fix; no production journey was mutated here.

Proposed first fix: obtain the canonical remaining continuation, preserve ordered
visits and arrival intent, and reject missing/inconsistent continuation rather than
silently dropping it. Verify completed visits are not restarted, remaining visits
are not skipped, and cancellation/ownership races retain the current journey.

## 2. The first response route gates all later alternatives — confirmed

`gps-orchestration.js:1642` checks `data.routes[0]` and returns immediately when its
integrity gate refuses. Source/name selection only happens afterward through
`reroute-decision.js:buildAutomaticRerouteOutcomePlan`.

Probe: first route Valhalla with a mandatory violation; second route GraphHopper
independently permitted by the real integrity gate. The real picker would choose
GraphHopper, yet the GPS reroute handler performs **zero map updates** and clears
`rerouteInProgress` before reaching selection. This is conditional on response
order, not proof that every GraphHopper reroute fails.

Proposed second fix: assess/select eligible candidates before committing one,
without bypassing any gate. Verify refused-first/eligible-second, all-refused,
malformed candidates and stale responses. Retain current guidance on failure.

## 3. Engine continuity is best effort — policy decision needed

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
At the investigated revision:

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
    "stops_in_request": null,
    "via_points_in_request": null,
    "journey_context_in_request": null,
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
