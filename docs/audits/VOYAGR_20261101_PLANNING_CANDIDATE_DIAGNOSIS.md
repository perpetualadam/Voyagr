# 1 November 2026 route preview rejection investigation

Scope: source based on main `38e19001313e9d97d47096f2bb26620fc65c7cdc`. No production access, provider calls, deployment, merge or safety-policy change. Reproductions use synthetic geometry and assessment data, not an actual production response capture.

## What is established

The exact reported inner message is thrown by `applyCalculateRouteIdlePreviewOutcome()` in `static/js/app/calculate-route-orchestration.js` when preparing **option zero** returns null. This happens before `commitPlanning()` and before any new route/map publication. It does not prove coordinate parsing failed.

`prepareNavigationCandidate()` in `static/js/modules/navigation/avoidance-integrity.js` checks:

1. A candidate exists and is not a restore-only record.
2. A nonempty string ID or finite numeric ID exists.
3. The assessed geometry binding matches the authoritative geometry and any normalized polyline, including explicit precision (5 or 6).
4. The assessment says geometry is valid, has a finite timestamp, and is between zero and 600 seconds old according to the browser clock.
5. Maneuvers exist and contain nonempty instructions, supported nonnegative integer types, and valid ordered shape indices.

It does **not** check `navigation_outcome`, `automatic_selection_allowed`, origin connectivity status, displacement, or planning purpose. A `REFUSED` route with a valid fresh structural contract can pass preparation. `geometry_valid: true` alone is insufficient to prove this contract.

The caller's catch uses `buildCalculateRouteIdlePreviewParseErrorApplyPlan()` for every exception in the block, including candidate preparation, map operations and planning commit errors. This mislabels non-coordinate failures as coordinate parsing. The patch labels these as route preview errors and adds a bounded reason code for candidate rejection. It does not log raw coordinates or full response data.

## Planning, simulation and live authority

`VoyagrJourneyModes.commitPlanning()` separately checks the planning generation and request-current callback, stages map publication, and publishes only while that transaction remains current. A refused candidate can be inspected when no live/retained journey exists. If a journey exists, unresolved critical checks block replacement **before confirmation**, retaining its canonical continuation. Removing this block would change existing product policy and is outside this patch.

`VoyagrJourneyPlan.inspection()` permits complete geometry inspection without making a navigation claim. Simulation uses inspection and its own mode/marker; existing tests cover isolation from GPS start and community submission. Live start uses the evidence gate and fresh GPS/routing path. Nothing in this patch grants permission, backfills ownership or replaces missing evidence.

The reported ~23.7 m origin and ~22.8–23.7 m destination offsets exceed the unchanged two-metre endpoint threshold. `material_endpoint_relocation`, missing connectivity proof, mandatory unverified avoidance and navigation refusal remain authoritative. The server's HTTP 200 means a successful route response, not navigation authorization. Planning purpose does not waive those checks.

## Binding and request ordering

Backend `voyagr/services/routing/journey_geometry.py:geometry_binding()` and frontend `avoidance-integrity.js:geometryBinding()` use FNV-1a over quantized vertices. This is a consistency checksum, not authentication. Geometry precision must match the encoded data. A stale decoded polyline cannot replace authoritative geometry. Candidate preparation does not verify a cryptographic response identity; routing tickets bind the request sequence, preferences revision/snapshot and endpoint intent generation. `calculateRoute()` checks ticket currency after async geocoding/fetch/JSON processing, and planning checks it again during staging/publication.

The normalizer retains each alternative's assessment and geometry rather than granting all alternatives the first one's permission. The added five-alternative fixture checks distinct bindings and independent refusals across GraphHopper/Valhalla labels. It does not silently select another alternative if the primary candidate is malformed.

## Smallest supported correction

- Preserve all candidate checks and return semantics; optionally report which check rejected the candidate.
- Replace the broad coordinate-parsing error label with route-preview error wording.
- Clarify the existing preview summary: unverified start **or destination** connectivity, planning-only inspection, no navigation start, review avoidance evidence. Existing provider-limitations wording remains appended.
- Add regressions in the production calculation/mode harness and backend HTTP safety-hook tests. No backend permission, threshold, endpoint-snapping or provider-enforcement changes are made.

## What remains unknown

The supplied evidence omits the actual first alternative ID, encoded geometry/precision and binding, maneuvers and indices, checked_at and browser clock. Therefore it does not distinguish missing/invalid maneuvers, binding mismatch, assessment clock skew/expiry or another structural rejection. The deployed JS/backend revisions and worker activation state were not inspected. The incident's exact failing predicate cannot honestly be identified from the summary alone.

Capture the first alternative's structural fields and browser time, plus served module revisions, without credentials or personal journey data. The new reason code will narrow a future local reproduction. Do not claim the route-calculation incident is functionally fixed by diagnostics. Any follow-up acceptance change needs evidence and the existing safety invariants.

## Validation

Validation passed: npm run lint:tests; npm run test:ci -- --maxWorkers=2 (113 suites, 2,503 tests); the declared 75-file backend selection (1,658 passed, one skipped, 68 subtests passed). The first backend attempt could not collect ten modules because Shapely was absent; installing the repository-declared requirements-geometry.txt resolved collection without source/test changes. Added cases cover the reported five-alternative shape, planning-only acceptance, independent navigation refusals, mandatory avoidance, 5/6 precision, malformed geometry, binding mismatch, expired assessment, missing identity/maneuvers, stale async responses and previous-journey preservation. Existing simulation/GPS tests remain required. Full backend execution uses the 75-file web selection from CI, not desktop/custom-router/live-service suites.

No browser or physical-device acceptance was executed. Production navigation remains NO-GO pending separate acceptance and applicable legacy recovery.

## Follow-up hypothesis checks

The available chat contains the response summary but no raw /api/route JSON, console capture, first-alternative maneuver records, browser timestamp or server logs. The only uploaded text attachments describe integration and deployment tasks. No exact production payload or log correlation is claimed.

Additional deterministic tests show that overlapping ranges across distinct maneuvers do not alone reject preparation: validation checks each maneuver individually, not cross-maneuver disjointness. Missing instructions and timestamps ahead of the browser clock are rejected with their respective diagnostics. These tests establish possible rejection conditions, not the incident's actual cause.
