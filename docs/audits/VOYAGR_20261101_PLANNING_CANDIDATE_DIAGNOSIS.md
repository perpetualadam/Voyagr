# 1 November 2026 planning failure: captured-response diagnosis

This report supersedes the initial hypothesis-only diagnosis. Source baseline is main `38e19001313e9d97d47096f2bb26620fc65c7cdc`. PR #380 changes no endpoint-integrity threshold, mandatory avoidance decision, navigation-authorisation gate, request generation or journey ownership protocol. No production access, provider requests, merge or deployment occurred.

## Primary evidence and reproduction

The user supplied the actual `/api/route` response in Pasted text.txt (411,724 bytes). The attachment starts with a JSON member rather than an opening object brace. Restoring that opening `{` makes it valid JSON. The fixture `static/js/__tests__/fixtures/sheffield-doncaster-20261101.json` preserves its parsed fields, including all five full geometries, assessments and maneuver arrays; only JSON whitespace/serialization changes. No response values are refreshed or synthesized.

The first alternative is ID 1, GraphHopper, precision 6, with 66 maneuvers. Its assessment `checked_at` is `1793546749.8781314` (2026-11-01 15:25:49.878131 UTC). The frontend recomputes geometry binding `7b82209c`, matching the response. All five alternatives' bindings match their respective geometries in the replay.

The first maneuver failing the old instruction predicate is zero-based index **5**:

```json
{"begin_shape_index":27,"end_shape_index":46,"instruction":"","verbal_pre_transition_instruction":"","distance":0,"time":0,"type":8,"road_class":"primary","speed_limit":30,"street_names":["Brook Hill"]}
```

Backend `voyagr/services/routing/route_entries.py:maneuvers_from_graphhopper_route()` deliberately emits these silent type-8 edge updates when speed limits or road class change inside a spoken maneuver. They are not missing turn instructions. Their shape ranges can overlap their enclosing maneuver and each other.

Frontend `avoidance-integrity.js:prepareNavigationCandidate()` previously rejected every empty instruction. It therefore returned null at record 5; `applyCalculateRouteIdlePreviewOutcome()` threw the reported message before committing a plan. `journey-plan.js:inspection()` repeated the same blanket rule, so changing only candidate preparation would expose a second rejection. The broad catch in route selection then mislabeled the failure as coordinate parsing.

The actual captured fixture failed the two positive captured-response tests before this correction (10 negative/expiry tests passed). With only the frontend correction, all 12 captured-response tests pass. The replay clock is explicitly fixed at assessment time +1 second to isolate the structural failure; that is a test control, **not the observed browser time**.

## Smallest safe correction

Recognize only the existing silent edge-metadata shape: type 8; all four supported instruction channels absent or whitespace-empty strings; exactly zero distance and time; ordered nonnegative integer indices; and a positive numeric speed limit or nonempty road-class field. Existing upper-bound index validation still runs. Candidate preparation still requires at least one meaningful instruction, valid geometry and binding, identity and a fresh assessment. Ordinary missing instructions, wrong types, nonzero distance/time, missing edge metadata, invalid indices and metadata-only guidance remain rejected.

Inspection accepts the same narrow metadata contract and excludes those records from simulation's spoken-step selection. The full candidate retains its original maneuvers and edge attributes; no speed metadata is erased and no invented instruction or connectivity proof is added. An older integrity module without the metadata helper remains fail-closed in inspection.

The earlier PR diagnostic changes remain: explicit rejection reason codes, `Route preview failed` instead of the blanket coordinate label, and planning-only endpoint/provider warnings.

## Planning versus navigation

The actual captured response is navigation-refused because of endpoint relocation, not malformed route geometry. Origin displacement is 23.651 m and destination displacement is 22.793 m for the first alternative. The two-metre threshold stays unchanged. The captured response has `automatic_selection_allowed: false`, unverified connectivity and `NO_COMPLIANT_ROUTE`.

After correction the actual payload reaches idle planning preview with five independently assessed alternatives and unchanged assessments. All five remain refused by the navigation gate. It cannot replace an existing active journey: `commitPlanning()` retains the unresolved-critical-checks guard, confirmation and staged ownership transaction. No live GPS start, implicit navigation activation, avoidance guarantee or provider-enforcement claim is introduced. Simulation remains inspection-only and separate from live authority.

## Hypotheses resolved and limits

- **Empty metadata instructions:** confirmed sufficient cause using the actual record and old predicate.
- **Overlapping indices:** not itself rejected; cross-maneuver disjointness is not a candidate requirement. Each record must still have valid in-bounds ordered indices.
- **Binding mismatch:** excluded for this captured response; all five recompute correctly.
- **Assessment timestamp:** timestamp exists, but browser clock and original failure time are unavailable. Expiry or clock skew could additionally reject a replay at another time. No server/browser time correlation is claimed.
- **Navigation refusal:** not the candidate-preparation cause. It still prohibits navigation and unresolved replacement of active journeys.
- **Production served revision/worker activation:** not independently inspected. There are no server logs available in this workspace and no browser/VPS access was assumed. The captured data demonstrates the source-level contract failure, not the exact running worker revision.

