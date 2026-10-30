# Phase 12F-D: navigation coherence and geometry binding

## Baseline

Branch: `codex/phase12fd-navigation-coherence`.
Exact parent: `ac8798ed0c5af9e24c46f0da1420906675f9c504` (PR #374).
Remote main was fetched and remained `dcb40a6a507879a5283ecc7dee4e21c537b52630`,
the parent of that baseline. No main advance or rebase occurred. This is a
separate stacked change; a main-targeting PR also contains the still-open #374
ancestry. It does not update or merge that PR.

## Root causes and correction

R1: selectors updated preview data independently of navigation instructions.
Polyline replacement depended on the traffic-preview setting. Rerouting had a
different state update path, while response handlers could subsequently patch
raw data over the committed context.

Active select/use operations, active Start Navigation, GPS/traffic reroutes,
active recalculation and active preview updates now enter the same
`updateRouteOnMap` transition. It clones and verifies the candidate through the
real safety gate, prepares canonical geometry/instructions, validates runtime
and map readiness, and stages a confirmed owned map layer while keeping the old
line available. No pending/failed mount can authorize replacement.

Route identity/data, authoritative geometry, decoded polyline, maneuvers,
selected option/index, step/snap/turn progress, next maneuver distance, arrival
state and owned layer are committed with synchronous setters. A setter failure
restores the captured state and removes the staged layer. Candidate refusals
never reach map mounting. Failed staging preserves the old context and line.
Old-layer cleanup, voice/traffic/UI services run after the coherent core commit;
their failures report a degraded-refresh warning rather than falsely reporting
a refusal after committing a new route. Real renderer/device behavior still
requires integrated acceptance.

Response handlers no longer overwrite that committed route with an older/raw
payload. GPS hazard/success effects are deferred until replacement succeeds.
Current request destination metadata is supplied before commit; absent metadata
uses the authoritative endpoint rather than borrowing an unrelated old label.

R2: the gate previously treated geometry binding as optional and checked encoded
geometry while some consumers used a separately supplied decoded polyline.
Binding is now required, syntactically validated and compared with the existing
server-compatible checksum. Geometry must decode to valid nondegenerate WGS84
vertices with declared precision 5/6. An optional decoded cache must match that
representation; it is never consumed as navigation authority. Navigation uses
a new production-codec decode of the assessed geometry. A missing decoded cache
is derived from that geometry. Missing identity, stale/malformed assessment or
missing/empty/malformed instructions refuse admission. Provided maneuver shape
indices must be valid for the canonical geometry. No old instructions are used
as a fallback for an incomplete selection.

The existing six-decimal checksum representation remains a consistency check,
not authentication, road legality or native-correlation evidence. No binding or
freshness evidence is fabricated. The two-metre endpoint rule is unchanged.

Initial navigation also consumes the validated decode. Arbitrary persisted
polyline options are refused even without a resume flag. Saved journeys retain
PR #373/#374's inspection-only resume markers and require recalculation.

R3: `displaySingleRoute` and its lower display application helper are now
enforceably inactive-preview-only, checked before any clear/mount operation.
Active selection uses the shared verified transition instead. The unused public
partial-state apply helper/wrapper was removed; post-commit application effects
are private. This avoids duplicating a separate permission algorithm.

## Executed validation

- The original independent seven-case harness reproduced **7 failures, 0
  passes, 0 blocked** on the untouched required baseline.
- The same new regression file and runtime fixture were also exercised against
  an archived baseline: the seven original cases **all failed**. Against this
  correction the seven **all passed**. The other 60 tests were deliberately
  excluded by the focused name filter, not infrastructure skips.
- Expanded coherence suite: **67 passed**. Covers traffic on/off, different
  steps/geometry, absent/malformed steps, identity, binding and decoded cache,
  stale/preference evidence, mandatory failure, offline/broken verifier, direct
  display helpers, active Start, map readiness, staged-mount failure, setter
  rollback, GPS success-effect ordering and precision-five canonical decoding.
- Final full JavaScript/coverage: **104 suites, 2,185 tests passed**; test lint
  and diff whitespace checks passed. Existing F2/F3, mandatory/origin and
  IndexedDB resume assertions remain. Positive fixtures that previously used
  placeholder geometry or missing bindings/instructions now supply valid
  synthetic contracts. Their safety assertions were retained, not weakened.
- Focused backend integrity/origin/Valhalla selection: **174 passed**.
- Full CI-selected backend (73 files), first run: **1 failed, 1,610 passed,
  1 skipped, 68 subtests passed**. The unchanged Phase 11 diagnostics test captured
  an earlier viewport worker's late `area_task_finished` log under a different
  request ID. This is the same existing cross-test capture race recorded for
  #372/#374; neither its code nor assertions were changed.
- That audit file separately: **24 passed**. Full selection rerun:
  **1,611 passed, 1 skipped, 68 subtests passed**. The skip requires actual Windows
  handles on disposable fixtures. The existing log-capture race remains open.

An early intermediate full JS run had 32 failures from legacy incomplete
positive fixtures. After updating those inputs, two old reroute runtime fixtures
also needed the newly required coherent runtime/geometry contract. One new
precision-five assertion initially compared two decoders' floating-point spellings
(for example an integer versus an integer plus machine rounding error). It now
asserts the authoritative production decode and exact existing geometry binding;
no geographic tolerance or production threshold was relaxed.

Backend tests used disposable SQLite and denied outbound socket connections in
an external runner. Node 24 and existing dependencies were used. No actual
routing/provider requests, private fixture runs, VPS access or deployment took
place. Existing reproduction evidence remains outside Git with its hashes
unchanged. Native/desktop/live-service suites outside the configured backend
selection were not run. No private fixture 0 verification is claimed.

## Changed files relative to the required baseline

Production: `avoidance-integrity.js`, `route-selection.js`,
`navigation-lifecycle-orchestration.js`, `reroute-map-orchestration.js`,
`route-comparison-orchestration.js`, `route-preview-orchestration.js`,
`calculate-route-orchestration.js`, `gps-orchestration.js`, `voyagr-app.js`,
and `templates/index.html` (changed-script query versions).

Tests: new `navigation-coherence.test.js` and
`fixtures/navigation-transition.cjs`; updated synthetic fixture scaffolding in
`avoidance-integrity.test.js`, `graphhopper-capability-selection.test.js`,
`navigation-lifecycle-orchestration.test.js`, `origin-integrity.test.js`,
`phase12fc-navigation-gate.test.js`, `phase12fd-selection-saved-context.test.js`,
`reroute-map-orchestration.test.js`, and `resume-context-verifier.test.js`.
This audit note is also new. No backend, engine/provider request, threshold,
native-correlation or private-evidence files changed.

## Limits and decision

These are synthetic application-state and mocked-renderer tests. They do not
establish transactional guarantees in a real GPU/map renderer or acceptance on
Chrome/Edge, a physical device, service-worker/version-skew combinations,
browser restart/multiple tabs/offline persistence, or genuine disk-cache-to-PWA
reassessment. Legacy eligible-looking envelopes missing the new required
components now refuse and require recalculation. Query versions are not an
atomic release mechanism. Ancillary-service failure after a successful core
commit is reported as degraded display/service refresh, not a rollback claim.

**PRODUCTION_NO_GO. Do not merge automatically or deploy.**
