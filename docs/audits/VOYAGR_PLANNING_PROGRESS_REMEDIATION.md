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

The probe observes requestCurrent, stage, publish, verify, removePrevious, restore, cleanup and present. It returns the original values/Promises and rethrows the original exception objects. Map readiness is recorded only when the original stage actually calls the observed map's isStyleLoaded method; the wrapper restores that method on stage exit. An unavailable/different global map binding yields no style-check record, never an inferred false/true. Revalidation and inspection are observed only during the synchronous initial coordinator call. Other private persistence phases are not separately instrumented.

Output is bounded to two attempts, 96 enum/timing events per attempt, boolean entry intent/transaction state, result kinds and allowlisted warning/error classes. No route IDs, coordinates, payloads, raw error/status strings, auth data or browser-storage values are exported. No extra routing request, storage operation or safety check is performed. Diagnostic method wrappers are temporary laboratory instrumentation, not a production correction. Promise rejection observers can suppress native unhandled-rejection notifications for observed promises; rejected operation events are recorded independently. Dispose restores owned method wrappers without overwriting subsequent third-party replacements.

Interpretation: a stage `style_check_returned:false` followed by stage `threw:map_not_ready` establishes that particular attempt's staging refusal. A final ready map does not undo that evidence. False verify or an exception in another named operation identifies a different cause. No operation events plus false entry intent/pending-owner flags indicates an early refusal. Accepted revalidation/inspection but no stage plus a critical-check warning indicates an earlier coordinator policy gate; confirm the complete bounded sequence rather than inferring from HTTP success.

## Release and acceptance gates

No Contabo/Cloudflare access, production operations, user-data changes, storage clearing, merge or deployment occurred. The already working Nginx correction is not reapplied. This patch does not clear PR #381 or solve every cache/update issue. Before any separately authorized rollout, independently review this exact code and CI, verify the actually loaded changed module, collect the bounded commit-failure trace and perform required browser/device acceptance. Do not force active journeys to reload. Production navigation remains NO-GO pending its separate acceptance requirements.

## Independent-review P2 remediation

Reviewed starting point: HEAD `b2ea7f85e484f4cfaeb3b340e1e872d8ca61d39b`, tree `a96e168da45d7ff87cf5bc470c6a3a4a7f755d7b`. Both findings were reproduced before editing. This follow-up updates the existing PR #383 branch only.

### P2: older commit rejection retired newer progress

The inner idle-preview error catch hid progress and showed its error before the outer owned finally. An older commit rejection could therefore clear a newer pending request's indicator despite the correct finally guard. The independent ownership assertion failed against the reviewed head.

All calculation-internal progress retirement now occurs in the existing ticket-owned finally. Removed early hides from legacy reroute, idle presentation/error, HTTP error and cancellation helpers; those synchronous helpers remain inside the awaited calculation pipeline. A closure over the actual request ticket/settings/intent guards late preview-error presentation as well. It does not change commit-false handling or any journey state. `return await`, timer disposal and the newer-request ownership check remain intact. The public manual hide API remains available but is not invoked by calculation helpers.

Eight added real-ticket orchestration cases cover A's rejected/false commit while B remains pending, and B success/failure followed by A rejection/false settlement. Existing tests cover both fetch orders, stale callbacks, geocoding/preflight exits, renderer exceptions and timers. The exact independent failing assertion now passes. A stale rejection cannot replace B's status or route/options either.

The changed script label advances to `20261101progresssettlement2`. This is a new URL label, not content-addressed coherence; legacy worker/CDN limitations and PR #381 remain separate. No worker or production cache configuration changes are made.

### P2: observer interference / property restoration

Assignment-based instrumentation created an own property over MapLibre's inherited method and restored only its value, leaving a permanent shadow. An unguarded read of a global map accessor could also throw before stage ran. The original Node/JSDOM and Chromium reproductions confirmed these states before remediation.

Instrumentation now locates data methods through descriptors, without invoking method accessors. It preserves exact own descriptors, removes temporary own properties for inherited methods, and skips read-only/non-configurable/accessor/non-extensible or unsupported proxy-backed hooks. Setup/restoration errors do not preempt the original operation. If the root commit hook is unsupported, report.available is false and the original calculation remains callable; attachment does not fabricate an observed result. Restoration checks the installed value and descriptor so it does not overwrite unrelated replacements or descriptor changes.

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