## Validation

Local test lint passed. Full JavaScript CI command passed **114 suites / 2,517 tests**, including actual captured-response idle publication and existing-journey preservation, five independent assessments, bindings, ordinary instruction failures, edge-metadata constraints and assessment expiry. Existing regressions cover mandatory avoidance, precision 5/6, malformed geometry, stale asynchronous responses, simulation isolation and ownership/rollback.

The preceding backend web selection passed 1,658 tests, one skipped and 68 subtests. No backend source changed in this correction; renewed GitHub CI runs the full declared backend selection plus frontend coverage, SQL policy and Windows metadata on the new head. Desktop/custom-router/live-service and real browser/device testing are outside those results. No production-navigation acceptance is claimed.

## P2/P3 remediation after independent review

Reviewed starting HEAD/tree were verified exactly as `cec21d31448cf835f6c67d1131b444ea5cfb29da` / `8a110bc1b737ae889acd26b66469d26ade12d62f` before changes. The existing PR branch is retained; no merge, auto-merge or deployment is performed.

**P2 root cause:** `isEdgeMetadataManeuver` checked only ordinary and pre-transition text. Nonempty transition-alert or post-transition text could therefore be classified as silent and removed from simulation guidance. The backend Valhalla normalizer supports all four channels; GraphHopper's real synthetic edge updates omit the additional channels.

The shared `maneuverInstructionState` now classifies all four channels as invalid, spoken or silent. Present null, number, boolean, array or object fields are invalid. Absent fields and whitespace-only strings have no directional content. `validManeuverInstructions` is shared by candidate preparation and inspection: ordinary instructions remain meaningful text; verbal-only purported metadata is rejected rather than silently removed or converted into an invented instruction. Nonempty ordinary directions with valid verbal channels remain in their original order. Genuine metadata still requires type 8, zero distance/time, ordered indices and speed/road-class data, with existing route bounds validation. Older integrity modules without the new validator fail closed for empty-instruction metadata in new inspection code.

**P3 root cause:** one combined condition returned the same diagnostic for missing/invalid assessments and freshness failures. It now returns bounded codes:

| Condition | Code |
| --- | --- |
| Missing/null assessment | `missing_assessment` |
| Geometry validity not exactly true | `invalid_geometry_validity` |
| Missing/non-numeric/non-finite timestamp | `invalid_assessment_timestamp` |
| Age greater than 600 seconds | `expired_assessment` |
| Future timestamp | `future_assessment` |

Age exactly 600 seconds remains accepted for preparation. Navigation authorization is still separately assessed and remains refused for the captured routes. No reason code contains coordinates, tokens or payload data.

### Before/after evidence

The review's two directional-field mutations and missing-versus-expired assessment test were reproduced on the reviewed commit. A fixed, revision-parameterized harness `/tmp/voyagr-pr380-review/p2p3-clearance.cjs` executes identical rejection assertions against Git-loaded reviewed code and working code: **0 passed / 3 failed before; 3 passed / 0 failed after**. Both candidate and inspection must reject the contradictory verbal records. These expectations were not weakened.

The older exploratory review harness is retained unchanged. It also included an observation asserting inspection accepted and filtered the bad records before its final rejection assertion; corrected inspection now throws at that observation. Its missing-pre-field negative assumption is superseded by this task's explicit empty-or-absent instruction-channel contract. Those historical exploratory expectations are not used as acceptance criteria or reported as passing. The focused fixed harness and committed Jest regressions express the required behavior directly.

New `maneuver-contract-remediation.test.js` covers all four channels, meaningful text, missing/empty/whitespace fields, null and unexpected types, retained directions and ordering, captured metadata/progress/binding preservation, assessment diagnostics and exact freshness boundaries. Existing diagnostic assertions were updated to the newly required specific codes; no acceptance assertion was weakened to hide a defect.

The captured fixture is unchanged. All 18 legitimate GraphHopper silent updates remain accepted; all five route assessments and geometry bindings remain intact. Existing actual-payload idle-preview and active-journey-preservation tests pass. Separate asynchronous ownership probes also pass (2/2); complete JavaScript coverage retains stale-response, multi-stop and simulation/live isolation regressions.

Local remediation validation: test lint passed; full JavaScript **115 suites / 2,572 passed**, zero failed/skipped; SQL policy **11 passed** on temporary local PostgreSQL. The declared 75-file backend web selection passed **1,658 tests, one skipped and 68 subtests**. Exact new-head hosted CI results are reported with the final PR update. Real browser/device testing, original browser-clock/server-log correlation, production deployment state and applicable legacy recovery remain outside these results. Production navigation remains NO-GO.
