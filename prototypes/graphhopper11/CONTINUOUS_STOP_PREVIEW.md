# Registered fixed-order continuous-stop preview

27 November 2026. This implements one conservative stopping-preview contract.
Milestone 3 remains PARTIAL; production migration remains NO_GO.

## Implemented behavior

An operator-owned registered case may explicitly declare
`stop_preview_mode: continuous_no_turn_reset`, with alternatives disabled. This
field belongs to the manifest-bound registry, never the client request. Existing
registries are not rewritten or automatically opted in. Only the generated test
registry's `via` case opts in in this change.

For that case, the complete-request bridge accepts up to three fixed-order stops
whose coordinates exactly match every intermediate registered visit. It retains
names, provenance, original indices and dwell durations (default 15 minutes;
explicit zero preserved; each duration finite and between 0 and 1,440 minutes).
Duplicate indices, malformed stops, changed total dwell, mixed stop/via requests,
reordering, scheduled departures, time windows and round trips refuse. An explicit
`preserve_stop_order: false` also refuses. Other cases still refuse nonempty stops;
the general normalization API does not grant stopping execution authority.

The runner executes **one continuous route**, retaining its pass-through direction
and turn history across the registered stop coordinates. Its report now states
the pass-through mode; the independent validator requires that evidence for an
opted-in case, alongside existing full geometry, directed traversal, imported turn,
waypoint, instruction and exclusion checks. There are no independently concatenated
legs and no turn-history reset on arrival. This deliberately supports only stopping
and resuming along the same continuous route. It does not plan a parking entrance,
roadside maneuver, U-turn, direction reset or live stop-arrival event.

After complete route validation, the response records:

- Ordered stop context and each stop's incoming leg/waypoint.
- `driving_duration_minutes` from the engine's validated route.
- `dwell_duration_minutes` from the bound request.
- `duration_minutes` as driving plus dwell, without adding dwell to driving maneuvers.
- Explicit `continuous_no_turn_reset` semantics and UNVERIFIED stopping access.
- Navigation and automatic selection false.

These are planning estimates. No traffic prediction, legal permission to stop,
parking availability, physical arrival or road/heading attestation is claimed.
The full request, including dwell and stop metadata, binds into cache keys and
restore references. A changed duration cannot replay an earlier reference.

Route normalization/selection now retain this timing and clear it when selecting
an ordinary route. Device save/restore retain separate timing and the restrictive
stop mode; saving never upgrades access verification or navigation permission.
Existing browser data is not migrated or replaced.

## Verification

Real local Java on a generated graph verifies zero/default/explicit-duration
stops, complete leg geometry and instruction retention, forbidden traversals zero,
recalculated restore, changed-duration reference refusal and missing-continuity
refusal. The existing native restricted-turn fixture also passes: independently
routable legs cannot bypass the imported forbidden turn at their join. That remains
bounded turn evidence, not general legal completeness.

The new real-Chromium scenario `test_real_chromium_full_uk_continuous_stop_preview`
boots the disposable full UK page, uses its actual stop controls and Calculate,
reaches Java through the test-only connection, mounts the route, checks zero/15
minute timing and two leg ranges, saves through actual device storage, reloads and
restores it, and verifies actual Start refusal. A discovered timing-projection
loss in route normalization was corrected; assertions were retained. The fixture
blocks external provider requests and uses only synthetic coordinates/storage.

Focused request/settings tests, native registered app checks, JavaScript save and
selection tests and the required UK backend selection run locally. Committed-head
CI is a separate result. The earlier eight checks on `b81f828b` passed before this
implementation; they are not validation of the new code.

```sh
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_app_request_bridge.py \
  tests/test_gh11_isolated_app.py -k 'registered_continuous_stop or registered_stop_preview or stop_and_time_capability'
GH11_BROWSER_ACCEPTANCE=1 GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py -k full_uk_continuous_stop_preview
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

## Remaining original scope

This supplies fixed-order dwell planning on explicitly registered continuous
routes. Arbitrary stops, mixed visits, arrival/departure maneuver constraints,
multi-stop alternatives, optimization and time-dependent routing remain unsupported.
General trusted stop-to-road/hazard association is still a Milestone 4 dependency.
Physical-phone behavior, VPS capacity and deployment remain unverified. No UK
production handler, authentication, service, dataset or configuration was changed;
no merge or deployment is authorized.
