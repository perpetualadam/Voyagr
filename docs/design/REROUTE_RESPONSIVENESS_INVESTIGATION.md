# Reroute responsiveness investigation

10 November 2026; main `587c4255`. Investigation only: no runtime tuning or fixes.
The findings concern Voyagr's shared GPS pipeline, including GraphHopper and
Valhalla, rather than establishing engine/provider latency on either VPS.

## Reproduced timing

Run `node scripts/diagnose-reroute-responsiveness.cjs`. The script calls production
decision/apply/trigger/retry plans using synthetic clock and GPS inputs. It makes
no network requests, starts no real GPS watch and writes no journey data.

Timing starts when the simulated position is already beyond the off-route distance
threshold. It excludes travel to that threshold, prior road association, routing
network/server time and final route validation/replacement.

| Scenario | Observed result |
| --- | --- |
| Persistent deviation, good 5 m accuracy, joined route, 1-second updates | First request trigger after 12 seconds |
| Same deviation with updates every 5 seconds | First trigger after 20 seconds |
| Continuous deviation immediately after a successful reroute, 1-second updates | First trigger after 96 seconds |
| Three off-route readings, then a long untrusted-accuracy interval | Old streak/timer survive; first restored accurate reading triggers |
| Failure retry at 4 / 6.5 / 10 / 14 seconds | Each trigger is allowed to fetch despite the 30-second deviation debounce |
| Shared fetch-options timer | Configured for 35,000 ms; accelerated timer emits AbortSignal cancellation |

The timeout probe accelerates only that scheduler call and restores the native
scheduler immediately. It verifies the configured value and emitted signal; it is
not a measured 35-second network request or proof of end-to-end transport cleanup.

## Deliberate delays and limits

Sources: `static/js/modules/navigation/reroute-decision.js` (DEFAULTS,
`decideRouteDeviation`, `buildRouteDeviationTickPlan`, `shouldSkipRerouteTrigger`,
`buildRerouteFailureRetryPlan`, `buildRouteMapUpdateStatePlan`), and
`static/js/app/gps-orchestration.js` (GPS watch, deviation and retry orchestration).

- The base deviation threshold is 50 m, widened by half the reported GPS accuracy,
  capped at 40 m extra. Examples for trusted fixes: 52.5 m at 5 m accuracy, 60 m at
  20 m accuracy and 82.5 m at the 65 m trust boundary. The theoretical 90 m cap is
  not reached while accuracy remains within the current 65 m deviation trust gate.
- Three consecutive off-route readings are required before a 10-second dwell
  begins. Update cadence therefore affects elapsed time; it is not simply a
  universal ten-second wait from the wrong turn.
- New GPS-driven deviation attempts are debounced for more than 30 seconds since
  the last attempt/success. This guard is intentionally absent from the direct
  fetch trigger so scheduled failure retries can run sooner.
- Successful route replacement applies 90 seconds of post-reroute grace. During
  that period, confirmed deviations are suppressed. The decision's reset streak/
  timer is applied even when grace suppresses its request. In the one-Hz replay,
  suppression occurs at seconds 31, 44, 57, 70 and 83; the next trigger is at 96.
  A genuine second wrong turn can therefore face a substantial delay.
- Arrival suppresses deviation rerouting within 100 m remaining. Initial joining
  has an 85 m gate, while active replacements can seed an already-joined state.
  These are separate from route-origin validation and engine response speed.
- Road association and navigation position evidence run before this decision
  helper. Unknown association can pause progress and skip deviation checks entirely.
  The replay does not pretend those preceding checks are always satisfied.

## Evidence-continuity issue — address before speeding up dwell

`decideRouteDeviation` returns its existing streak and start timestamp for an
untrusted-accuracy result. The surrounding apply plans preserve those values.
The GPS pipeline also returns early for unknown road/position evidence, and
`pauseUncertainNavigation` clears speech/lane/arrival state rather than deviation
history. Thus uncertainty is not consistently a fresh start for the continuous
wrong-turn confirmation window.

