# Phase 12F-G remediation R5/R6

PRODUCTION_NO_GO until independent re-review and real-device acceptance. This updates
existing draft PR #378; no merge, auto-merge, deployment, production access, live
provider requests, private fixture changes or safety-policy relaxation.

## Identity and reproduction

Before edits, hosted PR head and clean local HEAD matched
`4af41fcf94c1de15f66e9d7aaa286aa7061f7c5a`, on existing branch
`feat/phase12fg-journey-modes`, descended from prior reviewed
`f3092c1aa689ad0b5aef750d72dbbbaf7b37433b`. Fetched GitHub main remained
`16d26dd1ef970ea95dba32deabfe85b55cfd3bf7`.

The unchanged external re-review suite reproduced both reported defects on that
baseline: **33 passed, 2 failed, 0 skipped**. A rejected manual calculation lost
completed-stop continuation; a destination edit during replacement staging allowed
the old destination to commit. After remediation: **35 passed, 0 failed, 0 skipped**.
The external tests exercise the production modules, not replacement test functions.

## R5: continuation belongs to a committed journey

Root cause: `calculateRoute` called `beforePlanning` before request validation, and
that method stopped live guidance and cleared retained intent. A later GPS retry
interpreted the full old route as a new inactive plan, reviving completed visits.

Beginning, rejecting or cancelling a planning request now preserves active guidance,
selection, map ownership and canonical progress. Manual requests retain their manual
origin instead of substituting the live GPS origin. Failed validation, missing
endpoints, geocoding, routing, critical assessment, candidate construction and stale
responses cannot retire the previous continuation.

A successful handover validates/prepares the real candidate, checkpoints canonical
continuation durably, stages independently owned map resources, obtains explicit
replacement confirmation, and stages an owned IndexedDB planning journal. Before
publication it rechecks request generation, preferences and remaining-stop progress.
The journal initially reads as the previous journey. Only after publication and
verified previous-map cleanup does finalization publish the new durable plan and
retire the previous continuation. Saved plans remain inspection-only.

Failed staging/promotion preserves the old guidance. Failure after irreversible
map removal stops guidance and retains the old durable continuation rather than
claiming recoverability. Rollback checks the exact persistence owner, so it cannot
delete a newer operation's current record. Pending journals survive interruption
with the previous journey logically current; late staging is discarded. Storage
and cleanup waits are bounded. If progress advances during staging, handover is
refused and the newest canonical remaining visits are checkpointed.

Normal active-route persistence now includes validated continuation metadata.
Restoration validates route identity, geometry progress index and canonical intent;
metadata grants no GPS or live-navigation authority. The separately confirmed
**End previous journey** action is the explicit abandonment path. A failed
calculation cannot invoke it; failed storage clearing retains continuation.

This supersedes the R1–R4 report's earlier sentence that a deliberate planning
*request* clears continuation: only a successful committed replacement, or confirmed
successful abandonment, now retires it.

## R6: one captured navigation-intent generation

Root cause: endpoint GPS leases protected endpoint fields, but endpoint edits did
not invalidate the coordinator's pending GPS-origin navigation generation.
Persistence and lifecycle completion therefore still accepted the old destination.

Endpoint invalidation now cancels the coordinator generation and integrity request
revision immediately. Search/map selection, saved restoration, swaps and direct
input use that shared path. Origin/destination picker leases remain independent;
internal mode and periodic GPS bookkeeping do not masquerade as manual edits.

Requests capture the intent token once. Integrity tickets, returned route options,
replacement eligibility, map staging, the reversible synchronous setter batch,
pre-promotion and post-promotion checks all retain that token. A callback cannot
adopt the latest generation. Cancellation aborts its owned IndexedDB transaction;
discard removes only its random staging record. Native map reentry is checked
before irreversible old-resource cleanup. Reversible cancellation restores the
original guidance and progress; cancellation after irreversible removal stops
safely. Initial live startup also checks after pending persistence and before
final lifecycle commitment.

New mode/lifecycle/renderer handovers require matching intent-ownership APIs.
A new calculator refuses a legacy destructive planning coordinator before calling
it. Served changed JavaScript has new version URLs and the worker cache is v49.
These checks are refusal conditions, never navigation permissions. A resident old
worker can still serve old modules on offline fallback; a completely legacy client
cannot receive fixes until updated. Real update/browser acceptance is outstanding.

