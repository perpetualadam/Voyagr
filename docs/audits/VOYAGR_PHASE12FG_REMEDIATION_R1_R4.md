# Phase 12F-G remediation R1–R4

PRODUCTION_NO_GO until independent re-review and real-device acceptance. PR #378
remains draft; no auto-merge, production access, deployment, live provider request,
private fixture change or endpoint/mandatory-policy relaxation.

## Source identity and before/after evidence

Before editing, hosted PR head and local HEAD both matched
`f3092c1aa689ad0b5aef750d72dbbbaf7b37433b`; the working tree was clean and the existing
PR branch was `feat/phase12fg-journey-modes`. Its merge base with main was
`16d26dd1ef970ea95dba32deabfe85b55cfd3bf7`. This updates that existing branch/PR,
not a new stacked PR. Main was fetched again and remained at that baseline.

The external independent review suite was rerun against the unchanged reviewed
commit first: **15 passed, 4 failed, 0 skipped (19 total)**, reproducing all four
reported defects in actual production functions.

After correction, the completely unchanged suite has **18 passed, 1 failed**:
its R1 test explicitly expects routing failure to STOP the existing live session.
That assertion describes the old behaviour and contradicts this remediation's
requirement to retain a recoverable active session. The original test was preserved.
An external copy changes only that assertion from false to true; both remaining-stop
request assertions are unchanged. This copy now has **19 passed, 0 failed, 0 skipped**.
This distinction is intentional; the old assertion was not silently weakened.

New committed remediation coverage adds **37 tests** around production lifecycle,
request serialization, endpoint callback owners, real IndexedDB transactions and
actual MapLibre resource helpers. Renderer/native-device APIs are boundary doubles;
this is not real-browser or physical-GPS acceptance.

## R1 — preserve the journey while replacement is staged

Root cause: Navigate From My Location stopped guidance before geolocation/routing
succeeded. A retry then treated the complete old selected route as inactive, losing
which visits had already passed.

The mode coordinator now captures canonical remaining visits while the old journey
stays active. It acquires/validates actual GPS, forces a new assessed request and
stages the candidate without modifying active selection, progress, maneuvers,
arrival state or map resources. The active replacement enters the actual lifecycle
with an explicit replacement option; the old protected selection is not overwritten
by staging. The lifecycle rechecks the strict synchronous verifier and private mode
permission after asynchronous persistence staging, then uses the existing
verifier-backed synchronous route-map transaction. Advancing past another visit,
changed preferences, a newer request generation, cancellation, changed context,
missing/mixed modules or GPS movement makes that staging obsolete.

Persistence uses an independently owned random pending record, never `current`.
A failed staging write or map mount retains the previous guidance and durable
record. Promotion writes `current` and deletes the pending record in one IndexedDB
transaction, guarded again against a cancelled/newer session. Discard is idempotent
and cannot delete `current`. Late staging completions are discarded; stage/promotion
waits are bounded. Actual aborts reject rather than hanging indefinitely.

If an irreversible map transition has succeeded but persistence promotion fails,
the lifecycle stops guidance for safety. Canonical remaining visits are retained
before lifecycle stop/failure clears guidance state, so explicit retry cannot revive
completed visits. Unknown/incoherent progress requires explicit replanning rather
than guessed visit completion. Direct start cannot restart the full old journey
from a retained continuation context; it requires a fresh GPS-origin calculation.
A deliberate new planning request clears continuation ownership.

Compatibility checks require both the new app binding and lifecycle replacement
protocol. Missing staging APIs or a mixed older app/lifecycle refuse replacement
while retaining current navigation. These compatibility flags grant no permission;
the real integrity verifier remains mandatory.

Covered failures: routing, stale responses/settings, verifier refusal, asynchronous
verifier results, persistence rejection/timeout/abort, mount failure, advancing
progress, newer request generation, cancellation, repeated retries, safety stops,
and successful complete route/progress/arrival commitment. A promotion failure
requires map/navigation recovery before actual guidance may restart.

## R2 — preserve explicit provenance through the complete request path

Root cause: waypoint creation kept provenance, but the production request serializers
whitelisted fields and dropped it before journey context was constructed. Metadata
therefore became unknown at the backend.

Via/stop serializers now preserve validated gps/searched/map/saved/coordinates/unknown
provenance, canonical original indices and any known historical source kind. Explicit
zero-minute GPS stops remain zero rather than becoming 15-minute stops. Coordinate
address inputs retain coordinate provenance. Backend journey metadata rebinds actual
request coordinates and canonical stop order, preserves known historical source and
never uses these labels as GPS authenticity or navigation permission.

Selection/saving/restoration/simulation/live-intent round trips retain context.
Saving an already restored route does not erase its historical source. Legacy saved
journeys explicitly expose unknown endpoint provenance and do not invent an empty
canonical stop list; insufficient legacy contexts remain inspection-only until
explicitly replanned. The backend tests confirm provenance cannot repair displaced
endpoints or turn a critical refusal into permission.

## R3 — endpoint GPS ownership

Root cause: one-shot endpoint GPS callbacks wrote the field regardless of later user
selection; this path was separate from the auto-GPS disable guard.

