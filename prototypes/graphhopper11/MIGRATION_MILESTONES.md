# GH11.1 migration milestones

Updated: 2026-11-22. Overall: **NO-GO for production migration**.
Work continues on PR #540; it is open and unmerged. UK production and GH8 remain
unchanged. Each milestone requires recorded evidence; a green test alone does
not establish physical-phone behaviour or production readiness.

## 1. Prototype evidence review — COMPLETE (self-review)

Reviewed code baseline: `9c44f07876fa5321c6e60bee7b5c2648203c9108`.
All six GitHub checks passed for that exact commit: Backend, Frontend, synthetic
(Java 17), SQL policy, Nginx cache policy and Windows evidence metadata.
This is an engineering self-review, not an independent reviewer approval or
permission to merge/deploy. Current documentation/workflow changes need their
own subsequent CI results.

- [x] Confirm source scope: prototype files, tests and dedicated CI only.
- [x] Confirm 36 engine/adapter and 22 boundary test cases are in dedicated CI.
- [x] Preserve operator-supplied UK selected-record detours and refusal controls.
- [x] Distinguish actual Java graph checks from synthetic Python boundary tests.
- [x] Record explicit-Start blocker and existing cache reassessment protections.
- [x] Correct prototype CI triggers for boundary-test and cache-implementation changes.
- [x] Record limitations and next acceptance gates below.

Selected UK evidence includes Red Lane exact-node detours, selected directional
camera and Castleford tests, and A61 primary, one returned native alternative,
a continuous three-point route and changed-departure provider query, with zero
selected forbidden traversals. The operator executed these on VPS2; this review
did not independently access the server. No general hazard coverage, complete
legal compliance, capacity or browser behaviour is established.

Outstanding review findings carried into implementation:

1. Actual Flask/GH11 Java transport is absent. The existing synthetic session
   accepts only synthetic complete coverage and always disables navigation.
2. Real graph/source manifests and trusted hazard-to-directed-edge compilation
   are absent. A caller-supplied version string is not evidence authentication.
3. The current UK explicit-Start advisory override is incompatible with strict
   mandatory refusal. Preserve UK behaviour while testing a separate strict mode.
4. Cache hits already receive after-request hazard reassessment; explicit
   requirements force refresh. Preserve both while adding GH11 version binding.
5. Native alternatives returned one UK route in the selected A61 test, not three.
   General multi-stop planning, stopping/heading semantics and browser rerouting
   remain unverified. Do not promote selected-case proof into these claims.
6. Synthetic boundary sessions are not an HTTP security boundary. Request/body,
   concurrency, deadlines, origin authentication and trusted evidence ownership
   must be specified before introducing a listener.

## 2. Isolated application connection — COMPLETE for registered-case preview

The local implementation was reviewed before the separately approved VPS2 start.
Existing phone-test, reverse proxy and UK application settings were preserved.

- [x] Define the selected-fixture request/response schema: ordered visits, profile, alternatives,
      mandatory rules, graph/source/policy identities, evidence state and refusals.
- [x] Build an operator-owned graph manifest/selected-fixture association registry; refuse
      client-supplied directed keys, custom Java expressions and coverage claims.
- [x] Add bounded Java transport returning geometry, instructions, directed traces
      and version identities; keep the graph read-only and use request-local blocks.
- [x] Add a separate Flask app factory/configuration importing no production app
      and calling that real transport; synthetic test providers are insufficient.
- [x] Refuse unregistered client settings, version changes, transport failures and
      validator failures explicit refusals with no alternate-engine fallback.
- [x] Run test-client integration tests against the actual Java process and
      generated graph, with no live routing requests or datasets downloaded.
- [x] Present the complete resource/network/authentication/start/stop proposal
      before requesting approval to start the isolated VPS2 service.
- [x] After approval, show a validated route from the real isolated app on VPS2.

Local container smoke passed: actual WSGI/Java route, refusal, authentication,
graph immutability, UID 10001, read-only root and network none. The service and
its generated data were removed afterward. Exact image identity, offline transfer
archive checksum, staging guards, startup and rollback commands are recorded in
[container/README.md](container/README.md). The operator subsequently completed
the approved VPS2 startup, service checks and physical browser acceptance below.

Local implementation details, test scope and remaining service proposal:
[ISOLATED_APP.md](ISOLATED_APP.md). Registered static source snapshots are not a
freshness/coverage service; arbitrary user journeys and legal routing remain
unsupported. Request JSON cannot supply edge IDs or custom models.

Exit: actual Flask-to-Java calculation and route display demonstrated, graph and
source identities verified, failures refused, GH8/production unchanged. This does
not grant real navigation authority or complete strict hazard coverage.

Milestone-2 operator service results and Pixel 6 screenshots are recorded in
[VPS2_ACCEPTANCE_2026-11-22.md](VPS2_ACCEPTANCE_2026-11-22.md). The A61 route and
instructions rendered, and the refusal cleared the route. This acceptance covers
the registered-case experiment, not actual navigation or production migration.

## 3. Mandatory rules across the app — IN PROGRESS (opt-in gates under test)

- [ ] Connect a separate strict browser mode to the isolated backend.
- [ ] Keep mandatory refusal through explicit Start, manual selection and automatic replacement.
- [ ] Check every alternative and leg; preserve current journey on a failed replacement.
- [ ] Bind cache/selection to versions, settings, ordered stops and current origin.
- [ ] Test saved/restored plans, source outages, stale-response races, policy changes
      and refusal of legacy provider fallbacks.

Development scope and pending deployment are recorded in [STRICT_MODE.md](STRICT_MODE.md).

Exit: actual Flask/browser tests pass; the current synthetic contract is supporting
unit evidence only. No unsafe route can be made navigable by the strict Start UI.

## 4. Expanded hazard and route coverage — PENDING

- [ ] Test opposite direction, wrong carriageway, parallel roads and junctions.
- [ ] Test missing/stale/ambiguous association evidence and graph rebuild IDs.
- [ ] Test 3/2/1/0 compliant outcomes, every leg and deviation request.
- [ ] Verify general turn restrictions and continuous-via versus stop semantics.
- [ ] Refuse unknown mandatory compliance; never pad route count with an unsafe route.

Exit: agreed deterministic matrix passes, with association provenance and any
remaining unsupported scenarios explicitly refused.

## 5. VPS2 performance — PENDING

- [ ] Agree targets before measurement; record hardware, JVM, graph/config hashes.
- [ ] Measure cold/warm long routes, alternatives, stops and concurrent requests.
- [ ] Measure peak RSS/container memory, CPU, import/storage and resource failures.
- [ ] Confirm other VPS2 services remain healthy; do not infer US capacity from UK data.

Exit: reproducible measurements meet agreed targets; no invented capacity claims.

## 6. Pixel 6 / Android 14 acceptance — PENDING

- [ ] Test in the user's browser: map/GPS, navigation, warnings and selected rules.
- [ ] Test deviation, network loss, foreground return and private-access recovery.
- [ ] Verify retained local data without clearing storage or reinstalling anything.
- [ ] Record timestamps, versions and pass/fail outcomes without private journey logs.

Exit: user-observed physical-phone checks pass, separate from automated browser tests.

## 7. Migration and rollback rehearsal — PENDING

- [ ] Rehearse rollback to unchanged GH8 on the isolated setup.
- [ ] Prepare reviewed version-pinned deployment/configuration diff and monitoring.
- [ ] Document unresolved limitations and abort criteria.
- [ ] Obtain explicit approval before production deployment or configuration changes.

Exit: concrete rollout proposal and demonstrated rollback. Production readiness
must not be inferred from completing an earlier milestone.