The probe demonstrates three readings at seconds 0, 1 and 2, an untrusted reading
at second 20, then a reliable off-route reading at second 21. That last reading can
request recalculation immediately using the old timer. This is a confirmed helper
state-continuity issue, not proof of a specific driver's false reroute. A focused
GPS integration regression should establish the desired reset at each relevant
unknown/untrusted path before reducing dwell or grace.

The helper also normalizes missing/nonpositive accuracy to zero, which it treats
as trustworthy. The GPS watch's upstream validator rejects non-finite accuracy
but permits zero. Treat this as a separate data-quality policy follow-up; no
real-device zero-accuracy failure was established in this investigation.

## Retries and request timeout

The 4 / 6.5 / 10 / 14-second retries are not swallowed by the 30-second debounce.
In-progress, active-navigation, auto-reroute and post-grace guards still apply.
The shared `avoidance-integrity.js:fetchOptions` supplies a 35-second abort timer;
`finish` clears it. This corrects the earlier investigation's incomplete observation
that a client deadline was not visible in the automatic handler itself.

With five consecutive requests each reaching 35 seconds and four backoffs totaling
34.5 seconds, one failure burst could take about 209.5 seconds. This is conditional
arithmetic, not a VPS measurement or a hard upper bound under browser suspension.
Servers may answer sooner; a later GPS deviation can start another burst after
exhaustion. Actual AbortSignal-aware fetch/error/retry integration remains a useful
follow-up. Cooperative backend budgets are additional constraints, not evidence
of actual service latency here.

## Recommended increments

1. Reset stale deviation streak/timer on uncertainty or an interrupted evidence
   episode. Test that reacquisition requires fresh confirmation and that normal
   continuous off-route detection still works.
2. Replace blanket 90-second suppression with a policy that permits a newly
   confirmed genuine deviation while retaining duplicate/in-progress protection.
   Include first wrong turn, a second wrong turn soon after recalculation, GPS
   drift, road reacquisition and failed requests in regression replays.
3. Measure actual accepted GPS cadence and end-to-end route timings on a device
   before tuning the 50 m threshold or ten-second dwell. Do not lower every guard
   together or infer safe values from these synthetic traces alone.

Keep selected-route integrity, canonical remaining visits, engine continuity,
cancellation and final map verification intact. No deployment, live service test,
production configuration/data change or behavior change is part of this report.

## Baseline validation

The read-only replay completed successfully. Existing suites passed unchanged:
3,327 JavaScript tests with coverage/lint; the declared web backend selection of
2,244 tests plus 74 subtests (one skipped); eleven isolated SQL policy tests.
These passing baselines do not convert the observed behavior into a recommended
future contract. Focused fix regressions remain part of the queued increments.

## Evidence-continuity fix

The following increment resets the active confirmation streak/timer for unknown
or rejected observations, watch errors/restarts, and recovery after the existing
15-second freshness window. Confirmed OFF_ROUTE observations continue accumulating.
The pure helper also clears untrusted-accuracy history. Route progress, join state,
remaining visits, attempt timestamps and request/retry ownership are unchanged.

The diagnostic's uncertainty case now reports `saved_streak: 0`, a null start and
`first_restored_action: "waiting"`. The original timing table is historical to the
investigated revision: ordinary one-Hz triggering still takes 12 seconds and the
post-success case still takes 96 seconds. Blanket grace handling remains the next
separate increment. This does not change zero-accuracy policy, cancel already
owned requests, or establish real-device accuracy/reception quality.


## Resolution: confirmed deviation during grace — 10 November 2026

The earlier 96-second result above describes the historical baseline. A new
confirmed deviation now ends grace in the GPS apply path before the guarded
request. This occurs only after the existing distance, trusted accuracy, join,
arrival, consecutive readings, dwell and 30-second debounce requirements pass.
The in-progress guard still prevents duplicate requests. The 90-second guard
remains for unconfirmed readings and direct triggers; a new successful replacement
sets it again. Normal failure retries remain available after confirmation.

The same synthetic post-success replay now triggers at 31 seconds. First deviation
remains 12 seconds at 1 Hz and 20 seconds with five-second updates. Actual GPS
handler regressions verify no request through second 30, one at second 31,
duplicate suppression, subsequent failure retry and fresh confirmation after
uncertain evidence. These are request timings after the distance threshold is
crossed, not provider response or guidance-start guarantees.

