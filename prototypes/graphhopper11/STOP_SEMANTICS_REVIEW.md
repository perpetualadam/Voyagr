# Milestone 3 stop semantics: execution remains blocked

27 November 2026. Read-only source investigation plus isolated regressions.
No production code, endpoint, configuration, graph or service is changed.

## What the source actually does

- `static/js/modules/navigation/routing-request.js:mapStopsForApi` sends
  `type: stop` and a duration, defaulting to 15 minutes when missing. A zero-minute
  stop is still explicitly a stop. `mapViaPointsForApi` separately sends `type: via`.
- `static/js/modules/navigation/journey-plan.js:requestContext` includes stop
  coordinates/provenance. Saved/live continuation additionally relies on ordered
  stop context and complete leg geometry; a list of via ranges is insufficient.
- `app_request_bridge.py:normalize_app_request` refuses nonempty stops, nonzero
  total stop time, time-sensitive requests, round trips and optimization of
  intermediate visits. An optimization flag with no visits is retained as a no-op.
  Its planning context currently requires an empty stop list.
- `ReadOnlyRouteRegression.java:runCase` sends `pass_through=true` whenever there
  are more than two visits. Native alternatives currently require two points.
  There is no dwell-time or stopping-arrival/departure implementation here.
- `isolated_app.py:app_preview` publishes preview-only waypoint/leg ranges and
  instruction intervals. It does not synthesize arrival/departure stop events or
  stop timing. Navigation and automatic selection remain false.
- `DirectedGraphProbe.java:turnFixture` already demonstrates a restricted turn
  between otherwise individually routable legs. Shared coordinates do not prove
  a legal join. Stopping must not be assumed to erase imported restrictions.

Therefore merely turning off `pass_through`, adding dwell time to total duration,
or concatenating separate legs would not establish correct stopping semantics.
This review does not claim that GraphHopper cannot support a suitable design.

## New acceptance evidence

`test_stop_and_time_capability_refusals_cannot_reuse_valid_private_cache` first
executes a valid registered request through the real local Java runner over a
generated synthetic graph and populates the actual private HTTPS capability cache.
It then submits seven changed journey requests through authenticated app-policy,
app-route and app-restore handlers:

1. Explicit zero-minute stop.
2. Fifteen-minute stop.
3. Nonzero total dwell time.
4. Optimization with an intermediate visit.
5. Round trip.
6. Scheduled departure.
7. Time-window request.

All return explicit HTTP 422 refusals with navigation false. No changed request
executes Java or reaches cached-evidence validation, and the earlier cache entry
remains unchanged. These are HTTP boundary tests, not physical-phone, browser
retention, arbitrary-route or general stop correctness tests. Existing full-page
journey retention evidence is recorded separately in UK_SAVED_RECOVERY_ACCEPTANCE.md.

Reproduce with the pinned local JAR and existing test dependencies:

```sh
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py \
  -k stop_and_time_capability
```

## Implementation requirement, not another diagnostic milestone

The remaining Milestone 3 stop task is a coherent stopping-journey implementation:

1. Preserve distinct ordered stop/via records, provenance, original indices and
   dwell duration through request parsing, binding, restore and response context.
2. Specify arrival/departure road and direction constraints, and validate actual
   continuous turn transitions at leg joins. Do not infer legal access, parking or
   reversal permission from a stop coordinate or a dwell duration.
3. Execute with one complete mandatory policy; validate every candidate/leg and
   join before publication. Unsupported multi-stop alternatives must refuse, not
   ignore stops, pad alternatives or fall back to another engine.
4. Project complete leg geometry, maneuvers, ordered stop context and separate
   driving/dwell/total timing through the actual application, save and restore.
5. Run deterministic zero/default-duration, restricted-join, duplicate-stop,
   one-way, malformed-last-leg and stale-policy cases, then the normally booted
   full-page acceptance. Keep navigation disabled until the broader gates pass.

Trusted arbitrary stop-to-road association/coverage is a Milestone 4 dependency.
Time windows, departure-dependent routing and stop-order optimization need their
own explicit supported semantics; successful fixed-order stops cannot imply them.
No additional index/import research is authorized by this review.

Status: refusal boundary PASS in the tested scope; stopping execution BLOCKED by
the missing semantics/validation above. Milestone 3 remains PARTIAL; production
migration remains NO_GO. This checkpoint does not complete a new roadmap milestone.
