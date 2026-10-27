# Phase 9 — physical-device PWA acceptance

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

**REAL_DEVICE_ACCEPTANCE_NOT_TESTED.** No physical phone/browser execution performed. All 20 original IDs and expected outcomes are retained below; [validator output](VOYAGR_PHASE9_DEVICE_STATUS.json) correctly rejects the unexecuted template. No simulation or self-attestation proves physical execution. The validator now rejects malformed, timezone-free and future record timestamps; three regressions reproduced baseline acceptance of those invalid records. Even complete valid records require independent review and never authorize production release.

| Existing case ID | Expected observation / supplemental coverage | Result |
|---|---|---|
| normal_route_start | Correct selected route, no stale prompt or mandatory bypass; observe install/startup and GPS permissions while stationary. | NOT_TESTED |
| route_preview | Complete geometry, endpoints, source, summary and avoidance warning agree. | NOT_TESTED |
| alternative_selection | Selected identity/shape/stops and bound assessment retained. | NOT_TESTED |
| multi_stop_navigation | All legs present; remaining waypoints stay ordered. | NOT_TESTED |
| intermediate_arrival | Next leg remains; intermediate stop does not finish journey. | NOT_TESTED |
| final_arrival | Reliable final position and no pending stops required. | NOT_TESTED |
| wrong_turn | No progress jump to parallel/disconnected road; uncertainty explicit. | NOT_TESTED |
| automatic_rerouting | Existing hysteresis, remaining stops and mandatory gates preserved. | NOT_TESTED |
| gps_loss | No invented movement, stale speech or lane/legal confidence; record permission denial. | NOT_TESTED |
| gps_reacquisition | Fresh continuity required; no unnecessary reroute. | NOT_TESTED |
| screen_lock | Record actual GPS/audio suspension/resume; no assumed native background service. | NOT_TESTED |
| browser_background | Record actual continuation/suspension, stationary or passenger only. | NOT_TESTED |
| browser_resume | Reacquire; no stale source/route/voice claim. | NOT_TESTED |
| network_loss | Existing journey may continue within available evidence; no new offline planning claim. | NOT_TESTED |
| network_restore | Stale responses cannot replace current route/vehicle. | NOT_TESTED |
| service_worker_update | No mixed-client false authority; private/GPS APIs never cached/queued/replayed. | NOT_TESTED |
| stale_offline_route | Old mandatory status unresolved; schema/geometry guard and fresh GPS apply. | NOT_TESTED |
| camera_alert | Applicable vs possible warning; no unrelated confident on-route claim. | NOT_TESTED |
| lane_guidance | Correct source/direction or suppressed; observe motorway/slip/roundabout signed junctions. | NOT_TESTED |
| speed_limit_change | Applicable mapped provenance or unknown; no traffic/default substitution. | NOT_TESTED |

## Reconciliation with Phase 9's scenario list

The requested list has 20 topics, but does not match the canonical 20 IDs one-for-one. Do not replace them: installation/startup and permission denial/grant are supplemental observations under `normal_route_start`, `gps_loss` and `gps_reacquisition`. Route planning is `route_preview` plus start; deviation is `wrong_turn`. Motorway and roundabout entry/exit are separate sub-observations within `lane_guidance` and `speed_limit_change` and must be recorded even when guidance correctly remains unknown. Existing network restore, resume, service-worker update and stale-offline cases remain mandatory. Supplemental topic completion is not an extra passed canonical case and the validator cannot verify semantic coverage from notes alone.

## Operator procedure

Use a stationary setup or a passenger; never require driver phone interaction, unlawful maneuvers or speeding. Use an already approved test/staging environment and exact reviewed PWA/backend versions; this phase deploys nothing. Record device model, OS, browser, installed PWA version/commit, backend release, source/graph versions, GPS permission/accuracy state, time and observation role. Use dedicated test accounts and synthetic recordings for camera/storage checks. A simulator does not qualify as physical-device execution.

Copy `scripts/fixtures/phase8/pwa-device-results-template.json` to a **new** result file. Preserve all IDs. Record actual steps, expected and observed behavior, PASS/FAIL/BLOCKED/NOT_TESTED, sanitized diagnostics and evidence references for each case. Add `pwa_version`, `backend_release`, `gps_permission_state` and `supplemental_observations` as metadata fields (the existing completeness validator does not independently validate these extra fields). Never fill PASS from the procedure alone. Retain exact 40-character `app_commit`, timezone-aware `recorded_at` and stationary/passenger role. Keep evidence free of private traces/third-party identifiers.

Run `.venv/bin/python scripts/validate-phase8-device-results.py "$APPROVED_DEVICE_RESULTS"`; incomplete/template output intentionally exits 1. A complete valid operator record returns `OPERATOR_RECORDED_RESULTS_REQUIRE_INDEPENDENT_REVIEW`, not PHASE9_VERIFIED. Hash and transfer the result and sanitized diagnostics via approved artifact transfer, then independently review observed behavior and all supplemental topics. Actual availability of tiles/audio/storage after eviction, lock, suspension or update remains unknown until observed.
