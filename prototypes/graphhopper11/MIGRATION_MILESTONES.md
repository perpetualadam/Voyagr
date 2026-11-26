# GH11.1 migration milestones

Updated: 2026-11-26. Overall: **NO-GO for production migration**.
Work continues on PR #540; it is open and unmerged. UK production and GH8 remain
unchanged. Each milestone requires recorded evidence; a green test alone does
not establish physical-phone behaviour or production readiness.

## Delivery scope correction — 26 November 2026

The original seven milestones below remain the delivery plan. The later origin,
index, tile, import-provenance and binary-membership investigations were additional
supporting research, not new original TODOs or automatic Milestone 3 exit criteria.
They produced useful bounded evidence, but none closed the four full UK application
acceptance rows. They should have been tracked separately rather than repeatedly
presented as the next Milestone 3 delivery step. More passing tests do not by
themselves mean another delivery milestone is complete.

| Original milestone | Current honest status |
| --- | --- |
| 1. Prototype evidence review | Complete within the recorded self-review scope |
| 2. Isolated application connection | Complete for registered-case preview; operator/phone selected-case evidence only |
| 3. Mandatory rules across the app | In progress; four original full UK acceptance rows remain open |
| 4. Expanded hazard and route coverage | Pending; supporting diagnostics exist, general coverage/association proof does not |
| 5. VPS2 performance | Pending; no capacity result inferred from synthetic tests |
| 6. Pixel 6 / Android 14 acceptance | Pending for the updated application/navigation; earlier preview screenshots are limited evidence |
| 7. Migration and rollback rehearsal | Pending; no production migration authorized |

**Priority reset:** pause further standalone index/boundary/decoder research. Keep
that code and its limitations for Milestone 4; do not delete it or treat it as
navigation authority. A confirmed app defect or an explicitly scoped Milestone 4
acceptance requirement can justify resuming it. No safety requirement, original
unchecked row or deployment gate is waived by this scheduling correction. Unknown
mandatory compliance must still refuse; positive guidance remains blocked.

**Completed bounded slice: Milestone 3, first open row (Start/selection/replacement).**
See [UK_CALCULATE_ACCEPTANCE.md](UK_CALCULATE_ACCEPTANCE.md): normal UK Calculate
now reaches real synthetic GH11 Java through an explicit test-only connection,
displays its preview, refuses Start and preserves a synthetic active journey
against selection/reroute/Calculate replacement. The complete-request metadata
rejection and dropped preview restrictions found by this acceptance are corrected.
This is PASS within the registered synthetic scope, not completion of the whole
row or authorization for navigation/deployment. Milestone 3 remains PARTIAL.

Original acceptance scope (retained for review):
Exercise the normal UK Calculate/request/response/display path against the actual
isolated GH11 registered-fixture backend, then the actual Start/selection refusal
and failed-replacement preservation gates. Use a disposable, normally booted UK
page, synthetic accepted origin/identity and explicit test-only connection. Keep
production `/api/route`, GH8, browser storage and navigation permissions unchanged.
Unsupported rules/requests must refuse without fallback; supported registered
preview work must actually reach Java, not be replaced with a mock response.

Evidence that motivated this priority: `routing-request.js:buildCalculateRouteFetchPlan`
still selects `/api/route`; `isolated_viewer.js` uses `/api/prototype/app-route`.
`UK_HOST_BOOT.md` describes a context connector, not route-generation wiring, and
`ACTIVE_JOURNEY_ACCEPTANCE.md` records that the full UK lab blocks route HTTP calls
and requires their count to remain zero. Thus green host/refusal tests do not yet
establish the complete UK Calculate-to-GH11 connection.

This first slice must report the exact supported cases and any concrete blocker;
it cannot close the whole row through a standalone preview or grant positive GH11
guidance. Then address the remaining original rows in order: every alternative/leg
and ordered-stop/reroute settings; complete request/cache/selection binding; actual
saved-journey restore/outage/race/fallback behaviour. Do not automatically turn an
unverified general-proof question into another serial Milestone 3 prerequisite.
**Next bounded task:** extend the full UK Calculate acceptance to registered
alternatives and ordered multi-leg requests, retaining settings on every returned
route/leg. Keep unsupported semantics refused and positive navigation disabled.
For each next task, name the original row, observable acceptance check and result
(PASS within scope / PARTIAL / BLOCKED). If blocked, record the specific dependency
and its milestone rather than reporting more diagnostics as delivery completion.

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

- [x] Connect a separate strict browser mode to the isolated backend for registered
      test cases only, with navigation disabled.
