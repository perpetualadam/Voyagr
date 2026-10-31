# Phase 12F-F: best-effort navigation and refusal presentation

PRODUCTION_NO_GO. Independent review required. No deployment or automatic merge.

## Diagnosis before implementation

Baseline: 16d26dd1ef970ea95dba32deabfe85b55cfd3bf7, also fetched origin/main.
The supplied Sheffield-to-Doncaster observations include HTTP 200, five alternatives,
valid decoded geometry, automatic_selection_allowed=false and NO_COMPLIANT_ROUTE.
The later supplied network log confirms successful asset/route HTTP fetches, but
contains no route response assessments. Fetch success does not establish JavaScript
initialization, a current safety contract or navigation permission.

**Exact failing requirements remain unknown.** No real route request was issued.
Required missing evidence is the request's normalized avoidance modes, each route's
avoidance_assessment (requirements/status/mode, geometry_valid/binding, checked_at,
automatic_selection_allowed/requires_acceptance), origin_integrity reason/status,
displacements/timestamps and the selected alternative's identity. A sanitized
assessment suffices; coordinates, route captures and personal data must stay out of Git.

The actual code path is integrity_api.register_avoidance_integrity's after-request
hook -> integrity.assess_response -> origin_integrity.assess_origin. The hook
reassesses primary, alternative, cached and multidrop responses, ignoring cached
compliance claims. The summary warning is emitted when no alternative remains
eligible after those checks; it does not distinguish the precise failure.

At baseline assess_route already permits unresolved preference rows: automatic
selection requires valid geometry and all enabled **mandatory** rows satisfied.
assess_response additionally refuses unresolved endpoints/mandatory exclusions and
incomplete stops. Thus preference limitations alone do not explain the reported
NO_COMPLIANT_ROUTE; endpoint/mandatory/geometry evidence must be inspected.

UI flow: showRoutePreview -> selection -> startNavigation/startNavigationFromPreview
-> startTurnByTurnNavigation -> prepareNavigationCandidate and synchronous gate ->
transactional map mount, persistence, second gate check and runtime commit. A refused
start correctly returns false before mutation, but preview start buttons had no
eligibility binding; in particular the green preview control was always presented
without a disabled explanation. Transient status messages can be overwritten, making
that correct refusal look unresponsive. This is a confirmed code-level presentation
gap, not a reproduction proving the Sheffield route's precise refusal cause.

## Requirements-to-decision matrix

| Requirement | Existing authority | Outcome on failure |
|---|---|---|
| Requested origin/destination and journey stops | assess_origin; unchanged CONTINUITY_M=2.0 | REFUSED |
| Required exclusion/access/direction evidence | existing server assessments and mandatory rows | REFUSED; no native evidence is invented |
| Geometry completeness and binding | server geometry_valid/binding, prepareNavigationCandidate, real map ownership checks | REFUSED |
| Fresh evidence, current captured settings, online start | production verifier and request tickets | REFUSED |
| Enabled mandatory category | normalized row mode=mandatory, status must be SATISFIED | REFUSED, no confirmation/override |
| Explicit backend denial / requires_acceptance | existing assessment fields | REFUSED |
| Camera, signals, rail crossings, CAZ or other category configured as preference | normalized row mode=preference | BEST_EFFORT when unresolved and all critical checks pass |
| All critical checks pass; preferences satisfied/disabled | same authority | VERIFIED |

Category names never downgrade mandatory rows. Provider option acceptance and toll
cost estimates remain insufficient proof. The current origin checker explicitly
reports road_connectivity=NOT_VERIFIED and safe_exit=NOT_ESTABLISHED: numerical
endpoint continuity does not certify native road access or legal direction. This
change neither supplies that evidence nor claims universal road legality. If a
required check causes backend refusal it remains refused. Establishing a new
always-on native-road-verification policy would be separate routing policy work.

## Implemented scope and policy consistency

- Backend adds descriptive per-alternative/top-level navigation_outcome using existing
  independent assessment results. It does not change automatic_selection_allowed,
  requirements, provider policy, ranking thresholds, endpoint tolerance or hazard matching.
- The production verifier derives the same three UX outcomes. Neither backend nor
  client outcome labels authorize navigation. The existing boolean gate is retained.
