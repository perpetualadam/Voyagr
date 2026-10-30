# Phase 12F-D: R4–R8 failure coherence corrections

Production decision: **PRODUCTION_NO_GO**. Implementation is ready for another independent source/harness review, not production acceptance.

## Source identity and scope

Existing PR #375 branch: `codex/phase12fd-navigation-coherence`.
Remote PR and branch head verified before edits: `d5152b29048c8b7ce30dae71a0ca8fdad7710d47`; its direct parent is `ac8798ed0c5af9e24c46f0da1420906675f9c504`.
Remote main remains `dcb40a6a507879a5283ecc7dee4e21c537b52630`. No baseline change or rebase. This PR still includes the ancestry of PR #374.

Only PWA navigation state, failure handling, renderer outcome checks, versioned script references, tests and this audit are changed. No routing request/provider/backend/threshold/native changes. No merge, auto-merge, deployment, VPS access, live route requests or private fixture uploads. Original independent reproduction evidence remains outside Git and unchanged; original F2/F3 SHA256SUMS verified.

## Root causes and corrections

- **R4:** The single-route preview guard did not cover alternate map executors, context sync or direct selection setters. All preview map/context entry and apply helpers now require known inactive lifecycle state. Active Show All Routes refuses before removing the owned guidance line. Selection writes during active navigation require the narrowly scoped, read-only capability of the real verified transition, including rollback. Comparison-only cleanup is a separate operation that excludes the owned guidance line and reports actual remaining resources. The two real runtime adapters use it and return its result.
- **R5:** Falsy lifecycle values previously implied inactive permission. Preview operations now require explicit `false` for in-progress and starting state, `null` failure state, callable lifecycle accessors and a bound preview runtime. Missing, malformed, Promise, null, undefined, throwing or unbound state refuses. Active selection dispatch also requires a literal boolean lifecycle result.
- **R6:** Initial start previously set active flags and instructions before persistence/map mounting and could abandon a partially active session. Startup stages and verifies its map resources first, persists a separate canonical candidate while guidance remains inactive, waits up to five seconds for real IndexedDB completion, and reassesses settings/offline/selected context after the await. Only completed initialization emits success. Route and layer-handle setters are read back to detect silent failed commitments as well as exceptions. Both UI start functions await completion before hiding controls/collapsing the panel. Required synchronous service exceptions stop guidance and clear pending voice/traffic state. Cancellation epochs prevent an older persistence completion from overwriting a newer session. Async persistence rejection, explicit false and timeout refuse; the production adapter now returns a truthful boolean outcome.
- **R7:** Map recovery removed the current line first. Recovery now stages/validates a replacement from an immutable context recorded after real verification, checks current identity/assessment/maneuvers/geometry still match, and removes the old resources only afterward. Offline or aged evidence does not reauthorise a new candidate: only the identical already authorised active context can redraw. A failed mount retains a still-mounted verified old line; loss of both lines stops guidance.
- **R8:** The MapLibre helper swallowed removal errors and callers assumed success. Removal now attempts each resource and verifies actual layers/sources afterward. Mount verification inspects the real style/source geometry, not `_added` alone. Old cleanup failure either rolls the complete transition back to a demonstrably intact old line, or returns `inconsistent_map` and stops guidance. Failed stage cleanup likewise stops guidance; a blank map or leaked source is never counted as a successful refusal. Distinct comparison source IDs are checked too. Deferred pending mounts are cancellable so removed/refused resources cannot appear later from queued callbacks.

Terminal failure sets in-progress/started false, clears instructions and progress eligibility, cancels guidance services and latches recovery-required state. It may retain inspection data or renderer artifacts when the renderer itself refuses cleanup; it does not claim the map is clean. Explicit/normal map recovery must verify cleanup before clearing the latch, invalidate the old preview's navigation eligibility and require a fresh calculation. It never resumes guidance automatically.

## Verification and evidence

Environment: Node v24.19.0, Python 3.12.14; Jest/jsdom plus an explicit MapLibre API model using the real production `maplibre-helpers.js`. New tests use production gate, candidate preparation, lifecycle, comparison, reroute, renderer and planners. IndexedDB success/failure controls execute the production persistence adapter with fake-indexeddb. Backend runs use disposable SQLite and denied outbound sockets; external adversarial harness fetch/XHR attempts throw. No live route calls.

Local evidence is in `/tmp/voyagr-r4-r8`, outside Git. Original `/tmp/voyagr-pr375-independent` and private fixtures are not modified.