- [ ] Keep mandatory refusal through explicit Start, manual selection and automatic replacement.
- [ ] Check every alternative and leg; preserve current journey on a failed replacement.
- [ ] Bind cache/selection to versions, settings, ordered stops and current origin.
- [ ] Test saved/restored plans, source outages, stale-response races, policy changes
      and refusal of legacy provider fallbacks.

Registered settings are now echoed and checked end to end, with a bounded
public-fixture cache that revalidates raw evidence on reuse. Arbitrary settings,
production-cache integration and deployed acceptance remain pending.

Registered test-plan references can now be restored through current settings/version
checks and route revalidation, preserving the preview on refusal. This is not
production saved-journey integration; see [RESTORE_PLANS.md](RESTORE_PLANS.md).

The real-app audit found a selected-route strict-context propagation gap and
distinguished advisory explicit Start from fresh-GPS reassessment. The ordered
connection plan is in [REAL_APP_CONNECTION_AUDIT.md](REAL_APP_CONNECTION_AUDIT.md);
no application code was changed by that audit. The subsequent focused merge fix
and its regression scope are recorded in [SELECTION_METADATA_FIX.md](SELECTION_METADATA_FIX.md).

The registered-case response adapter now exports real instruction text/shape
intervals and waypoint boundaries into the app planning format. Planning acceptance
and strict navigation refusal are tested through the actual shared modules; see
[RESPONSE_ADAPTER.md](RESPONSE_ADAPTER.md). This is not a full `/api/route` or map
application connection.

The isolated canonical avoidance compiler now preserves all 13 rule categories,
refuses unsupported/unverified mandatory policy before execution, and binds explicit
policies through API cache and reference restoration. Full UI normalization remains
pending; see [SETTINGS_COMPILER.md](SETTINGS_COMPILER.md).

Temporary canonical-rule controls in the standalone viewer now preflight rules,
preserve warnings/refusals and support schema-2 references without storage writes.
The offline legacy-settings adapter now shares the application's unchanged
normalizer. Rich policies retain the original settings, re-derive and compare all
canonical rows/profile, and bind the full report through isolated cache hits and
schema-2 restoration. Adapter/contract source hashes enter manifest identity.
Supplemental preferences stay UNVERIFIED and navigation stays disabled. See
[APP_SETTINGS_ADAPTER.md](APP_SETTINGS_ADAPTER.md).

The real UK UI/request connection, production cache/saved-store integration and
phone acceptance of this revision remain pending. The standalone viewer now preserves
rich settings references and accepts bounded synthetic settings with independent
browser/server normalization and stale-response guards; see
[POLICY_UI.md](POLICY_UI.md).

Real Chromium -> loopback HTTP -> local GH11 acceptance now covers registered
full-settings calculation, restoration, mandatory refusal, offline recovery,
cache revalidation and synthetic storage markers. This is an isolated checkpoint,
not a live UK request connection or phone acceptance; see
[REAL_BROWSER_ACCEPTANCE.md](REAL_BROWSER_ACCEPTANCE.md).

A second real-browser checkpoint now verifies controlled 401/403 denials at both
preflight and route delivery, validated recovery, and a delayed preflight superseded
by edited settings. Fault controls exist only in the disposable test fixture; the
normal factory rejects their paths. This does not establish Nginx credential
expiry/recovery or physical-phone behavior. See REAL_BROWSER_ACCEPTANCE.md.

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

## Subsequent Milestone 3 checkpoint: full request adapter

The direct registered-fixture app-request bridge now preserves complete initial,
ordered-via and reroute payloads, binds their identities through fresh restoration,
and refuses unsupported journey semantics. Every call bypasses the public fixture
cache; engine failure cannot reuse cached evidence. The standalone frontend now connects through dedicated registered-case endpoints;
the UK UI/HTTP `/api/route`, private cache and owner store remain unconnected. See
[APP_REQUEST_BRIDGE.md](APP_REQUEST_BRIDGE.md). Milestone 3 remains in progress.

## Subsequent Milestone 3 checkpoint: isolated private cache

HTTPS complete requests now use a separate capability-scoped instance of the actual
app cache, binding complete requests/costs/visits/versions and revalidating raw
evidence on every hit. HTTP, reroutes, forced refresh and restores remain fresh.
Secure cookies, scope isolation, expiry and corrupt-evidence refusal are tested,
including a fourth real Chromium/TLS scenario. This does not connect the UK cache,
owner-saved collections or accepted live GPS. See PRIVATE_COMPLETE_CACHE.md.
Milestone 3 remains in progress.