## Verification

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline unchanged independent re-review (before edits) | 33 | 2 | 0 |
| Same unchanged independent re-review (after edits) | 35 | 0 | 0 |
| New focused R5/R6 production-path tests | 35 | 0 | 0 |
| Original unchanged independent 19-case suite | 18 | 1 obsolete assertion | 0 |
| Preserved external copy with only the justified R1 expectation changed | 19 | 0 | 0 |
| Full JavaScript, 111 suites, coverage enabled | 2419 | 0 | 0 |
| CI-selected web/backend files | 1657 | 0 | 1 |
| Backend subtests (additional) | 68 | 0 | 0 |
| Disposable PostgreSQL session-policy checks | 11 | 0 | 0 |

`npm run lint:tests` passes. JavaScript coverage for the configured instrumented
files: statements 84.51%, branches 77.21%, functions 84.81%, lines 86.85%.
This configured coverage set does not include every changed orchestration module;
passing percentages do not establish integrated navigation safety. The backend
skip is the Windows-only path on Linux; no web tests were excluded to force a pass.

The original external R1 assertion expects `getRouteInProgress()` to become false
on a recoverable routing failure. It contradicts the explicit contract to preserve
valid active guidance. Its original file is unchanged; the external corrected copy
changes only false to true and preserves both canonical remaining-stop assertions.
No independent assertions were silently rewritten.

New focused cases cover UI/direct calculator invocation, repeated failed attempts,
new manual-origin commit, confirmation decline, deliberate abandonment, interrupted
journal restoration, owner-safe rollback, progress advancement, offline retry,
stale planning responses, GPS/routing/assessment/staging/mount/setter cancellation,
real IndexedDB promotion ownership, initial lifecycle commitment, all endpoint edit
paths, mixed modules and overlapping old/new navigation requests. Existing full
regressions include R1–R4, F2/F3, R1–R8 and M1–M4 safety cases. Unchanged external
coverage additionally challenges simulation cleanup/cancellation, mandatory
avoidance, synchronous verifier refusal, saved-route inspection and six-second
warning timing.

Commands: `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`;
`node node_modules/jest/bin/jest.js --runInBand --config <external-config>` for each
preserved external suite; `.venv/bin/python -m pytest -q` with the exact 75-file
CI web selection; `.venv/bin/python scripts/test-dashcam-session-sql.py` using a
fresh disposable local PostgreSQL instance, no production DSN.

Local logs: `/tmp/voyagr-r5-r6-{before,focused,external35,original19,corrected19,
full-js,lint,python,sql}.log`. Evidence hashes are recorded outside Git in
`/tmp/voyagr-r5-r6-evidence/manifest.json`; it contains no private route captures.
The final implementation commit and exact-head hosted CI results are recorded in
the existing PR's body after push.

## Exact changed-file inventory

- `service-worker.js`: v49 cache generation.
- `templates/index.html`: changed script versions and explicit abandonment action.
- `static/js/voyagr-app.js`: runtime bindings for transactional planning/storage.
- `static/js/app/journey-modes.js`: continuation handover and shared intent owner.
- `static/js/app/calculate-route-orchestration.js`: non-destructive manual request and committed preview handover.
- `static/js/app/location-orchestration.js`: endpoint edits notify intent owner.
- `static/js/app/auto-gps-orchestration.js`: internal GPS bookkeeping keeps endpoint-only invalidation.
- `static/js/app/navigation-lifecycle-orchestration.js`: captured-token startup/replacement checks and scoped journal-preserving stop.
- `static/js/app/reroute-map-orchestration.js`: intent checks through real synchronous map transaction.
- `static/js/app/offline-navigation-orchestration.js`: continuation checkpoint and planning journal bindings.
- `static/js/app/route-comparison-orchestration.js`: block selection writes during exclusive planning commit.
- `static/js/app/route-preview-orchestration.js`: restoration cannot overwrite a pending planning commit.
- `static/js/modules/navigation/avoidance-integrity.js`: request/response intent capture, existing safety verdicts unchanged.
- `static/js/modules/navigation/offline-navigation.js`: owned journal finalization/rollback/abort and continuation persistence.
- `static/js/modules/navigation/route-selection.js`: preserve intent/continuation metadata through real serializers.
- `static/js/__tests__/journey-r5-r6.test.js`: 35 focused production-path cases.
- `docs/audits/VOYAGR_PHASE12FG_REMEDIATION_R5_R6.md`: this report.

## Limits and release decision

Tests use synthetic routes, actual production modules and real fake-indexeddb
transactions; device/native service and MapLibre APIs are boundary doubles. No
Chrome, Flask application, physical GPS, provider or navigation device was started.
Prior secure-browser sandbox limitations remain unresolved. No claim of physical
GPS, real WebGL/service-worker integration or device acceptance is made.

Two-metre continuity, mandatory avoidance, strict synchronous verification,
geometry/maneuver coherence, completed-stop order, simulation isolation and warning
timing are unchanged. Independent re-review and contained real-browser/device
acceptance are still required. **PRODUCTION_NO_GO.**
