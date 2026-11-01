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
