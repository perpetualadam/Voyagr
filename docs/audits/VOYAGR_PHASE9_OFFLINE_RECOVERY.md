# Phase 9 — offline and recovery validation

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

## Executed locally

The existing product regressions passed for supported/legacy schema restore, rejection of unknown versions, selected alternative identity, complete geometry/leg ranges, ordered remaining stops, fresh-GPS-required resume and invalidation of old SATISFIED avoidance to UNVERIFIED. Mandatory automatic navigation remains blocked until current evidence satisfies the gate. Source evidence/private GPS/dashcam endpoints remain network-only/no-store and are not queued/replayed by the actual service-worker tests. Browser mock/IndexedDB boundary tests are software regressions, not physical offline acceptance.

A bounded in-memory restore benchmark uses the actual route-selection and integrity helpers and verifies that stale mandatory claims remain unverified; raw timings are in [offline CPU JSON](VOYAGR_PHASE9_PERFORMANCE_OFFLINE.json). It does not include real IndexedDB, browser shutdown or network transport. No offline algorithm, cache policy or lifecycle behavior changed.

## Physical procedure: NOT_TESTED

On an approved device/test release, plan a complete reviewed multi-stop route while online and stationary. Record selected identity, geometry, remaining stops, assessment/source times and versions. Disable network while stationary and observe supported continuation using available geometry/GPS. Do not assume tiles, new routing, lane/speed authority or automatic rerouting remain available. Background/lock/resume, restore network, and reject any stale delayed response. Repeat after intentionally aged source/assessment and a killed/reopened browser; observe selected identity and stop order retained, fresh GPS required, old mandatory status unresolved and no disconnected progress jump. Test an approved update and storage/cache eviction separately; record limitations.

Use canonical cases `network_loss`, `network_restore`, `browser_background`, `screen_lock`, `browser_resume`, `gps_loss`, `gps_reacquisition`, `service_worker_update` and `stale_offline_route`, preserving their IDs/outcomes. No route continuation on a real disconnected phone has been demonstrated here. Offline continuation of an already planned route is distinct from complete offline planning, which is not claimed. TTL is 24 hours for source observations and 15 seconds for GPS evidence; exporting/restoring does not refresh either. Do not edit timestamps to promote authority.
