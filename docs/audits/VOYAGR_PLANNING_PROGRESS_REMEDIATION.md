# Planning commit failure and progress cleanup

## Confirmed cause / unresolved cause

The owner supplied a live attempt with HTTP 200, fulfilled JSON, accepted candidate, commitPlanning=false, fulfilled calculation, finished ticket, visible progress after 31 seconds, and no route/preview publication or stale guard. This confirms a settled-failure progress-cleanup defect. It does **not** identify why the planning commit failed. Map style readiness in the final snapshot is not evidence of readiness at staging.

In the production reference f36e8e947156e7ac322b88b9516b073533a2f95f, calculate-route-orchestration awaits commitPlanning but its fetch-chain finally only finishes the integrity ticket. journey-modes catches planning failures, performs owned recovery and returns false. That resolved value does not run the outer error handler, so the indicator remains visible.

commitPlanning can return false before invoking operations (pending transaction or stale intent), during revalidation/inspection, under existing-journey replacement checks, on continuation/persistence failure, or after stage/publish/verify/removePrevious failure. Its catch can call restore/rollback/cleanup, and finally can discard staging. Presentation exceptions are caught after a successful commit and return true; they cannot alone explain this reported false commit. No live operation-level trace was supplied. **The live commit failure cause remains UNVERIFIED.**

## Correction and scope

The ticket-owning calculation phase is enclosed in try/finally, including preflight and geocoding exits. `return await` keeps the owning calculation pending until its actual fetch/JSON/commit pipeline settles. Finally hides progress only when integrity.isLatest(ticket), then always finishes that ticket in a nested finally, including when the renderer throws. Older requests cannot clear a newer ticket's indicator. A pending JSON parse or commit is not timed out or hidden by this change.

The outer scope also handles a newer preflight/geocoding exit after superseding an older request, and synchronous request-plan/fetch setup failures after the indicator is shown, which the former promise-chain-only finally did not cover. Existing cancellation guards, warning/error handling, planning result and thrown setup errors retain their meanings. A failed map or transaction still fails; cleanup never publishes, accepts or authorizes a route.

The template query label changes only for calculate-route-orchestration.js to identify its changed source on subsequent ordinary page loads. No forced reload, worker migration, cache clearing or asset-coherence architecture is introduced. Existing v51 fallback/CDN/cache-key limitations remain: the new label is not proof that a particular browser executed the new bytes. PR #381 and its independent-review findings remain separate.

Changed runtime files: calculate-route-orchestration.js and its single HTML script URL. No changes to candidate validation, mandatory avoidance, two-metre endpoint checks, geometry binding, freshness, connectivity evidence, navigation refusal, durable ownership/CAS, continuation or simulation/live separation. The diagnostic is manual-only, never imported by HTML, and does not modify those policies.

## Deterministic evidence

The settlement suite runs real request tickets, request/calculation planning, corrected assessment code and journey coordinator with network/map/terminal-UI doubles. Endpoint protocol bootstrapping is outside this test's scope. The actual historical Sheffield–Doncaster fixture is replayed with a UNIT-TEST clock fixed near its original assessment; this is not a new live response or production-clock adjustment.

The original 15-case settlement suite fails six cases against unmodified main's orchestrator and passes all 15 with the correction. Added regressions cover settings invalidation and guaranteed timer disposal when progress rendering throws. Twenty-one settlement tests cover overlap in both orders, late success/rejection, pending JSON/commit, false commits, malformed JSON, candidate rejection, setup failures, presentation errors, previous-journey retention, cancelled delayed preview and all five independently refused alternatives. No planning success starts navigation.

Ten diagnostic tests run the real coordinator to identify the exact stage-time false style check (even if style becomes ready later), publish/removePrevious exceptions, false verify, caught presentation exceptions, early stale intent, expired candidate, false requestCurrent, exact Promise identity and restoration. A separate local system-Chromium check confirms that the probe observes the main-world lexical map binding's actual isStyleLoaded call. The map/network fixture remains synthetic, not a real MapLibre/device or VPS 2 acceptance test.

Full local frontend, declared backend selection and isolated SQL policy results and exact-head hosted CI are recorded in the PR. Independent review is required before any later merge; this task authorizes neither merge nor deployment.

## Bounded follow-up laboratory probe

Use `scripts/browser/planning-commit-diagnostic.cjs` in the existing isolated Playwright laboratory after application initialization and before the existing Calculate click. Do not run other method-wrapping probes concurrently. Do not forward whole console output, enable HAR/tracing, print payloads, or use a real user's profile. No new connection to VPS 2 is made by this PR.