Each endpoint now owns an independent generation and captured field identity/state.
Typing, autocomplete/manual selection, map selection, swaps, saved restoration,
auto-GPS ownership changes and mode transitions invalidate obsolete requests.
A stale success/failure cannot change labels, coordinates or source metadata, even
when a user reselects exactly the same field values. Origin and destination do not
invalidate each other through an endpoint-specific edit. A fresh explicit request
can update its intended endpoint; invalid, denied or obsolete observations retain
manual selections. Mode geolocation remains separate from endpoint-picker ownership.

Tests include delayed success/denial, simultaneous endpoint requests, same-value
manual reselection, repeated explicit GPS requests, swaps, cancellation and rapid
mode switching.

## R4 — residual resources keep their simulation identity

Root cause: cleanup retained the failed line handle but RECOVERY_REQUIRED was not
considered simulation ownership, so its permanent label was hidden.

Residual owned geometry/markers keep the non-authoritative simulation panel and label
visible in recovery. The panel explains that cleanup is incomplete and Exit retries
verified removal. Animation/restart is prohibited in recovery, and GPS/reporting/live
replacement guards continue treating the residual resources as simulation. Handles
are retained until the actual production helper confirms layer/source removal and
the marker is disconnected. A successful retry clears ownership and then hides the
label. Repeated retries are safe.

Tests inject layer-only, source-only and marker failures using actual resource
helpers, retry failure/success, and invoke an obsolete deferred mounting callback
after verified cleanup; the callback cannot recreate resources.

## Final local verification

- `npm run lint:tests`: passed.
- `npm run test:ci -- --maxWorkers=2`: **2,384 passed, 0 failed, 0 skipped**, 110
  suites, coverage thresholds passed. Includes the existing F2/F3, R1–R8 and M1–M4
  selection/saved-context, navigation-gate, reroute, recovery and map-ownership suites.
- Backend CI web selection, 75 files: **1,657 passed, 0 failed, 1 skipped**, plus
  **68 passing subtests**. The skip is the native Windows-only metadata case.
  New backend provenance coverage adds seven cases to the existing journey suite.
- `scripts/test-dashcam-session-sql.py`: **11 passed, 0 failed, 0 skipped** on
  disposable PostgreSQL; no production DSN.
- External review copy with the single R1 behaviour correction: **19 passed,
  0 failed, 0 skipped**.
- `git diff --check`: passed.

The independent review's backend run had previously reproduced a diagnostics-test
race with a preceding worker's late `area_task_finished` log. The new full backend
run had no such failure. No diagnostic assertion or production logging policy was
changed, and no failure was dismissed based on that history. During development,
focused metadata assertions revealed newly added unknown source fields; optional
historical source fields were kept optional while explicit provenance remains
validated. Final counts above refer to the final submitted implementation, not those
intermediate development runs.

## Safety invariants and remaining limits

The two-metre endpoint policy and GPS movement bound are unchanged. Mandatory
avoidance remains fail-closed, outcome labels/provenance grant no permission, and
geometry/maneuver coherence still passes through the production verifier. Ordinary
best-effort warnings retain their six-second behaviour. Simulation never supplies
GPS observations, trips, community reports or live arrival/reroute positions.
Saved-route restoration remains inspection-only. Deferred map ownership and actual
cleanup verification remain enforced.

Worker cache v48 and updated URLs cover all changed browser modules. The new active
replacement protocol has bounded missing/mixed-module refusal tests. This does not
establish an atomic cache cohort for every legacy installed client; real PWA
installation/update/background scenarios still need browser acceptance.

No Chrome/browser, WebGL, real geolocation or live routing provider was exercised.
The previous sandbox/user-namespace blocker is unchanged. Physical GPS jitter may
still require explicit retries under the unchanged two-metre movement check.
Secure real-browser/device acceptance and independent re-review remain required.
Pending persistence records cannot authorize a resume; if storage cleanup itself
fails, an inert pending record may remain until storage recovery.

## Changed files relative to the reviewed baseline

- `docs/audits/VOYAGR_PHASE12FG_JOURNEY_MODES.md`
- `docs/audits/VOYAGR_PHASE12FG_REMEDIATION_R1_R4.md`
- `service-worker.js`
- `static/js/__tests__/journey-remediation.test.js`
- `static/js/__tests__/routing-request.test.js`
- `static/js/app/auto-gps-orchestration.js`
- `static/js/app/calculate-route-orchestration.js`
- `static/js/app/geocoding-orchestration.js`
- `static/js/app/journey-modes.js`
- `static/js/app/location-orchestration.js`
- `static/js/app/navigation-lifecycle-orchestration.js`
- `static/js/app/offline-navigation-orchestration.js`
- `static/js/app/route-preview-orchestration.js`
- `static/js/app/waypoints-orchestration.js`
- `static/js/modules/navigation/journey-plan.js`
- `static/js/modules/navigation/offline-navigation.js`
- `static/js/modules/navigation/route-sharing.js`
- `static/js/modules/navigation/routing-request.js`
- `static/js/voyagr-app.js`
- `templates/index.html`
- `tests/test_journey_modes.py`
- `voyagr/services/routing/journey_context.py`

The exact final SHA and hosted CI run are recorded in the updated PR body after commit.

PRODUCTION_NO_GO.
