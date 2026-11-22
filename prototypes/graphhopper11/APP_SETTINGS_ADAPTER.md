# Real-app settings preflight

This is an offline adapter, not an enabled app connection or a deployed service.
`app_settings_adapter.adapt_settings()` accepts only settings, retains every
supplied field and derives all 13 avoidance rows using the same dependency-free
normalizer that `voyagr/services/routing/integrity.py` re-exports. The extraction
preserves existing production normalization behavior; it changes no configuration.

`compile_app_settings()` applies the registered-case capability compiler. Unsupported
mandatory rules still refuse preview. Camera toggles cover the three camera
categories without disabling ordinary traffic signals or railway crossings.
Electric/CAZ exemptions and explicit per-category overrides retain legacy semantics.
Non-car profiles remain non-car and are refused by the current compiler.

Malformed values, unknown fields, extra explicit-rule fields, conflicting profiles
and nonempty private avoid points refuse instead of being coerced or dropped.
This settings-only interface deliberately rejects full routing bodies containing
coordinates, cost inputs or client proof claims. Callers must explicitly construct
the supported settings contract; it is not safe to filter unknown fields silently.

Scenic/quiet, optimization and detour selections remain in the supplied settings,
fingerprint and supplemental UNVERIFIED report. The existing app applies detour
as a route-variety preference, with exceptions in `route_variety.py`; this adapter
does not claim a strict detour bound. Include-cost flags remain distinct from
avoidance flags. No general preference implementation, route-cache connection,
HTTP endpoint, saved-reference extension or browser activation is added here.
`app_integration_allowed` and `navigation_allowed` are always false. The canonical
policy's preview flag is only a registered-case avoidance preflight result, never
permission to ignore supplemental settings or submit to the real app.

Next milestone: bind the complete settings fingerprint and supplemental capability
report into the isolated service's manifest, cache and restored references before
adding an opt-in browser bridge. This must fail closed for unsupported constraints
and cannot infer coverage or authority from selected fixture successes.

Validation: `tests/test_gh11_app_settings_adapter.py` runs the actual JavaScript
shared-request builder with synthetic settings and no cost/location/storage input,
then checks Python normalization and capability decisions. It also covers defaults,
master-switch behavior, camera/signal separation, exemptions, strict input rejection,
profile preservation and fingerprint changes. No phone acceptance or VPS change
is established by these offline tests. Milestone 3 remains in progress.
