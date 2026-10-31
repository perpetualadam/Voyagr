# Phase 12F-G R7/R8 code-clearance remediation

CODE_CLEARANCE_REQUEST_CHANGES until independent re-review.
PRODUCTION_NO_GO until separate browser/device acceptance. Existing PR #378 stays
draft and unmerged, without auto-merge. No production access, deployment, browser
launch, live provider request, private fixture change or safety-policy relaxation.

## Baseline and before/after evidence

Before modification, the working tree was clean and local/hosted PR HEAD matched
`b9ea22209303dd05e358faad9a27dd7ab9eaddaa`, tree
`8e055d1ce1345a5b3b16bf8006b20c22222da032`. This is descended from prior reviewed
`4af41fcf94c1de15f66e9d7aaa286aa7061f7c5a`. GitHub main remained
`16d26dd1ef970ea95dba32deabfe85b55cfd3bf7`. This updates the existing branch
`feat/phase12fg-journey-modes` and draft PR, not a separate stacked PR.

The unchanged independent clearance probes reproduced both defects on baseline:
**1 passed, 2 failed, 0 skipped**. The passing case was the current-location-module
control; v48 location committed the old destination, and failed abandonment during
pending replacement deleted durable continuation. Same unchanged probes after
correction: **3 passed, 0 failed, 0 skipped**.

## R7 — endpoint selection must participate in cancellation

Root cause: the v48 location module implemented endpoint picker leases but did not
notify the navigation-intent owner. Lifecycle/renderer compatibility flags did not
cover that dependency. A worker's `ignoreSearch` fallback could therefore assemble
an accepted mixed client whose epoch remained unchanged after a destination edit.

All 14 endpoint/visit writer modules now expose an explicit versioned cancellation
contract and bound-runtime readiness. Required APIs are checked with strict types;
missing, legacy, malformed, throwing or partially initialized dependencies refuse.
The inventory includes location/GPS, search, map calculation, preview restoration,
favorites, POIs, parking, form clearing, trip history, shared routes, predictions,
voice actions and waypoints. Programmatic writes invalidate ownership immediately,
not after a delayed/rejected calculation. New selections clear obsolete coordinate
or provenance data where needed. Internal periodic GPS updates keep endpoint-only
bookkeeping; an explicit user toggle invalidates intent. Late GPS-stop callbacks
retain their original generation.

Production lifecycle and reroute entry points enforce the contract. Replacement
staging may complete inertly, but compatibility is mandatory before actual map
publication/promotion and is rechecked through native map reentry and startup.
Direct lifecycle calls cannot obtain permission by bypassing chooser UI. Lifecycle
and renderer peers also expose/check the new contract; cached older peers cannot
silently omit it. These are additional refusal conditions: they never replace GPS,
mandatory-avoidance, geometry binding or the strict synchronous verifier.

Recoverable mismatch retains existing valid guidance, canonical progress and map
ownership. Shared-route/form-clear actions cannot remove active guidance. Changed
served JavaScript uses new version URLs and worker v50. A resident old worker may
still supply old assets; that case is explicitly refused rather than assumed away.
An entirely old installed client must update to receive these fixes.

## R8 — abandonment shares the owned persistence transaction

Root cause: the pending-start branch of lifecycle stop called `failNavigation`
before `preservePersistedJourney` was applied. Its incidental clear removed current
storage before the separate abandonment clear failed, leaving pending visits only
in memory.

Abandonment now has an exclusive transaction owner spanning cancellation, safety
stop and durable work. Lifecycle failure preserves storage for both planning and
abandonment owners while stopping guidance unconditionally. Legacy lifecycle code
without the preservation contract refuses abandonment before a destructive stop.

The existing `stageActiveRouteRecord` architecture handles abandonment; there is no
second journal/store. It validates the current journey identity (including the
private original identity of an in-flight replacement), checkpoints canonical
remaining stops, and stages an independently owned record. A compare-and-swap
promotion checks that exact checkpoint and the captured generation. While pending,
readers see the previous journey, including after process interruption/reload.

Finalization atomically replaces the owned current record with a minimal retirement
tombstone. It contains only `id`, random persistence owner and `abandoned:true`, not
route data or continuation. Readers return no current journey only after this
step. This retains ownership for safe rollback without adding another journal.
Memory continuation is retired only after confirmed finalization. The old preview
cannot silently restart completed visits; a newly committed plan is required.
Repeated confirmed retirement is idempotent.

Cancellation aborts the owned active transaction; staging, promotion, finalization,
rollback and discard are bounded. Late stages retain their captured guard. Rollback
restores only this exact owner, or recognizes an unchanged checkpoint; it cannot
overwrite/delete another current journey. A newer owner or failed recovery enters
RECOVERY_REQUIRED and never claims the previous state was restored. Pending
abandonment blocks simulation/live starts, preview selection and competing commits.
Offline recovery keeps saved journeys inspection-only. Journal helpers/handles
also have a strict abandonment protocol, refusing cached older implementations.