## Subsequent Milestone 3 checkpoint: isolated owner-saved references

The standalone preview now explicitly saves validated schema-3 selectors using the
actual device-store implementation in a separate database. Local owner/epoch guards
prevent cross-scope replay and stale UI completion; restoring always preflights and
routes afresh. Legacy records and unknown isolated entries are retained, not migrated
or silently deleted. A fifth real-browser test covers persistence/reload, owner
isolation and owner change during restore. This is not production account/owner,
private journey or accepted-GPS integration. See OWNER_SAVED_PLANS.md.

## Subsequent Milestone 3 checkpoint: owner-coordinator identity boundary

An explicit binding now follows the device coordinator's captured owner/epoch and
change notifications without invoking migration, auth or production collections.
Unknown identity blocks saved-plan access; missed events are caught by operation
checks. The real browser scenario uses the same contract with synthetic identities.
Live UK host/account wiring and accepted GPS/current-journey integration remain
pending. Milestone 3 is in progress; this is not production account authentication.

## Subsequent Milestone 3 checkpoint: ephemeral journey evidence

A packaged, explicitly supplied owner/journey/GPS context guard now reuses the real
GPS validator and invalidates delayed preview work on evidence changes. Synthetic
unit/browser checks cover this boundary without collecting a location or enabling
navigation. The host journey snapshot API, accepted GPS runtime wiring and UI commit
integration remain pending. See JOURNEY_EVIDENCE.md; Milestone 3 remains in progress.

## Subsequent Milestone 3 checkpoint: guarded isolated UI commits

An explicit journey binding now protects the standalone viewer's requests, final UI
commits, alternative display and saves. Host refresh invalidates current/pending
work; closing keeps the bound path fail-closed. Registered preview without binding
is preserved. Real guard/validator DOM regressions and an actual Chromium restore
race use synthetic evidence only. UK lifecycle/GPS wiring remains pending; no
production migration or navigation authority is introduced. See JOURNEY_EVIDENCE.md.

## Subsequent Milestone 3 checkpoint: real host contracts

An explicit isolated adapter now consumes the existing UK journey-intent,
lifecycle and accepted-origin interfaces, without importing or starting the UK
runtime. Real intent-clock/lifecycle unit tests and synthetic browser integration
cover invalidation and refusal states. The adapter is packaged but not connected
to production; accepted-fix refresh hooks and actual UK binding remain pending.
See HOST_JOURNEY_ADAPTER.md. Milestone 3 remains in progress.


## Subsequent Milestone 3 checkpoint: accepted-position refresh

A dormant, no-payload GPS subscription hook now forwards changed accepted fixes to
the explicitly bound isolated adapter. Real GPS-module/host/viewer unit integration
and a synthetic-source actual-browser restore race cover refresh and stale-result
refusal. No watcher, account service, automatic UK binding or deployment was added.
Actual UK boot integration, geometry notifications and physical-phone checks remain
pending. Milestone 3 is still in progress.

## Subsequent Milestone 3 checkpoint: explicit loopback UK boot

The isolated package now provides one explicit same-origin loopback connector for
owner/session and journey/GPS bindings. It validates ready host contracts, detects
module replacement and closes the preview fail-closed on partial setup failure.
Actual module/store integration tests and the synthetic-host real-browser scenario
cover the connection. Production UK boot activation and full host-page acceptance
are still pending. See UK_HOST_BOOT.md; Milestone 3 remains in progress.

## Subsequent Milestone 3 checkpoint: full UK page acceptance

The disposable privacy browser lab now connects normally booted UK modules to a
same-origin preview frame using the explicit connector. Eight checks cover actual
planning-state refusal before routing, owner propagation, close and retained
synthetic data/runtime identity. Test-only assets/metadata are explicit; no active
journey, engine execution, account login or hardware GPS is implied. Active UK
routing/navigation parity and phone acceptance remain pending; Milestone 3 is open.

## Subsequent Milestone 3 checkpoint: active journey refusal

The real explicit Start establishes a synthetic LIVE baseline in deterministic and
full UK-page tests. An incoming preview could previously be masked by selected-route
merge and report a redraw; it is now refused before that merge. Three alternatives,
restore/offline/GPS-replacement paths retain active state, and legitimate redraw
still works. The twelve-check UK browser scenario binds actual LIVE host context
with a synthetic fix without granting GH11 guidance. See ACTIVE_JOURNEY_ACCEPTANCE.md.
Positive GH11 guidance/route parity remains NO-GO and Milestone 3 is in progress.