Validation: test lint, 3,353 frontend tests, declared web backend selection
(2,244 passed, 74 subtests passed, one skipped), 11 isolated SQL checks and replay.
No production deployment. Real-device acceptance is still pending.


## Resolution: offline failure recovery — 10 November 2026

Investigation found the offline guard entered the same failure scheduler as a
failed request. Each deferred invocation consumed another retry despite issuing
no fetch, eventually showing an exhausted-retries error. Reconnection only
recovered map/connectivity UI; it did not resume that deferred reroute directly.

The GPS owner now holds one deferred context instead of scheduling repeated
requests while offline. It retains the current route, instructions and mounted
layer, registers one reconnect listener, and uses accepted GPS ticks as a fallback
when the reconnect event is absent. Offline waiting does not advance the retry
count. If a previously reserved online retry discovers offline status, its existing
count is retained rather than repeatedly incremented. Existing online failure
retry delays remain 4/6.5/10/14 seconds with the shared 35-second request timeout.

Recovery checks active navigation, automatic rerouting, route/destination identity,
avoidance preferences, journey intent, in-progress/grace guards, accepted-fix
freshness/accuracy and current off-route evidence/distance. Unknown or stale GPS
waits for an accepted fix; reconnect itself supplies no position evidence. Returning
to route or reaching the arrival suppression zone cancels recovery. A fetch still
uses the original integrity and map gates, including origin freshness/binding.
Success or explicit retry cleanup removes the listener and pending context.

Regression coverage uses the production GPS watcher, request/integrity pipeline,
map replacement and lifecycle owner with synthetic device/network boundaries.
It verifies no offline fetch/budget drain, one reconnect fetch, current origin,
stale/uncertain GPS recovery, context cancellation, old-route retention, retry
exhaustion and timeout recovery. The reconnect regression fails on the prior code.
Validation: 3,371 frontend tests with lint/coverage; declared web backend selection
2,244 passed plus 74 subtests and one skipped; 11 isolated SQL checks; diagnostic.

No deployment. Live network/GPS acceptance remains pending. Browser online status
is advisory, so online-but-unreachable servers continue using bounded retries;
normal confirmed GPS deviations can initiate another attempt after that burst.


## User policy change: continuous guidance — 10 November 2026

Valid GPS callbacks could return on UNKNOWN/OFF_ROUTE road or geometry evidence
before updating current coordinates, marker/follow camera, tracking history,
directions and countdown. This explains a frozen display even with GPS arriving.
The road matcher is now enrichment; it cannot suspend those updates. Geometry
fallback supports progress and deviation when road identity is unavailable.
Uncertain geometry uses the observed GPS marker without forced snapping. Invalid,
out-of-order or stale coordinates still cannot fabricate movement.

Explicit Start now follows the user's selected complete geometry/instructions
without waiting for a 30 m reading, new provider response or passing assessment.
The existing private startup owner grants only that selected transaction and
releases its grant on completion/cancellation. Assessment fields remain unchanged;
UI limitations are advisory, not a claim that checks passed. Automatic replacements
retain their strict candidate gates and cannot silently substitute rejected routes.
Owned persistence/map commitment and malformed-data/cancellation checks remain.

The summary bar restores its active visibility and uses position-based remaining
distance/time rather than resetting to total duration when recent movement stops.
It continues using selected distance/time units. The older explicit recalculation
wait cannot disable Start; Start cancels that request and starts the selected route.

Validation: 3,391 frontend tests with lint/coverage; declared backend selection
2,244 tests plus 74 subtests passed, one skipped; 11 isolated SQL checks. Browser
replay exercises real MapLibre, GPS planners, summary DOM and journey entry at
390/1280 px in light/dark. GPS and lifecycle commit adapters are synthetic; Jest
also covers the actual lifecycle/map owner and preserved automatic/ownership gates.
The previous GPS handler fails the new marker/countdown regression. No deployment;
real-device driving acceptance remains outstanding.