- Explicit backend false permission, stale preference assessments and changed captured
  preference snapshots now refuse consistently with complete navigation evidence.
  Saved previews explicitly refuse. These are stricter coherence checks, not new
  permission paths. Legacy nonmandatory evidence without a preference snapshot retains
  existing compatibility; normal served responses are tagged with their request snapshot.
- Preview controls use the verifier and complete candidate validation, explain refusal
  persistently, and refresh for connectivity, preference changes, GPS movement and age.
  Inspection/recalculation remain available; disabled styling is never the safety gate.
- A nonmodal, polite live-region warning is shown only after successful start or
  replacement commitment. It dismisses after six seconds or native keyboard-accessible
  dismissal. Route details retain the full warning. It uses textContent for dynamic
  category names and never invokes confirmation. Pointer events pass through the card
  except its dismissal control; maneuver guidance remains above it.
- Identical preference compliance does not repeat the warning on ordinary updates.
  Changed committed reroute compliance replaces it; failed replacements preserve old
  protected state and warning. Verified replacement clears it. GPS updates never call
  the warning publisher.
- Service worker cache/version and changed asset URLs are updated to avoid old bundles.

## Validation and acceptance limits

Focused JavaScript tests exercise the actual lifecycle/replacement verifier with
synthetic MapLibre API/device boundaries, and adversarial warning/eligibility cases.
Python tests exercise real assessment functions and Flask's production HTTP safety
hook using synthetic provider-format-equivalent route data, without external calls.
Existing cache, saved-journey, origin, mandatory, request-order and map transaction
suites remain regression coverage. Final test counts are recorded in the PR.

No production Chrome capture has been reproduced, no live providers or VPS were
accessed, and no sandboxed real-browser rendering/accessibility test is claimed.
The previous environment discovery did not establish an operational secure Chrome
sandbox. Layout, screen-reader announcements, PWA update behavior and the reported
route require later independent real-browser acceptance. Do not merge on the basis
of a green button, a synthetic route or a coarse summary warning alone.

## Recorded local verification

- `npm run lint:tests`: passed.
- `npm run test:ci -- --maxWorkers=2`: 108 suites, 2,303 tests passed; coverage thresholds passed.
- CI-declared Python web file selection plus the new regression file: 1,621 passed,
  one skipped, 68 subtests passed across 74 files. The skip requires actual Windows
  handles; its platform-specific test was not claimed as executed on Linux.
- `scripts/test-dashcam-session-sql.py`: 11 tests passed using disposable local
  PostgreSQL from pgserver; no production DSN is accepted by the script.
- `git diff --check`: passed.

The local web test venv needed the CI-declared requirements-geometry packages; these
were installed only into `.venv`. No desktop/Kivy full-directory suite was run.

## Changed-file inventory

- `voyagr/services/routing/integrity.py`: descriptive backend outcomes.
- `static/js/modules/navigation/avoidance-integrity.js`: derived three-outcome
  presentation, authoritative backend refusal and freshness/coherence checks,
  explicit origin/mandatory refusal explanations.
- `static/js/app/navigation-safety-ux.js`: eligibility presentation and warning lifecycle.
- `static/js/app/route-preview-orchestration.js`: selected preview presentation hook.
- `static/js/app/navigation-lifecycle-orchestration.js`: post-commit warning and cleanup hooks.
- `static/js/app/reroute-map-orchestration.js`: post-replacement warning hook.
- `templates/index.html`, `static/css/voyagr.css`: accessible controls/notices and
  nonmodal warning below maneuver/control stacking layers.
- `service-worker.js`: new UI asset and cache generation.
- `static/js/__tests__/best-effort-navigation.test.js`,
  `tests/test_best_effort_navigation.py`: adversarial UI/lifecycle/HTTP regressions.
- Existing `avoidance-integrity`, `graphhopper-capability-selection` and
  `phase5-journey` JavaScript tests: fixtures reflect independent server permission,
  explicit valid geometry and fresh timestamps; assertions remain intact.
- `.github/workflows/ci.yml`: new Python regression file joins the required web job.
- This audit: diagnosis, matrix, policy scope, verification and limitations.