## Current Milestone 3 remaining scope (23 November 2026)

The four unchecked acceptance rows above refer to full UK routing, not just the
registered-case preview. Existing isolated tests establish refusal, version/settings
binding, saved references and selected-case leg checks; they do not close these rows.

1. Guidance/start/selection/replacement capability and origin/endpoint/turn provenance,
   retaining mandatory refusal wherever proof is unavailable.
2. Every candidate/leg through full UK settings, ordered visits, multi-stop and
   deviation-reroute paths, including fewer/no compliant routes.
3. Live origin, versions, settings, ordered stops and owner-bound cache/selection
   in the complete UK request path.
4. Full saved-journey restore, outage, stale-response/policy races and provider-fallback
   acceptance beyond registered fixtures and separate preview references.

The leg projection now uses canonical begin/end indices and the viewer validates
actual UK inspection for every candidate. Actual generated-graph primary/alternative/
via/reroute outputs pass inspection while remaining non-navigable. Collapsed bounds
and malformed third alternatives refuse without partial UI replacement. This closes
a concrete compatibility defect, not general turn/stop or guidance proof. See
LEG_PLANNING_CONTRACT.md. Milestone 3 remains in progress; no deployment is included.

## Subsequent Milestone 3 checkpoint: independent registered endpoint checks

The Python bridge independently checks each candidate's indexed origin, destination
and intermediate visits against operator-registered coordinates and snap bounds.
Transport corruption and both public-fixture/private-cache corruption refuse without
fallback. Recomputed observations remain coordinate-proximity evidence only, with
GPS unverified and navigation disabled. Anchor-only cases without registered
coordinates remain unverified. See LEG_PLANNING_CONTRACT.md. The four full UK
acceptance rows remain open; no deployment or physical-phone check is implied.

## Subsequent Milestone 3 checkpoint: profile turn validation

Normal response validation now checks finite, nonnegative request-profile turn
weights alongside original-edge continuity and imported car turn restrictions.
Generated-graph forward/reverse/via-U-turn paths pass; invalid-cost injection
refuses, and configured finite U-turn costs remain accepted. Unsupported approach
heading fields explicitly refuse in adapter regressions. Approach direction,
QueryGraph snapping and general turn/legal completeness remain unverified; the
four full UK acceptance rows are still open. See TURN_PROVENANCE.md. Navigation
remains disabled and no VPS/production deployment is included.

## Subsequent Milestone 3 checkpoint: actual request-graph traversal

A GH11 path-detail hook now records actual QueryGraph edges/nodes, original directed
keys and node coordinates for each response. The bridge requires complete matching
geometry/edge coverage and connected node identities on every candidate and cache
hit. Interior endpoints, reverse travel, virtual via splits and a nearby parallel
road are covered by generated fixtures; transport/cache corruption refuses. Query
IDs are explicitly request-scoped. This is calculated-route evidence, not physical
approach direction or general turn/legal proof. See QUERY_GRAPH_EVIDENCE.md. The
four full UK acceptance rows remain open and navigation stays disabled.

## Subsequent Milestone 3 checkpoint: request-origin/accepted-fix binding

The explicit browser journey bridge now compares each request's registered start
with the current accepted fix before any policy/routing HTTP work. Opaque tokens
retain owner/journey/fix freshness and late-result guards. Matching-origin unit
and actual-browser restore races still execute, while mismatched Calculate,
Restore, reroute and legacy/unknown-origin paths refuse without network work.
Saved data/settings remain retained. This is coordinate binding at the browser
boundary, not server GPS attestation, physical road/heading proof or arbitrary
live-origin routing. See REQUEST_ORIGIN_BINDING.md. The four full UK acceptance
rows remain open, navigation stays disabled and no deployment is included.

## Supporting Milestone 4 research: imported origin ambiguity observations

An opt-in native diagnostic observes nearby encoded car traversals independently
of hazard exclusions or the selected route. Synthetic parallel, reverse, one-way,
junction, empty and truncated-scan cases preserve uncertainty/refusal flags. No
candidate count grants a physical road/heading claim, and partial scans cannot
claim uniqueness. The bounded graph-wide scan is diagnostic-only, not a scalable
UK/US live locator; HTTP clients cannot enable it and normal requests do not scan.
See ORIGIN_AMBIGUITY_DIAGNOSTIC.md. General live-origin association and all four
full UK acceptance streams remain open; navigation is disabled and no deployment
is included.

## Supporting Milestone 4 research: indexed candidate retrieval

