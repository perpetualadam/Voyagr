# Phase 12F-D: active selection and localStorage journey isolation

## Baseline and scope

Remote main was fetched and verified as `dcb40a6a507879a5283ecc7dee4e21c537b52630`,
parent `48e52e3171474f04830c81b860c6bcecc33a3383`. The clean existing checkout was
used to create `codex/phase12fd-selection-saved-context` from that exact commit.
No rebase or alternate baseline was used.

The prior 104-scenario reproduction and its evidence remain unchanged outside
Git. No private evidence was copied into this change.

## Behavior

Both active route-comparison selectors now require a callable production verifier
returning literal synchronous `true`. Verification includes the candidate's
assessment/origin context, current localStorage settings and browser offline
state. The existing verifier reads the accepted GPS fix itself. Missing, broken,
throwing and nonboolean exports refuse before selection, polyline, navigation or
map mutation, display a warning, and retain the current route. No confirmation
can authorize a refusal. Inactive preview selection does not authorize navigation.

The localStorage saved-route action is now **View journey**. Reconstruction copies
only saved inspection fields, preserves saved identity/labels/geometry, carries
the existing persisted-resume marker, and never copies stored assessments or
timestamps. It uses the same isolated preview entry as IndexedDB restoration,
replacing route options and clearing the unrelated API envelope. It cannot replace
an active navigation context. A new calculation must supply a new route context.

Both UI starts delegate pure candidate merging and authorization to the existing
lifecycle before committing any selected-route synchronization. Selection helpers
cannot donate evidence to a restored context; normal selected candidates keep
their own supplied identity/endpoints with their geometry and assessment.
The ordinary calculation response path replaces the inspection payload rather
than carrying its marker into a new calculation.

Changed asset query versions identify the new scripts. They do not establish
atomic service-worker delivery or solve the separate mixed-version blocker.

## Executed validation

- New adversarial suite on the unmodified production baseline: **88 failed,
  5 passed** (93 cases). Failures reproduce F2/F3 behavior and the missing explicit
  refusal contract. No production edits were present for this run.
- Final adversarial suite: **100 passed**. Seven additional cases cover pure
  coherent merges, live UI pre-mutation refusal, reinjected stale options and
  stale API-envelope removal. Real production gate, public selectors, localStorage
  restoration, inspection preview, both UI starts and lifecycle are exercised.
  Fault exports simulate broken modules; safety decisions are not replaced in
  normal positive/negative controls. Map/bootstrap doubles observe boundaries.
- Full JavaScript/coverage: **103 suites, 2,118 tests passed**. Includes existing
  lifecycle, route selection, mandatory avoidance, origin integrity and IndexedDB
  resume regressions. `npm run lint:tests` and `git diff --check` passed.
- Focused backend integrity/origin/Valhalla: **174 passed**.
- Full CI-selected backend list (73 files), first run: **1 failed, 1,610 passed,
  1 skipped, 68 subtests passed**. The unchanged Phase 11 diagnostic correlation
  test captured a late `area_task_finished` record belonging to the previous
  asynchronous viewport test. The existing completion event precedes the wrapper's
  final log, permitting cross-test capture. This matches the previously recorded
  PR #372 race; no test or audit assertions were altered.
- Unchanged audit file separately: **24 passed**. Full selection rerun:
  **1,611 passed, 1 skipped, 68 subtests passed**. The skip requires actual Windows
  handles on disposable CI fixtures. The known log-capture race remains unresolved.
- Initial backend collection was blocked by missing `shapely`; repository-pinned
  `requirements-geometry.txt` dependencies were installed before completed runs.

Backend runs used the existing virtualenv, disposable SQLite and denied outbound
socket connections via an external runner. No application server or live router
was started. JavaScript used Node 24 and existing lockfile dependencies. Native,
desktop and live-service suites outside the configured backend selection were not
run. Private fixture 0 captures were not supplied or executed; no recorded fixture
verification is claimed. Local SQL-policy execution was not needed for these JS
changes; hosted CI reports that job independently.

## Limits and decision

Synthetic contracts and bootstrap-boundary controls are not completed driving or
real-device acceptance. Served Chrome/Edge behavior, service-worker version skew,
browser restart/multiple tabs/offline persistence, actual disk-cache-to-PWA
reassessment and independent device evidence remain acceptance work.

No backend production code, two-metre threshold, mandatory refusal semantics,
native correlation, exclusion rules, engine requests or private evidence changed.
PR #373's lifecycle and IndexedDB refusal protections remain intact.

**PRODUCTION_NO_GO. Do not auto-merge or deploy this change.**
