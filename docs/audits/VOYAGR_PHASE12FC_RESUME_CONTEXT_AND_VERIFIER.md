# Phase 12F-C — Resume context and required verifier correction

Required source base: `80d5d48ea968235a82937ce0e9d9907e984b059e` (combined PR #372). Branch: `codex/resume-context-verifier-fail-closed`. This correction preserves the exact original PR #370/#371/#372 commits. No merge, deployment, VPS access, live routing, native dependencies or private evidence changes. **PRODUCTION_NO_GO**.

## Root causes

1. `route-selection.buildRoutePayloadFromPersisted` correctly invalidated the saved assessment. `offline-navigation-orchestration.tryResumeNavigation` then called lifecycle start with that payload, but `startTurnByTurnNavigation` first merged the live preview selection. That merge could replace saved geometry/assessment while retaining the saved destination. Freshness invalidation was therefore not bound to the payload reaching the gate.
2. Lifecycle start and automatic map replacement used a conditional missing-verifier guard: preference-only legacy payloads without `origin_integrity_required` could proceed. A truthy nonboolean gate result could also pass; exceptions were not converted into an explicit refusal.

## Corrected boundary

A saved journey is inspection data. It cannot establish a fresh complete request context, road legality or avoidance coverage. No in-place resume acceptance or freshness token is invented. Resume calls, restored payload markers and resume assessments are refused before any selected-preview merge or navigation bootstrap. The selection function also preserves the restored payload as a unit: origin/destination, identity, geometry and invalidated assessment cannot borrow a live preview's permission. Recalculation through the existing production API creates a new complete context; explicitly starting that new independently valid route still uses the real gate and remains possible. Selecting an unrelated preview alone cannot authorize a saved journey.

Every lifecycle start requires a present callable verifier returning exactly synchronous boolean `true`. Missing/malformed modules, access failures, thrown exceptions, promises and other truthy results refuse before bootstrap/state initialization. Automatic map replacement uses the same strict verifier requirement, including offline refusal, so the map path cannot bypass the lifecycle boundary. It retains the current route on refusal. No confirmation supplies permission.

The saved-journey banner now offers **View journey**, not navigation resume. On refusal the PWA shows the exact restored journey as its own non-navigable preview, with its saved labels/geometry and a recalculation warning. It replaces idle preview options as a complete context and cannot replace an active navigation session. Preview display does not set navigation active. Missing saved context is labelled unverified, not manufactured. Restored route payloads are not printed in the preview's full-payload console log.

Unchanged: backend integrity functions, normalized mandatory/preference rules, the 2m endpoint threshold, endpoint exclusions, native correlation, geometry validation, hazard detection and engine requests. Ordinary preferences remain best effort after the real safety gate succeeds. This document qualifies the earlier broad persisted-resume assurance in `VOYAGR_ROUTING_AVOIDANCE_INTEGRITY.md`: resume is inspection-only until recalculation, rather than permission to reuse a saved assessment.

## Adversarial and regression evidence

Before production changes, the initial 28-case test suite on the required base returned **20 failed, 8 passed**. Both original probes reached the bootstrap sentinel: live selection replaced persisted invalidation, and missing verifier admitted a legacy preference start. No decision/start function was mocked to reproduce those failures.

The final 45-case `resume-context-verifier.test.js` exercises actual reconstruction, selection, lifecycle, real persisted IndexedDB/banner handlers, preview display and module-loading absence in an isolated browser global. It covers empty/matching/different live selections, changed origin/destination/identity/geometry, stale/missing assessments, mandatory changes, a valid unrelated preview, strict verifier result/error cases, offline refusal, map-entry failures, no bootstrap/state mutation, and a valid new-route bootstrap control. Failure-module doubles inject faults only; normal allow/refuse controls use the shipped verifier. Map/browser services are test sentinels, not safety-decision replacements.

Existing lifecycle/map rendering tests now supply explicit valid assessment preconditions and the actual verifier; their rendering/state assertions are retained. The banner test now requires inspection/recalculation wording. PR #370's four harness files and PR #371's mandatory gate/tests are unchanged.

Local results:

| Selection | Result |
| --- | --- |
| Full Jest/coverage | 102 suites, 2018 tests passed |
| Configured CI backend file list | 1611 passed, 1 skipped, 68 subtests passed |
| Focused Python integrity/origin/Valhalla | 174 passed, including Flask-to-Node bridges |
| Test lint | Passed |
| Isolated local PostgreSQL policy | 11 passed |
| Recorded fixture CLI | PRIVATE_CAPTURE_NOT_AVAILABLE, exit 2 |

Reproduce focused browser checks with `npx jest --runInBand static/js/__tests__/resume-context-verifier.test.js static/js/__tests__/avoidance-integrity.test.js static/js/__tests__/origin-integrity.test.js static/js/__tests__/phase12fc-navigation-gate.test.js`. Python: `.venv/bin/python -m pytest -q tests/test_routing_avoidance_integrity.py tests/test_phase12f_origin.py tests/test_valhalla_acceptance.py`. Full validation uses the existing `.github/workflows/ci.yml` backend selection, `npm run test:ci -- --maxWorkers=2`, `npm run lint:tests` and the isolated SQL script.

## Remaining acceptance

Tests use synthetic public coordinates, jsdom, fake IndexedDB and a VM module-absence scenario. They are not physical-device, served-asset/service-worker-skew or native engine acceptance. Module absence is injected locally, not caused by a live browser fetch. No private captured route was executed on this branch. The earlier genuine combined recorded pass remains operator-reported and is not inherited as a new recorded result. The unchanged private CLI must be rerun separately against this commit with the pinned original hashes to verify recorded endpoint refusal.

No complete independent camera coverage, native route-selected correlation, full-area exclusion parity, directed-road legality, import/transport provenance or independent approval is established. No accepted oracle hash or reviewed flag is generated. Restoring navigation without recalculation would require a separately designed, independently assessed complete request/context revalidation path. **PRODUCTION_NO_GO**.
