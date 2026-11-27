# Registered fixed-order mixed stop/via preview

27 November 2026. Original Milestone 3 journey-contract work, continuing PR #540.
This adds preview behavior; navigation and automatic selection remain disabled.

## Contract and execution

The existing UK fixed-order contract is `via_points` followed by `stops`
(`voyagr/services/routing/multidrop.py` and `journey_context.py`). `original_index`
identifies a visit; it does not sort those arrays or imply insertion chronology.
The isolated bridge now accepts their combination for an operator-registered
`continuous_no_turn_reset` stop-preview case, with at most three intermediate
visits and alternatives disabled. All coordinates must match the complete
registered journey in that order. No production registry is changed; the new
`matrix_mixed` case exists only in the generated synthetic test registry.

Request fields, types, labels, provenance, original indices and stop durations
are retained. Missing indices use positions in the complete ordered list; explicit
indices must be unique across both arrays. A via cannot carry a duration. Actual
stops retain their default/zero/explicit dwell handling and total-dwell validation.
Optimization, scheduled departure/time windows, changed order, unknown journeys
and unsupported mandatory rules still refuse. The public general normalizer does
not grant registered stop execution authority.

One continuous GH11 calculation and existing independent candidate/turn/trace/
waypoint checks cover all legs. No leg is routed independently and no turn history
is reset. The response preserves:

- `journey_context.ordered_visits`: every intermediate visit with explicit type.
- `journey_context.ordered_stops`: actual stops only.
- A typed incoming-leg `visit`; a `stop` marker only on actual stopping legs.
- Driving, dwell and total timing, without adding dwell to pass-through vias.
- UNVERIFIED stopping access and explicit navigation/automatic-selection refusals.

The UK page can inspect the three-leg mixed preview. Inspection checks types,
index uniqueness, dwell, complete ranges and agreement between typed visits and
actual stops. It refuses malformed mixed metadata rather than using the old
stop-count-only check. Saved restoration preserves each type and marks both kinds
of provenance as saved. Fresh/live continuation explicitly refuses typed mixed
plans; it cannot silently turn vias into stops or omit them. Existing device
records are not migrated, replaced or deleted.

## Acceptance evidence

Pure regressions use actual UK request builders/default planning context. They
verify canonical ordering, no sorting by identity, exact request retention, zero
dwell and refusal of duplicate IDs, attempted via dwell, invalid arrays,
optimization and scheduled departure. Browser-side tests cover complete inspection,
saved projection/provenance, live-continuation refusal and malformed visit/leg data.

Real Java tests on a generated graph verify zero/15-minute mixed routes and fresh
restoration, three complete legs, zero selected forbidden traversals, stop-only
dwell and changed-reference refusal. An authenticated HTTPS cache test changes a
via into a zero-minute stop with the same coordinates/total dwell: the binding
changes; an injected engine outage returns 504 instead of borrowing old evidence.
The old cache entry is unchanged; an altered restore reference returns 409.

`test_real_chromium_full_uk_mixed_visit_preview` boots the disposable full UK page,
adds a via and stop with normal controls and calculates actual registered Java
results. Zero/15-minute previews render three legs and refuse Start. A malformed
final Java leg refuses the whole response and retains the prior preview;
optimization refuses before Java. Actual device save/reload/use retains types,
timing and Start refusal. The earlier pure-stop scenario remains covered by the
shared runner. The test server blocks outbound connections and browser requests
to other origins abort. All graphs, coordinates and device storage are synthetic.

```sh
.venv/bin/python -m pytest -q tests/test_gh11_app_request_bridge.py tests/test_gh11_app_settings_adapter.py
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py -k mixed
GH11_BROWSER_ACCEPTANCE=1 GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py \
  -k 'full_uk_mixed_visit_preview or full_uk_continuous_stop_preview'
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

## Remaining original scope

PASS applies only to registered via-then-stop previews. Arbitrary interleaving,
general journey execution, stopping maneuvers, multi-stop alternatives, optimization
and time-dependent routing remain unsupported. Trusted general road/hazard
association is a Milestone 4 dependency; physical-phone behavior, capacity and
deployment remain unverified. Milestone 3 remains PARTIAL; this does not create a
new milestone. Production migration remains NO_GO. No merge, deployment, VPS2
access or production authentication/configuration change is included.