| Executed check | Result |
| --- | --- |
| Original independent matrix on unchanged d5152b29 before edits | 76 executed: 64 pass, **12 failed expectations**, 0 blocked |
| Twelve corresponding reviewed scenarios after correction | **12 pass**, 0 failed (42 additional cases excluded only by `-t original`) |
| Expanded R4–R8 production regression suite | **54 pass**, no skips |
| Independent F2/F3/original-seven/lifecycle/IndexedDB VM matrix with new runtime contract | **183 pass**, 0 failed, 0 blocked |
| Full `npm run lint:tests` | Pass |
| Full `npm run test:ci -- --maxWorkers=2` | **105 suites / 2239 tests pass**, no skips; coverage floors pass |
| Avoidance integrity, phase12f origin and Valhalla acceptance Python selection | **174 pass** |
| Full configured backend CI file selection | **1611 pass, 1 skip, 68 subtests pass** |

The backend skip requires actual Windows handles on disposable CI fixtures. Desktop/Kivy/native/live-service tests outside the configured web selection were not run.

The original twelve inputs include the two cleanup-impossible cases. Their corrected outcome is an explicit terminal failure with guidance stopped, not a claim that every protected value/map resource stayed unchanged. Tests separately require exact prior state preservation and a still-mounted verified line where rollback is possible. Positive controls execute successful bootstrap and mounted geometry; failed bootstrap or absent infrastructure does not count as positive acceptance.

Existing F2/F3 and R1–R3 assertions remain. Old test doubles have been upgraded from bare `_added:true` objects to the real renderer. Former sentinel-bootstrap positive tests still verify gate reachability, but initialization exceptions now explicitly refuse; complete positive lifecycle controls execute separately. The formerly optimistic pending-mount success expectation is deliberately replaced with inactive refusal because pending resources are not verified startup.

Intermediate regression runs exposed old scaffold/contract mismatches (initial 45 failures / 2140 passes; later four legacy scaffold expectations; one added comparison test lacked a hazard-service stub). The stubs were completed, source-ID removal checks improved and final full suite rerun. No avoidance/binding/endpoint assertion was weakened to pass.

## Exact changed-file inventory (relative to reviewed d5152b29)

Production and delivery:
- `static/js/app/navigation-lifecycle-orchestration.js`
- `static/js/app/offline-navigation-orchestration.js`
- `static/js/app/reroute-map-orchestration.js`
- `static/js/app/route-comparison-orchestration.js`
- `static/js/app/route-preview-orchestration.js`
- `static/js/maplibre-helpers.js`
- `static/js/voyagr-app.js`
- `templates/index.html`

Tests and scaffolding:
- `static/js/__tests__/navigation-failure-coherence.test.js` (new)
- `static/js/__tests__/fixtures/navigation-transition.cjs`
- `static/js/__tests__/navigation-coherence.test.js`
- `static/js/__tests__/navigation-lifecycle-orchestration.test.js`
- `static/js/__tests__/reroute-map-orchestration.test.js`
- `static/js/__tests__/phase12fd-selection-saved-context.test.js`
- `static/js/__tests__/phase12fc-navigation-gate.test.js`
- `static/js/__tests__/resume-context-verifier.test.js`
- `static/js/__tests__/avoidance-integrity.test.js`

Audit:
- `docs/audits/VOYAGR_PHASE12FD_FAILURE_COHERENCE.md`

## Remaining limitations and review readiness

- This is implementation validation, not an independent reviewer accepting the correction. The original 12 are reproduced independently before edits; the new terminal-failure expectations reflect the user's R6/R8 requirements. Another independent review should challenge cleanup failure, asynchronous startup and exported-helper reachability on the new commit.
- MapLibre API behavior is modeled, not real WebGL/browser/device execution. Genuine style reload, GPS, service-worker mixed-version delivery and browser storage availability need integrated acceptance. Script query versions reduce cache reuse but do not guarantee atomic delivery.
- Persistent renderer/API failures can leave sources/lines behind. Guidance remains stopped until verified resource cleanup; the implementation does not pretend it can force a broken renderer to remove resources. A reload may be required.
- Five seconds is a bounded storage/startup timeout, not a safety-evidence freshness timestamp. A late IndexedDB operation can still finish after cancellation; PR #373 resume remains inspection-only and cannot regain navigation permission from that record.
- Existing FNV geometry correspondence is not authentication or invented native correlation evidence. No private recorded fixture 0 captures were supplied or executed.
- Async service work after completed startup has its existing lifecycle behavior; the correction handles required startup completion, pending persistence, synchronous initialization exceptions and delayed effects tied to the start epoch. It does not assert successful live routing or deployment behavior.

**PRODUCTION_NO_GO.** No automatic merge or deployment.
