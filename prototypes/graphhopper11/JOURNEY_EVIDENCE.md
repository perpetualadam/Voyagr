# Ephemeral journey-evidence boundary

The isolated package exposes `VoyagrGH11JourneyEvidence.create()` for a future
reviewed host integration. It reuses the actual `VoyagrSpeedGps.validateNavigationGpsFix`
implementation (`static/js/modules/navigation/speed-gps.js`) and the accepted-origin
shape exposed by `getAcceptedOriginFix()` in `static/js/app/gps-orchestration.js`.
It does not load GPS orchestration, call geolocation, start tracking, read a saved
journey, send coordinates, persist evidence or enable navigation.

A host must explicitly provide owner `capture/current`, a journey `capture/current`
contract containing route_id, monotonic generation, active and simulating flags,
and the GPS accepted-origin getter. The journey snapshot contract is a new isolated
adapter interface, not an existing UK runtime API. Production wiring remains pending.
The host must advance generation on every start, stop, replacement and simulation
transition; this guard cannot discover transitions the host never reports.

Captures are opaque, frozen tokens with location evidence held only in a WeakMap.
Current checks require confirmed owner and journey identity, an active real journey,
the exact same accepted fix, and the shared validator's freshness/accuracy checks.
A new fix, owner epoch, route generation, stop, simulation or stale fix invalidates
pending work. An observed invalid token cannot revive. Older accepted timestamps
are refused within one guard's lifetime; a new guard represents a new lifecycle.
Closing invalidates all tokens. `run(work)` checks evidence before and after async
preview work, but callers must still check immediately before their own UI commit.
It cannot undo side effects performed inside work. No result becomes routing or
navigation authority merely by passing this context guard.

Shared validation accepts fixes up to 15 seconds old and one second in the future,
with finite nonnegative accuracy. Large uncertainty is not a verified road match.
This module intentionally does not invent an accuracy threshold, legal/hazard
compliance, heading, road association or reliable navigation evidence.

Deterministic JavaScript regressions cover stale/future/invalid fixes, uncertainty,
unknown clock, timestamp regression, mutable captures, owner changes, route changes,
stops, simulation, async completion and closure. The existing saved-plan Chromium
scenario also exercises this packaged module with synthetic in-memory sources.
No actual phone GPS or production owner/journey has been accessed. Current registered
HTTP route requests remain public fixture cases; arbitrary phone-origin routing is
still refused. Milestone 3 remains in progress and production migration is NO-GO.
