# Phase 12F-G: planning, simulation and live GPS navigation

PRODUCTION_NO_GO. Draft for independent review; no deployment or automatic merge.

## Stage A — diagnosis before changes

Fetched GitHub main: 16d26dd1ef970ea95dba32deabfe85b55cfd3bf7. Phase 12F-F is still
an unmerged draft (#377); this branch includes its two commits for best-effort UX.

The supplied evidence now names the failure: material_endpoint_relocation, roughly
23.7 m displacement, navigation_allowed=false, origin_connectivity_unverified,
road_connectivity=NOT_VERIFIED, safe_exit=NOT_ESTABLISHED and transition_verified=false.
Backend context_for_request reads the requested start/end coordinates, not physical
GPS. assess_origin compares those coordinates with provider geometry and optional
native snapped waypoints. Thus the reported refusal is a numerical endpoint mismatch
with unverified connectivity, not proof of a GPS-only assumption in route calculation.
Distance alone does not establish road access, lawful direction or a safe transition.
No real route/provider was called, and the five full alternative assessments remain
unavailable for independent replay.

Planning geocodes both fields, builds a preference request and displays all returned
alternatives without requiring a GPS fix. Frontend live gates additionally reject a
fresh real fix inconsistent with the requested origin. The UI conflated inspecting a
planned route with authorizing real navigation: it had no independent simulation
mode and no explicit new GPS-origin request path. Inputs retained coordinates/labels
but did not consistently preserve endpoint provenance.

| Requirement | Planning | Simulation / inspection | Live GPS |
|---|---|---|---|
| Arbitrary requested endpoints | supported without GPS | animate returned geometry only | new request from fresh real fix |
| Endpoint relocation / unknown connection | retain findings | permanent non-authoritative label | unchanged critical refusal |
| Mandatory violation / missing evidence | inspection available | no approval claim or overrides | refuse through production gate |
| Nonmandatory preference limits | retain assessment | inspection findings, no live warning claim | existing BEST_EFFORT warning after commit |
| Cached/saved data | preserve provenance | inspection only | fresh request, reassessment and current verifier |
| Multiple stops | explicit provenance and requested order | complete geometry/stop sequence | remaining canonical stops preserved, no reoptimization |
| Geometry/ownership inconsistency | inspection error | stop and clean owned resources | fail closed; no borrowed assessment |

## Stage B — design before implementation

States: PLANNING -> CHOOSING -> SIMULATING <-> SIMULATION_PAUSED -> PLANNING.
The separate live path is CHOOSING -> LOCATING -> RECALCULATING -> AUTHORIZING -> LIVE.
Errors/cancellation return to an explicit inspection state with retry feedback.
Epochs, selection identity, preference tickets and response ordering prevent delayed
GPS/provider callbacks from changing a newer selection or mode.

Journey context records purpose and origin/destination/stop provenance: gps, searched,
map, coordinates, saved or unknown. Backend coordinates come from the actual request;
source claims are explicitly metadata, never GPS authenticity or eligibility proof.
Every alternative receives its own copy. Selection/saving preserve context, geometry,
maneuvers and stop ranges together. Legacy saved routes without adequate stop data
cannot silently become live multi-stop routes.

Simulation owns its own clock, distance, interpolated position, instruction display,
marker and line. It never calls GPS tick processing, road matching, community reports,
trip persistence or reroute APIs. It has pause/resume/restart/exit and speed controls.
It starts at returned geometry, never draws an invented connector across a snapped
endpoint gap. Even critical refusals may be inspected with a permanent simulation /
not-approved label, provided the geometry itself is structurally usable. Incomplete
or disconnected multi-leg geometry is not fabricated into a complete simulation.

Live-from-location obtains a fresh real geolocation fix (30 m maximum accuracy for
this explicit start flow, 15 s freshness; neither is a snapping tolerance), builds a
new request with current preferences and preserved remaining stops, forces refresh,
and uses the actual backend safety hook. It checks a second real fix before start;
movement greater than 2 m requires recalculation. Candidate selection is staged so
the existing lifecycle verifies the new route, not an old planned alternative, and
is restored on failure without overriding a newer selection. No outcome label,
provenance claim or simulation position can authorize live navigation.

The two-metre endpoint tolerance and routing adapters remain unchanged. Native snap
metadata is not independent proof of crossing a barrier, carriageway or access rule;
no new road connector or transition exception is introduced. A refusal remains a
refusal even when the user chooses a manually selected origin.

## Provider evidence and implementation

GraphHopper's engine adapter preserves `snapped_waypoints` as
`provider_snapped_waypoints` with its precision. The verifier checks this against
returned geometry; malformed or inconsistent metadata refuses navigation. The
Valhalla/OSRM paths retain their existing geometry and maneuvers; this change does
not manufacture native correlation data that those paths do not expose. Engine
snap locations identify returned endpoints, not independent permission to cross
a divided carriageway, drive against a one-way restriction, traverse private access
or cross a barrier. Existing independent road-oracle/replay suites retain their
role. Unknown connectivity and safe exits remain unknown, including inside GPS
uncertainty. No provider payload, road policy or two-metre threshold was changed.

The explicit chooser replaces the old start action. Manual selection releases
periodic origin GPS ownership; delayed auto-GPS callbacks are ignored after disable.
Endpoint swaps carry provenance. Map/GPS/search/saved selections and canonical visits
retain their sources. Saved geometry preserves precision, maneuvers and ranges but
never persists live eligibility. Saved legacy journeys lacking reliable complete
endpoint/stop context must be replanned before a live start.

Simulation uses an independent MapLibre line and DOM marker. Indexed maneuvers follow
shape progress; unindexed instructions are explicitly unavailable rather than timed
speculatively. Intermediate visits follow contiguous complete leg geometry. ETA is
an estimate from geometry/duration and the selected simulation speed changes the
animation clock; it does not model dwell times or certify actual arrival times.
Real GPS processing, automatic reroutes and community submission have explicit
simulation guards. A failed ownership cleanup blocks switching until map recovery.

Live requests use `/api/route`, including its complete multi-drop envelope with
`preserve_stop_order=true`, `optimize_stop_order=false`, forced refresh and canonical
remaining stops. The separate legacy multi-stop endpoint defaults to optimization
and returns a different envelope, so it is deliberately not used by this flow.
Selected geometry must match actual active progress before stops may be omitted as
already visited. The private authorization phase stages a new candidate, calls the
unchanged transactional lifecycle and restores failed selection without overwriting
a newer selection. Only validated actual GPS observations enter the accepted-fix
owner; simulated movement never enters it.

New HTML declares journey protocol 1, touched scripts have new version URLs, and
service-worker cache v47 precaches both mode modules. Missing mode code prevents a
new live start; cached/saved assessments cannot authorize a resume. A completely old
installed client still needs an online update/reload; cache versioning cannot update
an offline client atomically or remotely guarantee its loaded script versions.

## Verification and acceptance limits

Synthetic tests cover manual/GPS/map/saved provenance, arbitrary manual planning
without GPS, the reported ~23.7 m material snap, untrusted barrier/one-way/divided-road
claims, independent alternatives, mandatory refusal, stale/bound geometry, saved
restoration, complete/remaining stops, simulation controls and resource cleanup,
actual lifecycle transactions, GPS denial/timeout/accuracy/movement, offline start,
late responses/preferences/selections, mixed-version refusal and simulation guards.
The inherited Phase 12F-F suite covers VERIFIED/BEST_EFFORT/REFUSED, the accessible
six-second warning, persistent details and rerouting. These are synthetic unit and
HTTP integration tests, not a replay of the five private/real alternatives and not
real-device or real-browser acceptance.

No Chrome, WebGL, service-worker installation, device GPS or real routing provider
was exercised. No screenshots/recordings are available. Real Chromium/MapLibre and
service-worker mixed-version acceptance requires a separately verified sandboxed
browser environment; earlier container namespace restrictions remain unresolved.
On-device GPS jitter, permission UX, accessibility, stop progress, viewport layout,
background/resume behaviour and transactional map failures still need acceptance.
GPS start currently requests a second real fix and requires recalculation on movement
over two metres; this intentionally conservative behaviour needs device usability
review, without relaxing endpoint safety to make tests pass.

One initial backend run reported 1 failure, 1,643 passes and 1 Windows-only skip:
an earlier viewport-worker test emitted its final log during the next correlation
test. The trace showed two distinct request IDs, rather than a leaked request identity.
The affected diagnostics suite plus new tests passed on isolated recheck; no assertion
or production diagnostic policy was weakened. Full rerun results are recorded below.

Final local results on the submitted source:

- `npm run lint:tests`: passed; no tautological test files.
- `npm run test:ci -- --maxWorkers=2`: 2,347 passed, 0 failed, 0 skipped,
  109 suites; coverage thresholds passed. New journey suite: 43 tests.
- CI web/backend file selection (75 files): 1,650 passed, 0 failed, 1 skipped
  (native Windows-only metadata), plus 68 passing subtests. New journey suite: 28 tests.
- `scripts/test-dashcam-session-sql.py`: 11 passed, 0 failed, 0 skipped on
  disposable PostgreSQL; no production DSN is accepted by that script.
- `git diff --check`: passed.

These results supersede the initial timing-sensitive diagnostics failure documented
above; GitHub CI results must additionally be checked on the exact PR commit.
Main was fetched again after implementation and remained
`16d26dd1ef970ea95dba32deabfe85b55cfd3bf7`.

## Phase 12F-G changed-file inventory

The draft also includes the unmerged Phase 12F-F commits from #377. The following
inventory covers this phase relative to that inherited work; GitHub's complete diff
also lists the inherited Phase 12F-F changes.

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_PHASE12FG_JOURNEY_MODES.md`
- `service-worker.js`
- `static/css/voyagr.css`
- `static/js/__tests__/best-effort-navigation.test.js`
- `static/js/__tests__/journey-modes.test.js`
- `static/js/app/auto-gps-orchestration.js`
- `static/js/app/calculate-route-orchestration.js`
- `static/js/app/geocoding-orchestration.js`
- `static/js/app/gps-orchestration.js`
- `static/js/app/journey-modes.js`
- `static/js/app/location-orchestration.js`
- `static/js/app/navigation-lifecycle-orchestration.js`
- `static/js/app/reroute-map-orchestration.js`
- `static/js/app/road-report-orchestration.js`
- `static/js/app/route-preview-orchestration.js`
- `static/js/app/waypoints-orchestration.js`
- `static/js/modules/navigation/avoidance-integrity.js`
- `static/js/modules/navigation/journey-plan.js`
- `static/js/modules/navigation/route-selection.js`
- `static/js/modules/navigation/route-sharing.js`
- `static/js/voyagr-app.js`
- `templates/index.html`
- `tests/test_journey_modes.py`
- `voyagr/services/routing/integrity_api.py`
- `voyagr/services/routing/journey_context.py`

## Readiness

Implemented with synthetic regression coverage: arbitrary-location planning; separate
non-authoritative simulation; fresh actual-GPS recalculation and existing verifier;
inherited best-effort warning; persistent critical refusal; complete/remaining visits.
Not validated: real browser, actual GPS/device, legal road access beyond the existing
verifier's evidence, or the user's complete five-alternative capture.

Draft PR only, no auto-merge. Independent review and real-device acceptance are required.
PRODUCTION_NO_GO.