```javascript
const {attach}=require('/laboratory/path/planning-commit-diagnostic.cjs');
const probe=await attach(page);
try {
  // Run the existing Calculate click and await its existing result observation.
  console.log(JSON.stringify(await probe.report(),null,2));
} finally {
  await probe.dispose();
}
```

The probe observes supported own-data requestCurrent, stage, publish, verify, removePrevious, restore, cleanup and present methods. It returns original values/Promises and rethrows original exceptions. Inherited methods are now deliberately left untouched: normal MapLibre prototype readiness calls are unavailable to this probe, not inferred false/true. Existing writable own-data readiness methods can still be observed during the actual stage call and restored exactly. Do not create own aliases merely to enable a measurement; that would change the dispatch being diagnosed. An unavailable/different global map binding also yields no readiness result. Revalidation and inspection are observed only during the synchronous initial coordinator call. Other private persistence phases are not separately instrumented.

Output is bounded to two attempts, 96 enum/timing events per attempt, boolean entry intent/transaction state, result kinds and allowlisted warning/error classes. No route IDs, coordinates, payloads, raw error/status strings, auth data or browser-storage values are exported. No extra routing request, storage operation or safety check is performed. Diagnostic method wrappers are temporary laboratory instrumentation, not a production correction. Promise rejection observers can suppress native unhandled-rejection notifications for observed promises; rejected operation events are recorded independently. Dispose restores owned method wrappers without overwriting subsequent third-party replacements.

Interpretation: a stage `style_check_returned:false` followed by stage `threw:map_not_ready` establishes that particular attempt's staging refusal. A final ready map does not undo that evidence. False verify or an exception in another named operation identifies a different cause. No operation events plus false entry intent/pending-owner flags indicates an early refusal. Accepted revalidation/inspection but no stage plus a critical-check warning indicates an earlier coordinator policy gate; confirm the complete bounded sequence rather than inferring from HTTP success.

## Release and acceptance gates

No Contabo/Cloudflare access, production operations, user-data changes, storage clearing, merge or deployment occurred. The already working Nginx correction is not reapplied. This patch does not clear PR #381 or solve every cache/update issue. Before any separately authorized rollout, independently review this exact code and CI, verify the actually loaded changed module, collect the bounded commit-failure trace and perform required browser/device acceptance. Do not force active journeys to reload. Production navigation remains NO-GO pending its separate acceptance requirements.

## First independent-review P2 remediation (historical)

Reviewed starting point: HEAD `b2ea7f85e484f4cfaeb3b340e1e872d8ca61d39b`, tree `a96e168da45d7ff87cf5bc470c6a3a4a7f755d7b`. Both findings were reproduced before editing. This follow-up updates the existing PR #383 branch only.

### P2: older commit rejection retired newer progress

The inner idle-preview error catch hid progress and showed its error before the outer owned finally. An older commit rejection could therefore clear a newer pending request's indicator despite the correct finally guard. The independent ownership assertion failed against the reviewed head.

All calculation-internal progress retirement now occurs in the existing ticket-owned finally. Removed early hides from legacy reroute, idle presentation/error, HTTP error and cancellation helpers; those synchronous helpers remain inside the awaited calculation pipeline. A closure over the actual request ticket/settings/intent guards late preview-error presentation as well. It does not change commit-false handling or any journey state. `return await`, timer disposal and the newer-request ownership check remain intact. The public manual hide API remains available but is not invoked by calculation helpers.

Eight added real-ticket orchestration cases cover A's rejected/false commit while B remains pending, and B success/failure followed by A rejection/false settlement. Existing tests cover both fetch orders, stale callbacks, geocoding/preflight exits, renderer exceptions and timers. The exact independent failing assertion now passes. A stale rejection cannot replace B's status or route/options either.

The changed script label advances to `20261101progresssettlement2`. This is a new URL label, not content-addressed coherence; legacy worker/CDN limitations and PR #381 remain separate. No worker or production cache configuration changes are made.

### P2: observer interference / property restoration

Assignment-based instrumentation created an own property over MapLibre's inherited method and restored only its value, leaving a permanent shadow. An unguarded read of a global map accessor could also throw before stage ran. The original Node/JSDOM and Chromium reproductions confirmed these states before remediation.

The first remediation at 2ef0502c located data methods through descriptors and removed temporary inherited shadows after staging. The second remediation below supersedes that inherited-hook design; only eligible own-data slots are now patched, so no inherited shadow is created at all. Accessor/locked/unsupported hooks remain skipped. Setup/restoration errors do not preempt the original operation. If the root commit hook is unsupported, report.available is false and the original calculation remains callable; attachment does not fabricate an observed result. Restoration checks the installed value and descriptor so it does not overwrite unrelated replacements or descriptor changes.

