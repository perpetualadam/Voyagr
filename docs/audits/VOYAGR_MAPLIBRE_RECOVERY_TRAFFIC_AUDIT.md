# PWA MapLibre recovery and traffic rendering audit

Date: 2026-10-27. Baseline main `17e6f3ed` (GraphHopper diagnostics PR #347 merged). No Contabo access/deployment, service restart, production configuration changes or live browser/paid traffic requests. This is a software/event-replay audit, not physical-device rendering acceptance.

## Findings traced in actual code

| Implementation | Finding / action |
|---|---|
| `voyagr-core.js` | Focus/visibility/network recovery unconditionally called setTiles/setUrl across tile sources after 250 ms. Its 650 ms recovery gate and separate 1.5 s source gate admitted repeated cycles. Repeated resizes queued independent RAF pairs. Verification/escalation lacked a style/operation identity guard; soft reload restored an old camera snapshot. Fixed those paths. |
| `app/traffic-orchestration.js` | Every display caller independently fetched route traffic, then used the current polyline after awaiting a response for an older one. Disabling the overlay did not invalidate pending rendering. Result logging declared segment count displayed regardless of rendering success. Fixed display request lifecycle and mount-status logs. |
| `app/route-preview-orchestration.js` | Post-preview sets preview polyline and calls traffic display. This is a legitimate consumer and retains its behavior; identical work is coalesced at the shared display owner. |
| `app/route-comparison-orchestration.js` | Route mount and selection can also request display. Different geometry must still get different traffic; selection/integrity gates unchanged. No removal of legitimate calls or navigation logic. |
| `app/page-init-orchestration.js` | Every resize logged and dispatched a map resize independently. Now one scheduled viewport pass per animation frame. |
| `app/map-layers-orchestration.js` + `modules/map/map-layer-toggles.js` | Existing traffic source/layer presence checks already avoid adding them again; no setTiles in this owner. Pending style-load mount guard remains. No source/layer replacement added. |
| `app/service-worker-orchestration.js` + `service-worker.js` | Service-worker update has in-flight/backoff guards; controller updates defer during navigation. This is separate from core map recovery. Private dashcam and road-context/match network-only restrictions remain untouched. No worker/cache-policy rewrite justified. |

## Reproduction before behavior changes

Initial targeted regression run against baseline: **8 failed, 1 passed** across nine cases, reproducing forced healthy-source resets, lack of source scoping, queued style work, redundant resize calls, duplicate traffic requests, false displayed status and off-toggle rendering. One initial stale-route case used disjoint geometries, so draw-plan rejection masked the race. A stronger case uses overlapping old/new routes where stale segments remain drawable.

After adding that overlapping-route case and further controls, replayed the original core/traffic/page modules from read-only `git show 17e6f3ed:<path>` snapshots against all 16 final cases: **15 failed, 1 passed**. The existing control that unexpected/expired aborts remain visible passed on baseline. A subsequent rapid off/on control verifies a fresh request can replace the invalidated pending promise. Temporary baseline test copies were removed; production source was never rolled back. Tests exercise actual function bodies/handlers and real plan helpers with mocked MapLibre/HTTP/browser boundaries, not duplicate implementations of the policy. Core declarations are selected with the Babel parser so the large map bootstrap need not contact tile servers.

## Before / after controlled counts

These counts describe fixed fake-clock inputs, not observed production network throughput. setTiles calls can trigger many tile requests; do not equate one call with one HTTP request.

| Replay input / observation | Before | After |
|---|---:|---:|
| Three healthy focus/visible/network recovery calls, 800 ms apart | 3 recovery cycles | 1 cycle |
| Same burst, three inline tile sources | 2 resets per source, **6 setTiles calls total** | **0** |
| One traffic-source HTTP failure followed by recovery | All 3 tile sources reset | Only failed traffic source reset once |
| Confirmed stuck-source retry, one source unloaded | All 3 sources reset | Only unloaded source reset |
| Style replacement before queued recovery | Old recovery still reset sources | 0 stale source resets |
| Soft style reload followed by user camera movement | Old snapshot jumpTo restored | No snapshot jumpTo |
| 20 direct core resize requests in one burst | 20 resize calls | 1 |
| 20 viewport resize events | 20 resize dispatches and log messages | 1 each |
| Three simultaneous identical preview/selection/display requests | 3 HTTP requests | 1 HTTP request and 1 overlay mount |
| Identical completed display request repeated within 1 s | Another HTTP request | Reused display; later refresh still requests |
| Late old-route result, overlapping geometry, newer route already rendered | Stale result mounted | 0 stale mounts |
| Pending response after overlay disabled | Overlay mounted | 0 mounts |
| Pending response after style generation changed | Overlay mounted | 0 stale mounts |
| Nine all-green returned segments | “Cannot display” then “Displayed 9 traffic segments”; 0 congestion overlays | Honest “Mounted 0 congested traffic overlays”; 0 congestion overlays |
| Malformed/unmatched segment set after valid congestion overlay | Existing overlay cleared before discovering no draw plans | Valid display retained |

The nine-green case reproduces the reported contradictory-log pattern. It does not prove the deployed nine segments were all green: their actual levels/geometry and style readiness were not captured. Empty/unavailable upstream responses retain existing behavior and do not claim clear traffic.

## Small fixes and safeguards

Core recovery coalesces accepted events over five seconds; an accepted newer cycle cancels old source/verify/escalation timers. All callbacks check operation generation, map identity and serialized style identity. Style-load invalidation runs before overlay reinitialization and clears obsolete failure/cancellation state. Healthy focus/connectivity events only resize/repaint and redraw current navigation overlays; they no longer jump the camera or flush tile caches.

Real tile-source errors are tracked by source ID. Initial recovery retries only those vector/raster/raster-dem sources. Existing delayed settled-camera verification and confirmed long-stuck heartbeat may additionally retry sources that MapLibre reports unloaded. GeoJSON route/camera sources are excluded, healthy traffic/basemap sources are untouched and no source is removed/replaced. Existing slow-network, movement, heartbeat, escalation limits and bootstrap guards remain. A genuine long-lived broken style may still use the existing bounded soft setStyle path; no stale pre-reload camera snapshot is restored. This is not a blanket removal of recovery.

Only `error.name === 'AbortError'` from the **same source object** within two seconds after this code deliberately calls its setTiles/setUrl is classified as an expected cancellation and sent to console.debug. Unknown, expired, unrelated aborts and ordinary HTTP/network errors continue through the existing warning/diagnostic handler. Expected cancellations do not consume its error counter and cannot trigger traffic HTTP backoff; genuine 429/5xx handling remains. Existing genuine-error throttling is unchanged, not replaced with a blanket AbortError filter. A cancellation with no identifiable source is not confidently classified.

Traffic display snapshots geometry before fetch and uses one pending promise for identical map/geometry/style requests. A successful render suppresses identical repeated work for only one second; periodic/manual updates after that remain available. New geometry, a newer display operation, map/style replacement or disabling the overlay invalidates obsolete results. An old request is ignored rather than forcibly cancelled: the shared raw traffic sampler, upstream backoff and ahead-of-driver ETA/reroute consumers remain unchanged. Coalescing does not reuse route assessments or modify navigation/routing state. No geographic request key is logged or persisted.

Mounted overlay counts come from actual helper returns rather than response segment counts. All-green results clear obsolete congestion edges and report zero; non-drawable/unmatched results retain valid existing edges. Route/camera layer ordering and existing overlay reorder helpers remain. This verifies helper-level mount outcomes, not pixels on a real GPU.

Changed asset URL versions for the three modified runtime scripts in `templates/index.html` ensure a new page requests the changed code. Service-worker activation, authentication, dashcam, GPS, mandatory avoidance and routing behavior are not changed. Existing tabs still require the usual approved update lifecycle; nothing deployed here.

## Validation

Reproduce final selected tests:

```bash
npx jest --runInBand --no-coverage map-recovery-orchestration traffic-orchestration-recovery page-resize-recovery map-recovery route-traffic-flow service-worker-orchestration map-layer-toggles
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

Focused selection: **78 passed**. Final full Jest: **97 suites /1,918 tests passed**, no failures/skips, test lint and configured coverage thresholds passed. Python backend CI file selection: **763 passed +68 subtests**, no selected failures/skips. Isolated temporary PostgreSQL session-policy tests: **11 passed**; no production DSN. `git diff --check` passed. Full desktop/Kivy/native/live-service suites remain outside this PWA task and unrun. Hosted CI/PR results are reported after publication.

## Remaining acceptance / operator checks

The production event ordering, actual MapLibre worker AbortError timing, radio handoff, browser suspension, GPU/context loss, traffic source data, zoom/pan and mobile visual outcomes remain unverified. Source-reload attribution is deliberately narrow and time-bounded; it is evidence of expected cancellation, not proof every abort in that window was initiated by the reload. A render failure with no MapLibre error and no unloaded-source signal cannot be proven or repaired by these mocked tests.

After a separately approved deployment, while stationary or using a passenger: observe one normal focus/visibility/radio-change burst; record recovery cycles, source setter calls, network request counts and map errors over a bounded interval. Confirm style, camera markers, selected route, raster traffic and congestion edges persist; genuinely failed sources recover; unrelated HTTP errors stay visible. Repeat preview/selection of identical and different geometry, overlay disable during a pending request, a slow style replacement, resize/address-bar bursts and WebGL context restoration. All-green flow should report zero congestion overlays, not nine rendered segments. Do not share precise routes, tokens or private recordings in diagnostics. Do not induce failures against production services or interact while driving.

Until those observations are returned, claim the software races/logging/event duplication fixed under tests, not all deployed blank-map or tile-server faults resolved. No automatic Contabo deployment authorised or performed.

## Files changed

- `static/js/voyagr-core.js`
- `static/js/app/traffic-orchestration.js`
- `static/js/app/page-init-orchestration.js`
- `templates/index.html`
- `static/js/__tests__/map-recovery-orchestration.test.js`
- `static/js/__tests__/traffic-orchestration-recovery.test.js`
- `static/js/__tests__/page-resize-recovery.test.js`
- `docs/audits/VOYAGR_MAPLIBRE_RECOVERY_TRAFFIC_AUDIT.md`
