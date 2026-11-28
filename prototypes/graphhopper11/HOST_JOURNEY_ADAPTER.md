# Explicit UK host-contract adapter — isolated only

`VoyagrGH11HostJourney.create({owner,modes,lifecycle,gps,eventTarget,onChange})`
returns the existing journey guard's owner/journey/GPS source contract. It does not
import, discover or start any service. A reviewed host would explicitly supply:

- `VoyagrLocalData.capture/current`, without calling ready/db/migration.
- `VoyagrJourneyModes.captureIntent/intentCurrent/onIntentCancelled`, getState,
  isSimulating, isJourneyCommitPending and isAbandoning (journey-modes.js).
- `VoyagrNavigationLifecycleOrchestration.getRouteInProgress/getRoutePolyline`,
  getNavigationStarting and getNavigationFailure (navigation-lifecycle-orchestration.js).
- `VoyagrGpsOrchestration.getAcceptedOriginFix/onAcceptedOriginFix` (gps-orchestration.js).

The adapter requires confirmed LIVE state, no simulation, pending commit,
abandonment, startup or navigation failure, and valid active two-dimensional
geometry. It watches the real `voyagr:journey-state-change` and local-owner events,
and subscribes to the actual intent cancellation API. It never invokes a route
setter, navigation action, location request, database, auth service or network.

Internal generation changes bind intent, owner epoch, polyline object and exact
geometry content. Replacement with identical coordinates and observed in-place
mutation both invalidate. Exact geometry serialization is transient memory only,
never exposed or logged; it is cleared on close. It is context equality, not
road/hazard/turn compliance or authentication. A 100,000-point bound refuses larger
geometry. Performance at that bound has not been benchmarked.

The adapter now subscribes explicitly to accepted-origin notifications, with
`onChange` forwarding to the bound viewer's `refresh()`. The GPS module emits a
no-argument notification only after storing a changed accepted fix. Invalid or
identical fixes do not notify; observer exceptions cannot interrupt GPS processing.
The host must still call `host.refresh()` after geometry updates and any uncertain
lifecycle transition. There is no polling or new GPS watcher.
Without notifications, operation checks detect the current difference, but cannot
reconstruct a transition that changes and reverses entirely between observations.
The real intent epoch and lifecycle notifications remain required. Close removes
GPS, lifecycle and intent listeners/subscriptions, invalidates evidence and leaves the host state untouched.

The module is an authenticated, source-hashed asset in the isolated package. No UK
script tag or runtime binding is added. Its browser test uses synthetic API-shaped
sources; focused unit tests reuse the actual journey intent clock/cancellation and
actual lifecycle geometry/setter implementations, with an explicitly simulated LIVE
state. These are not live navigation or physical-phone tests. Production GPS,
account state, saved journeys and location history are not accessed.

Still pending: actual UK binding, accepted-fix refresh integration, end-to-end
navigation/reroute/rollback evidence and physical-phone acceptance. Registered-case
restrictions and disabled navigation remain in place. Milestone 3 is in progress;
production migration remains NO-GO.