A throwing global map accessor is not invoked; map observation becomes unavailable and stage still executes. Actual style values are recorded only when the original stage calls the successfully observed method. Promise results, ordinary return values, receiver, arguments and original exception identity are retained. Native-Promise brand checks avoid reading arbitrary returned-object `then` getters. Private errors/status text still map only to fixed enums. This is trusted-laboratory instrumentation, not a sandbox for arbitrary malicious Proxy traps; denied/throwing traps are handled as unavailable observations. No route, raw exception, credentials or storage values are emitted.

### Before/after evidence and reproducible checks

- Original independent late-commit-rejection assertion: **failed before; passed after**.
- Original actual-MapLibre instance: own method absent before observation, incorrectly present after old probe disposal; corrected probe restores the exact original descriptor/inheritance.
- Throwing global-map getter: old probe prevented stage execution; corrected probe skips the accessor and executes stage once.
- Same real-Chromium property matrix against the exact reviewed diagnostic source: **8 passed / 11 failed**; against the corrected diagnostic: **19 passed / zero failed**. This matrix checks the stronger descriptor/unsupported-observation requirements as well as the original defects; eleven failures are not claimed to be eleven separate production defects.
- Full local validation: **118 JavaScript suites / 2,630 tests**, lint and coverage passed; declared backend **1,658 passed, one Windows-only skip, 68 subtests passed**; isolated SQL policy **11 passed**. Focused suites: **58 passed**.

The shared 19-case matrix includes inherited and own methods, global/method accessors, locked/read-only properties, non-extensibility, throwing/transparent proxies, original throws/Promise fulfillment/false, repeated attach/dispose, unrelated replacements, frozen operations/modules, and a throwing `then` accessor. It checks exact descriptors, original execution count, receiver/arguments, return/Promise/exception identity and bounded private-data exclusion. Jest uses a class double for property semantics. The separate Chromium runner always loads the actual bundled MapLibre prototype; its map/style fixture does not initialize WebGL/GPS or call a routing provider.

Run the browser matrix locally, outside a production profile:

```sh
CHROMIUM_BINARY=/path/to/chromium node scripts/browser/test-planning-commit-diagnostic.cjs
```

For the baseline comparison, extract `scripts/browser/planning-commit-diagnostic.cjs` from reviewed commit b2ea7f85e484f4cfaeb3b340e1e872d8ca61d39b into a separate scratch file, then run the same command with `PLANNING_PROBE_SOURCE=/absolute/scratch/before.cjs`. The runner reports the tested source SHA-256, case names and bounded assertions only. It serves loopback fixture HTML, uses disposable contexts, performs no user-storage operations and never attaches to a production browser. Launch errors are reported as test infrastructure failure; no cases are silently skipped.

These real-Chromium results are **local synthetic laboratory tests**, not VPS 2/live-browser acceptance. The default hosted CI runs the new property regressions through Jest; the standalone real-Chromium matrix is run separately where Chromium is available. Exact-head hosted results are recorded in the PR after push. Independent re-review remains required. The reason for the original live commitPlanning=false remains **UNVERIFIED**; neither finding permits guessing map readiness, relaxing navigation safety or authorizing merge/deployment.

## Second P2 remediation: dispatch and missing capabilities

Starting reviewed source: `2ef0502c2cffe6fdb986b9ef5247b176b95ec665`, tree `b14538014fd7972790c1d95f081c99ab0ffa060f`. Both new failures were reproduced against that source before editing. Main remains 96f6fb97156015883a2630b939a99f97a04a7693; this work updates only existing PR #383.

### Dynamic dispatch: do not shadow inherited methods

The first descriptor fix restored inheritance correctly after staging but still created a temporary own wrapper that captured the former inherited implementation. Replacing the prototype during staging was therefore masked until disposal: uninstrumented stage returned false, instrumented stage returned true.

The diagnostic now **skips all inherited method slots**. This is the explicit unavailable-observation option, not an attempt to guess future prototype changes. Own shadows cannot preserve all inherited lookup semantics, particularly getters, non-callable replacements and saved function references. No prototype or inherited instance slot is changed by the probe. Inherited readiness is labelled unavailable; no style result is fabricated. Ordinary MapLibre instances normally inherit isStyleLoaded, so exact readiness is intentionally unavailable under this probe. Use the remaining operation/currency trace, and separately approved native debugging if a precise inherited style call must still be measured. Do not confuse warning classes or final snapshots with that missing measurement.