An opt-in native index mode retrieves stored edge candidates without avoidance
filtering and applies the full-scan oracle's geometry test. Differential synthetic
checks include confirmed tile borders, long/diagonal edges and translated UK/US
latitudes. Faults, duplicated callbacks, unsupported regions and budgets preserve
refusal/uncertainty. Query completion is explicitly separate from index coverage;
a silently empty index cannot claim absence or uniqueness. This is a diagnostic
lookup prototype, not measured real-graph scalability or live-origin authority.
See INDEXED_ORIGIN_LOOKUP.md. All four full UK acceptance streams remain open,
navigation stays disabled and no deployment is included.

## Supporting Milestone 4 research: manifest-bound index inventory

An explicit offline audit reconciles base-graph and stored-index edge IDs, recording
manifest/config/engine/code/runtime identities and pre/post artifact checks. Missing
IDs, execution limits, malformed evidence and changed inputs refuse or remain
unverified. A matched-but-spatially-wrong index control prevents inventory equality
from becoming geometry coverage or guidance authority. No normal HTTP request can
enable audit mode, and no VPS run is included. See INDEX_INVENTORY_EVIDENCE.md.
Construction lineage, real-graph spatial coverage/performance and all four full UK
acceptance streams remain open; navigation stays disabled and migration is NO-GO.

## Supporting Milestone 4 research: finite geometry differential audit

A manifest-bound offline audit selects deterministic graph geometry vertices and
segment midpoints, comparing full-scan and indexed directed-car candidates. The
matched-global-inventory/spatially-empty negative control now produces observed
mismatches. Sampling/scan/query limits preserve unknown verdicts; even all probes
matching never establishes exhaustive spatial coverage or construction lineage.
See INDEX_GEOMETRY_EVIDENCE.md for the implemented scope and required reproducible
construction experiment. No real-graph/VPS run is included; all four UK acceptance
streams remain open, navigation is disabled and migration remains NO-GO.

## Supporting Milestone 4 research: observed fixed-fixture import provenance

An operator-only harness now performs two clean imports of its embedded synthetic
fixture using the pinned GH11.1 engine and hash-recorded car model. It records
actual process outcomes, input/runtime/code/log bindings and complete graph-file
manifests, rechecks earlier outputs and reports byte differences without ignoring
metadata. Failures/limits/tampering refuse or retain false observation flags. This
is not trusted attestation, general reproducibility or routing/legal/coverage
proof. See IMPORT_PROVENANCE.md. Binding read-only load and diagnostic audits to
the observed output remains next; no real-data/VPS import is included. All four UK
acceptance streams remain open, navigation is disabled and migration remains NO-GO.

## Supporting Milestone 4 research: observed graph read-only audit chain

The fixed synthetic two-import observer now feeds a separate artifact-bound
continuation: explicit load-only config mapping, exact observed graph/source/model
and receipt checks, actual read-only native loads, and nested inventory/finite
geometry evidence for both builds. Pre/post changes, mismatched claims and audit
workspace reuse refuse; incomplete probes never become coverage proof. See
OBSERVED_GRAPH_AUDITS.md. This closes only the synthetic construction-to-diagnostic
binding checkpoint. Exhaustive geometry coverage, real artifacts/scale and all four
UK acceptance streams remain open; navigation stays disabled and migration NO-GO.

## Supporting Milestone 4 research: finite segment-and-tile probes

The offline geometry selector now preserves segment endpoints/original midpoints
and adds loaded-grid crossings and cell-interval midpoints. A metadata-derived
spatial-hole control passes global inventory and former probes but is detected by
the stronger strategy. Counts/limits/unsupported grids preserve unknown results;
even complete selection is finite sampling, not exhaustive cell-membership proof.
See SEGMENT_TILE_PROBES.md. The observed-import read-only chain retains its exact
bindings. Real coverage/scale, independent leaf membership and all four UK journey
acceptance streams remain open; navigation is disabled and migration remains NO-GO.

## Supporting Milestone 4 research: stored strict-interior membership diagnostic

A bounded independent Python decoder now reads pinned GH11.1 MMAP leaf memberships
without query deduplication, and a separate rational clipping oracle checks necessary
strict-interior cell memberships. Missing/wrong-cell controls preserve all global
IDs yet are detected; malformed trees/budgets refuse and boundary-only cases remain
unknown. Actual synthetic files and manifest/code/graph bindings are checked. See
STORED_INDEX_MEMBERSHIP.md. Layout metadata, boundary/numeric semantics, construction
integration, real artifacts/scale and all four UK acceptance streams remain open;
no full coverage/route/legal claim is added, navigation is disabled and migration NO_GO.
