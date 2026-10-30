# Phase 12F-D — M1/M2 map resource ownership

**PRODUCTION_NO_GO.** Ready for independent review; this is implementation validation, not independent merge or production acceptance.

## Verified starting point

Existing PR #375 branch `codex/phase12fd-navigation-coherence` was clean and its remote PR head exactly `84c056e71007514fa0d56e0fa59c1cdd62cccbb8` before editing. Its parent is `9fa0c67bf82752f47b75a09454c32529473d3539`, whose parent is `d5152b29048c8b7ce30dae71a0ca8fdad7710d47`. The remote head was checked again before committing. No baseline substitution, rebase, merge, deployment or VPS work.

## Root causes and design

**M1:** Removing current map resources and deleting a registry entry did not revoke the authority of previously queued style/load/timer callbacks. Reconciliation called the low-level resource remover, bypassing the pending handle's cancellation flag. Traffic lines are owned by the traffic subsystem rather than the comparison list, so comparison cleanup could not cancel those callbacks.

The production MapLibre helper now assigns deferred mounts a per-map generation and a specific registered handle. A callback requires the same current generation, the same registered owner and a non-revoked handle immediately before mutation. It checks again before source, outline and main-layer writes and reconciles any reentrant invalidation during renderer calls. Timer/listener cancellation is best effort only; queued callbacks still fail ownership checks.

Reconciliation and verified navigation start/replacement revoke old deferred generations. Formerly pending lines that already mounted are removed too. Direct low-level removal also revokes pending ownership. Different maps have separate generation counters. Current-generation deferred mounts remain usable and can retry a failed layer creation without mistaking an existing source for a complete line.

If an invalidated callback cannot remove partial resources, its revoked handle remains registered, the existing terminal inconsistent-map mechanism stops guidance, and further transitions cannot report success until cleanup is verified. No new timestamp, safety assessment or native evidence is invented.

Comparison style-load and fallback callbacks have a separate preview generation. Comparison cleanup invalidates that generation; obsolete callbacks cannot initiate a later preview batch. Preview handle ownership/generation is also checked between source and layer writes.

**M2:** Preview handles were registered only after layer creation. An addSource success followed by addLayer failure left untracked sources. Later navigation cleanup enumerated only completed handles and could miss them.

Preview ownership now exists before the first resource mutation, including plans that previously omitted a comparison handle. A failed mount attempts layer/source cleanup separately and verifies the actual resource inventory. Successful cleanup drops the handle; failed cleanup retains it and reports an explicit error. Later navigation startup/transition must reconcile that retained handle, or enter the existing stopped inconsistent-map state. A known failed handle is never silently discarded on a repeated preview.

Clearing previews now removes only owned handles, rather than sweeping resources whose identifiers happen to look like routes. A coincident foreign ID causes a refusal, not deletion. Preview-clear and batch-mount failures propagate back to Show All Routes so its informational message cannot mask a cleanup error. Successful preview and verified navigation workflows remain usable.

## Executed verification

Environment: Node v24.19.0, Python 3.12.14, Jest/jsdom and explicit MapLibre API models with the real production helper, preview, traffic, lifecycle, gate, selection and reroute functions. Production persistence controls and prior F2/F3/resume tests are retained. Backend tests use disposable SQLite and denied outbound sockets. No live routing requests or private captures.

Evidence is outside Git under `/tmp/voyagr-m1-m2`; original independent review evidence is unchanged.

| Check | Result |
| --- | --- |
| Independent 44-case harness on unchanged 84c056e7 | 41 passed, **3 failed expectations**, 0 blocked |
| Original three fault sequences after correction | **3 passed**, 0 failed |
| Entire independent cascading/positive harness after correction | **44 passed**, 0 failed, 0 blocked, including original twelve R4–R8 cases |
| Independent F2/F3/original-seven/lifecycle/resume matrix | **183 passed**, 0 failed, 0 blocked |
| New map-resource ownership / failure-injection suite | **20 passed**, no skips |
| Full lint:tests | Passed |
| Full JavaScript with coverage floors | **106 suites / 2259 tests passed**, no skips |
| Focused Python avoidance/origin/Valhalla safety selection | **174 passed** |
| Configured full backend CI selection | **1611 passed, 1 skipped, 68 subtests passed** |

The backend skip requires actual Windows handles on disposable CI fixtures. Desktop/Kivy/native/live-service tests outside the configured web selection were not run.

The original source-leak sequence now cleans immediately. Its corrected external test asserts that source creation actually ran and that no orphan survives, instead of requiring the old defect's orphan to exist as a precondition. The two deferred sequences execute the formerly queued callbacks after recovery/new startup and assert unchanged source/layer inventories, real current owned geometry and active-state coherence.

The expanded suite covers reconciliation, route replacement, callbacks already queued despite listener-removal failure, multiple generations, valid current callbacks, reentrant invalidation, partial source creation, failed layer creation, failed source/layer removal, retained ownership across failed cleanup, explicit stopped startup failure, successful recovery/recalculation, repeated preview operations, traffic on/off, and foreign-resource preservation. A valid deferred callback retry and complete mounted-navigation controls prevent false acceptance through missing infrastructure.

An intermediate test run had two fixture failures because injected removal errors stopped the pre-existing preview cleanup before the intended new source/layer fault. The tests now remove that unrelated old preview before injecting those faults, and assert the intended operations execute. Production safety assertions were not weakened.

Existing two-metre origin/destination boundary controls remain passing (1.999 m allowed, 2.001 m refused). Mandatory avoidance, strict synchronous verifier permission, F2/F3, R1–R8, geometry binding and IndexedDB resume protections retain their regression assertions. Routing/provider requests, camera logic, backend safety policy and native correlation rules are unchanged.

## Exact changed-file inventory

- `static/js/maplibre-helpers.js`
- `static/js/app/route-comparison-orchestration.js`
- `static/js/app/navigation-lifecycle-orchestration.js` (revoke obsolete deferred ownership after verification, before staging)
- `static/js/app/reroute-map-orchestration.js` (same verified transition contract)
- `templates/index.html` (four modified script query versions)
- `static/js/__tests__/map-resource-ownership.test.js` (new)
- `docs/audits/VOYAGR_PHASE12FD_MAP_RESOURCE_OWNERSHIP.md` (new)

## Remaining failure modes and readiness

Persistent renderer/API removal failures can leave resources present. They remain owned; guidance must stay stopped or replacement must refuse until verified recovery. The implementation does not claim a broken renderer can be forced to clean itself. Unknown/foreign colliding IDs are preserved and may require their owner to remove them or a map reload.

Generation/ownership behavior is deterministically exercised with production functions and API-modeled timing, not actual WebGL or device races. Real browser style reloads, GPS/background/speech behavior, storage stalls and service-worker mixed-version delivery still require integrated PWA acceptance. Query version changes do not guarantee atomic script delivery. No private recorded fixture 0 captures were supplied or executed.

A further independent review should challenge revoked callbacks, reentrant invalidation, partial preview resources, repeated cleanup failures and successful navigation on the final commit. No automatic merge or deployment is authorised. **PRODUCTION_NO_GO.**