Existing eligible **own** data methods remain observable. An own method naturally retains precedence over prototype changes; replacing/deleting that own slot replaces/removes the hook as normal. Exact descriptors and unrelated replacements remain protected. Receiver, arguments, returned objects/Promises, exceptions and prototype state are preserved. Original staging always runs regardless of observation availability. The native rejection-notification and trusted-laboratory/unsupported-Proxy limits documented above remain; this tool is not a JavaScript sandbox or a source-identity verifier.

The new A/B dispatch matrix uses actual bundled MapLibre in Chromium and compares identical stage execution without/with the probe. It covers prototype function/accessor/throwing-accessor/non-callable replacements, saved method references, prototype-chain replacement, replacement Promises and own-method precedence. Both operation outcomes and exact post-observation state are checked. Own-data hooks also demonstrate that supported readiness observations still occur. The Node/Jest version uses a class double for language/property semantics; it is not represented as a real MapLibre/device test.

### Missing-capability policy

Integrity is mandatory for every calculation: it issues the owner ticket and supplies cancellation/currency, result validation and navigation gates. Missing, incomplete or inaccessible required integrity methods now cause a fixed warning **before** beforePlanning, token/ticket creation, geocoding, progress display or fetch. No unowned request is started. An earlier pending owner's signal, progress and journey are not retired by that failed new attempt. No reload, storage reset, cancellation or fallback navigation permission is performed.

Existing journey-module-free calculation/inspection compatibility is retained **only with complete integrity**. Evidence is the explicit legacy orchestration branches and the existing Phase 5 fetch/cancellation regression. The main public startNavigation function already refuses new navigation without journey controls. Existing previously authorized legacy rerouting remains subject to its unchanged integrity gate. The new guard does not create any navigation authority. If journey modes are present, their required methods and journey-plan requestContext/inspection capabilities must be callable; malformed current-mode graphs fail closed before mutation. A present unusable request-context module is also refused. A function-presence check is not proof of source identity or permission: original validation gates still run.

Tests cover absent/incomplete integrity, inaccessible getters, missing current-mode/plan capabilities, old-request retention under a failed new attempt, API/JSON/setup failures, both overlap orders in legacy inspection with real integrity tickets, and a successful legacy preview retaining refusal for all five alternatives. The missing-integrity regression is fixed by **not sending the unsupported request**, rather than hiding an indicator without an owner.

### Before/after and remaining gates

- Original late-commit-rejection ownership reproduction: still passes.
- Original inherited-restoration and throwing-accessor scenarios: still pass; no inherited hook is now created.
- New independent Chromium prototype-replacement assertion: failed on reviewed source (false without / true with probe); passes now (false / false).
- New independent missing-integrity regression: reviewed source made one request and stranded progress; corrected source makes zero requests, creates no progress and publishes no route. Original assertion now passes.
- Earlier commit-false, pending work, stale callbacks, overlap/ownership, timer-disposal, previous-journey and navigation-refusal regressions are preserved.

The script URL advances to `20261102progresssettlement3`; no worker or cache policy is changed. The follow-up only changes capability/cleanup UI handling and manual diagnostic instrumentation. Avoidance, 2m endpoints, geometry binding, freshness, connectivity, refusal, durable ownership/rollback and simulation/live policy implementations are untouched.

Final full-suite counts, real-Chromium matrix results, exact new HEAD/tree and hosted CI are recorded in the PR after verification. All browser evidence here is local loopback simulation with a real Chromium engine and real bundled prototype, not production/VPS 2, WebGL/GPS or browser/device acceptance. The actual live commitPlanning=false cause remains **UNVERIFIED**. Independent re-review is required; auto-merge remains disabled and no merge/deployment/Contabo/Cloudflare/user-storage operation is authorized or performed.

Second-round local validation completed: **7 focused suites / 203 passed** (including active-journey, continuation and preview-ownership suites); **118 full JavaScript suites / 2,654 passed**, coverage and lint passed; declared backend selection **1,658 passed, one skipped, 68 subtests passed**; isolated SQL **11 passed**. The same 27-case Chromium matrix returns **19 passed / 8 failed** on reviewed source 2ef0502c and **27 passed / zero failed** on corrected source. One reviewed-source failure checks the newly explicit unavailable-inherited-observation contract; the other seven expose changed dynamic dispatch. These are regression cases, not eight separate live defects. Original counterexamples and prior accepted ownership/descriptor reproductions were also rerun successfully after correction. Hosted exact-head evidence is recorded separately in the PR; it does not stand in for live acceptance.
