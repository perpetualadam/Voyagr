# Voyagr GPS and map matching audit

## Pipeline and verified change

`static/js/app/gps-orchestration.js` receives watchPosition fixes, normalizes samples through speed-gps, updates position/history, computes marker snapping/heading/speed, and runs ETA, hazards, route deviation and rerouting. `speed-gps.js` contains stationary/displacement filtering, smoothing, snap hysteresis and watch-restart plans. Reroute decision helpers use sustained deviation, join state, thresholds and retry state; these are heuristic geometry rules, not a full sensor-fusion map matcher.

P1 GPS-01: browser watch callbacks previously marked every received fix fresh before checking age, coordinate validity or horizontal accuracy. Added `speed-gps.js:validateNavigationGpsFix` and wired it before any navigation mutation/freshness update. Only finite in-range coordinates, finite nonnegative accuracy <=150m, timestamps <=15 seconds old and <=1 second in the future, and timestamps newer than the last accepted fix are admitted. Rejected samples retain marker coordinates and prior freshness and show “GPS unreliable — showing last reliable position.” A stale fix cannot postpone the existing watch-health restart timer. No current position or movement is extrapolated.

These thresholds are explicit conservative engineering defaults, not validated automotive accuracy requirements. A 150m fix is still inadequate for lane occupancy or adjacent-road disambiguation. Tightening thresholds further needs device replay evidence. Duplicate timestamps are deliberately rejected. Synthetic provider mocks that omit standard GeolocationPosition timestamps must be corrected to model the browser API.

P1 GPS-02: `gps-orchestration.js:applyRouteDeviationFromApplyPlan` used `rt().g('rerouteAttemptCount')++`, an invalid assignment target that can throw on reroute. Replaced with the existing state setter. Importing the real module in the new replay test exposed it (Babel rejected the original expression); Node --check alone accepted the original legacy call-expression syntax and did not prove execution safety. No claim all navigation branches are covered.

## Evidence

`gps-fix-replay.test.js`: six deterministic tests. One sequence admits fresh fixes while rejecting older/duplicate/inaccurate/NaN ones; five cases invoke the real watch callback and verify rejected fixes do not mutate stored marker coordinates or freshness, and emit a stale-position warning. Existing speed-GPS, movement detection, route-progress, reroute-decision and auto-GPS suites pass in the full Jest run. Tests exercise software with synthetic samples, not real hardware or driving.

## Unresolved P1 issues

- Desktop `satnav.py:on_location` still resets current_pos to Barnsley in its catch-all error path (`satnav.py` around line 7314), and initialization begins with that default position. This can conflate a UI default with actual GPS. Desktop dependencies are unavailable; do not apply a broad state migration without tests of consumers that assume current_pos is a tuple. Replace with explicit unknown/last-reliable state and guard route starts in a dedicated desktop batch.
- The browser GPS guard does not validate every other location source (auto-GPS field updates, shared-route priming, geocoding or manual coordinates). Audit provenance and permission boundaries before treating them as live GPS.
- Heading at low speeds, urban canyons/parallel carriageways, tunnel loss, delayed callbacks, large jumps, route snap release, arrival transitions and resume behavior need recorded-device fixtures. Snapshot preservation is not tunnel dead reckoning.
- Battery use was not measured. High-accuracy watch plus periodic auto-GPS and hazard/provider refresh may duplicate work; inspect actual timers on device before changing cadence.

No hidden default-location substitution was introduced. No claim navigation stays accurate through signal loss, tunnels or a complete offline journey.
