# Registered multi-stop alternatives from whole-journey searches

27 November 2026. Original Milestone 3 journey/alternative work, continuing PR #540.
Navigation stays disabled; production migration remains NO_GO.

## Implemented scope

GH11's native `alternative_route` path in this runner supports two points.
Multi-stop alternatives now have a separate operator-registry opt-in:
`alternatives: true` plus `whole_journey_alternatives: true`. Stopping/mixed visits
also require the existing `continuous_no_turn_reset` stop-preview mode. Clients
cannot supply these execution switches, edge exclusions or custom expressions.
Existing registries are not automatically changed. Only the new generated
synthetic registry opts into the feature in this change.

Each search executes a complete ordered GHRequest with every visit, the same
profile/custom model, pass-through mode and mandatory directed exclusions. A
bounded queue adds request-local edge exclusions to obtain distinct complete
journeys. It never concatenates separately routed leg alternatives. Existing
imported-turn/profile-weight checks apply across the resulting full path, including
visit boundaries. Request hints are restored after the search; graph state is not
mutated. Native two-point alternatives keep their earlier execution path.

Limits are 16 complete route calls, 64 queued exclusion sets and a 20-second search
deadline checked between queries, with remaining-time limits passed to GH11.
Existing node, heap, process-timeout and output limits still apply. Three unique
directed-traversal sequences stop the search. This is a bounded exclusion search,
not a k-shortest algorithm, an exhaustive search or a guarantee of finding every
available alternative. Long shared prefixes and budgets can leave alternatives
undiscovered. Fewer returned candidates never establish that no others exist.

Only disconnected branches created by extra search exclusions are skipped.
Unexpected provider errors or invalid candidate evidence refuse the complete
request rather than publishing a partial set. Failure of the initial full-policy
query refuses; it does not prove global route absence. No legacy engine or cached
route is used as an execution-error fallback.

## Independent validation and application behavior

The report records the generation method, actual call count, fixed limits,
`exhaustive: false` and `independent_legs: false`. The Python validator requires
this provenance for opted-in cases. It then applies existing independent geometry,
directed-edge, QueryGraph, waypoint/instruction and mandatory-exclusion checks to
every candidate before constructing an app response. Duplicate alternatives and
malformed final candidates cannot partially publish.

Every candidate retains its own geometry, instructions and complete leg ranges;
all use the same complete bound request/policy. Stop/via types and separate driving,
dwell and total timing are projected for every route. Search limitations are in
the preview envelope and each route's `routing_context`, which survives selection
and saved inspection. They are not misrepresented as an unapplied user preference.
Start and automatic selection remain refused, including after save/reload.

Private cache hits revalidate raw search/candidate evidence. Changed graph/source/
policy/request identities do not alias old entries. Contradictory cached search
claims refuse without Java fallback; the isolated HTTP handler now exposes the
fixed safe `cached_evidence_refused` enum instead of hiding it as `routing_refused`.
This does not expose arbitrary provider text or change production error handling.

## Acceptance

The generated graph has two route-choice diamonds around the registered visits.
Operator exclusions produce three/two/one returned complete routes, or refusal
with no returned route. Every returned route has all three legs, the via/stop
types, stop-only dwell, distinct identity and zero selected forbidden traversals.
This fixture establishes those outcomes only; it does not establish general
association, legal completeness, search exhaustiveness or UK/US capacity.

Actual-Java negative controls change search provenance, exceed the reported call
budget or corrupt the last candidate's waypoint coverage. The complete response
refuses. An authenticated HTTPS test executes three routes, reuses independently
validated raw cache evidence, then corrupts its exhaustiveness claim. HTTP 422
refuses and clears the bad cache, with no Java fallback. The separate native
restricted-turn fixture still refuses an illegal independent-leg join.

`test_real_chromium_full_uk_whole_journey_alternatives` boots a disposable full UK
page. Normal controls and Calculate reach real Java for zero/15-minute stopping
previews. It selects and verifies mounted geometry for every three/two/one returned
alternative, checks all leg ranges and Start refusal, retains the prior preview
after no-route or malformed-last-candidate refusal, refuses optimization before
Java, and saves/reloads the final preview with timing/types/search limitations
intact. All data and device storage are synthetic; external provider requests are
blocked. Local and committed-head CI results remain separate evidence levels.

```sh
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py \
  -k 'whole_journey and not real_chromium'
GH11_BROWSER_ACCEPTANCE=1 GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py \
  -k full_uk_whole_journey_alternatives
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

## Remaining original scope

Milestone 3 stays PARTIAL beyond registered previews. General journeys, arbitrary
visit interleaving, stopping maneuvers, stop-order optimization and time-dependent
routing remain unsupported. Trusted road/hazard association is a Milestone 4
dependency. Performance on real long routes/concurrency, updated physical-phone
behavior and deployment are unverified. The extra whole-journey workload needs
Milestone 5 benchmarking before any rollout. No VPS2/production access, service
restart, deployment, authentication change or merge is included.