The original independent abandonment harness supplies the old clear binding rather
than the new staging binding: it now refuses safely and preserves the record. New
focused tests wire the real production abandonment journal and additionally cover
pending replacement, actual IndexedDB aborts in each phase, finalization rollback,
timeout/late staging, reload, retries and newer-owner protection.

## Verification

| Execution | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline unchanged clearance probes | 1 | 2 | 0 |
| Same unchanged clearance probes after correction | 3 | 0 | 0 |
| New focused R7/R8 production-path tests | 43 | 0 | 0 |
| Unchanged independent 35-case cross-boundary suite | 35 | 0 | 0 |
| Original independent 19-case suite, unchanged | 18 | 1 known obsolete R1 assertion | 0 |
| Preserved external corrected 19-case copy | 19 | 0 | 0 |
| Full JavaScript with coverage, 112 suites | 2463 | 0 | 0 |
| Backend web/safety selection, 75 CI-declared files | 1657 | 0 | 1 |
| Backend subtests, additional | 68 | 0 | 0 |
| Disposable PostgreSQL SQL policy | 11 | 0 | 0 |

`npm run lint:tests` passes. Configured coverage: statements 84.51%, branches 77.21%,
functions 84.81%, lines 86.85%. The configured instrumentation does not cover every
changed orchestration module; these percentages are not integrated navigation
acceptance. Existing R1–R6, F2/F3, R1–R8 and M1–M4 lifecycle/map regressions are in the
complete JavaScript run. The sole backend skip requires actual Windows handles on
Linux; the Windows CI job verifies that separate platform case.

The original 19-case assertion expects valid guidance to stop after a recoverable
routing failure. The required lifecycle contract retains it because the original
journey/map/progress remain valid. The external corrected copy changes only false
to true; both remaining-stop assertions remain unchanged. Original and corrected
sources and the independent 35-case/clearance probes are preserved unmodified.

One committed R5/R6 test was retargeted from the removed abandonment-clear seam to
the actual staged-abandonment seam; its safety assertions are unchanged. The shared
navigation fixture now loads/binds the real endpoint-owner modules to model the
complete production client. Missing/legacy/unbound APIs are then explicitly tested
as refusal cases; no substitute permission function was introduced in the fixture.

Commands: `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`; Jest with each
preserved external config; `.venv/bin/python -m pytest -q` with the exact CI web file
selection; `.venv/bin/python scripts/test-dashcam-session-sql.py` against disposable
local pgserver, no production DSN. Logs are `/tmp/voyagr-r7-r8-*.log`; evidence
hashes are `/tmp/voyagr-r7-r8-evidence/manifest.json`, outside Git. The final commit,
tree and exact-head hosted CI outcome are recorded in the draft PR body after push.

## Exact changed-file inventory

- `docs/audits/VOYAGR_PHASE12FG_REMEDIATION_R7_R8.md`
- `service-worker.js`
- `static/js/__tests__/fixtures/navigation-transition.cjs`
- `static/js/__tests__/journey-r5-r6.test.js`
- `static/js/__tests__/journey-r7-r8.test.js`
- `static/js/app/auto-gps-orchestration.js`
- `static/js/app/calculate-route-orchestration.js`
- `static/js/app/form-clear-orchestration.js`
- `static/js/app/geocoding-orchestration.js`
- `static/js/app/journey-modes.js`
- `static/js/app/location-orchestration.js`
- `static/js/app/ml-predictions-orchestration.js`
- `static/js/app/navigation-lifecycle-orchestration.js`
- `static/js/app/offline-navigation-orchestration.js`
- `static/js/app/parking-orchestration.js`
- `static/js/app/poi-search-orchestration.js`
- `static/js/app/reroute-map-orchestration.js`
- `static/js/app/route-comparison-orchestration.js`
- `static/js/app/route-preview-orchestration.js`
- `static/js/app/route-sharing-orchestration.js`
- `static/js/app/search-favorites-orchestration.js`
- `static/js/app/trip-history-orchestration.js`
- `static/js/app/voice-control-orchestration.js`
- `static/js/app/waypoints-orchestration.js`
- `static/js/modules/navigation/offline-navigation.js`
- `static/js/voyagr-app.js`
- `templates/index.html`

The endpoint modules carry compatibility/cancellation changes; lifecycle, map,
comparison and preview code enforce commit boundaries; offline helpers and runtime
binding implement owned retirement; assets carry version updates; tests and this
report provide evidence. No backend routing adapter, threshold, mandatory policy,
geometry/maneuver verifier, warning duration or private fixture was changed.

## Remaining limits

Synthetic routes and production modules execute with native renderer/device/service
boundaries doubled and real fake-indexeddb transaction semantics. No Chrome/Edge,
WebGL, physical GPS, installed-worker update sequence, device background lifecycle
or real-world navigation was tested. Secure-browser limitations remain; user
browser/device acceptance is separate.

**CODE_CLEARANCE_REQUEST_CHANGES until independent re-review.**

**PRODUCTION_NO_GO until separate browser/device acceptance.**
