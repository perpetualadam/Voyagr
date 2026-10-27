# Phase 8 — mobile PWA acceptance

Date: 2026-10-27. **PHASE8_PARTIALLY_VERIFIED — production NO-GO.** Integration baseline: latest main `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` plus existing Phase 6 `c5c67686` and Phase 7 `0701f4df`; these changes are not present on fetched main. PR refs #343/#344 still point to those commits; current PR state/rules cannot be read because GitHub API access returns HTTP 403. Phase 8 branch: `codex/phase8-evidence-and-pwa-acceptance`, based on `0701f4df`. No previous changes duplicated. No Contabo access, production configuration/database/graph/service mutation, deployment, paid API call, Kivy/native Android change or deployment automation change.

**REAL_DEVICE_ACCEPTANCE_NOT_TESTED.** No approved physical device/browser environment is attached. Playwright package/config exists, but Chromium is not installed. Existing E2E scripts rely on network/geocoding and historical test selectors; they are not treated as a verified device protocol. No browser download, live journey, map service or camera was accessed. Jest/browser mocks are not physical testing.

Use a stationary arrangement or a passenger for all observations/controls. Never interact while driving, deliberately exceed speed limits, or violate restrictions to test an alert. Record app commit, device/OS/browser versions and observable results; avoid retaining identifiable third-party information or private journey traces without explicit approval. A controlled test/staging environment needs separate operator approval; Phase 8 does not deploy one.

| # | Case | Operator action | Expected observation | Executed here |
|---|---|---|---|---|
| 1 | Normal route start | Preview then start a reviewed route while stationary | Correct selected route; no stale prompt or automatic mandatory bypass | NOT_TESTED |
| 2 | Route preview | Inspect source, summary, warnings and complete shape | Endpoints, avoidance status and complete geometry agree | NOT_TESTED |
| 3 | Alternative selection | Choose another reviewed alternative | Selected identity/shape/stops and assessment remain bound | NOT_TESTED |
| 4 | Multi-stop navigation | Use a reviewed ordered-stop journey | All legs present; remaining stops retain order | NOT_TESTED |
| 5 | Intermediate arrival | Observe approach to an intermediate stop | Journey does not finish; next leg remains | NOT_TESTED |
| 6 | Final arrival | Observe the reviewed final destination | Completion requires reliable position and no pending stops | NOT_TESTED |
| 7 | Wrong turn | Use a lawful safe alternative with passenger observation | No jump to a parallel road; uncertainty remains explicit | NOT_TESTED |
| 8 | Automatic rerouting | Observe an approved safe deviation | Existing hysteresis and mandatory avoidance gates remain | NOT_TESTED |
| 9 | GPS loss | Revoke permission or use stationary signal simulation | No invented movement, legal/lane confidence or stale speech | NOT_TESTED |
| 10 | GPS reacquisition | Restore permission/location while stationary | Fresh continuity required; no unnecessary reroute | NOT_TESTED |
| 11 | Screen locking | Lock/unlock while stationary or with passenger control | Document GPS/audio behavior and any browser limitation | NOT_TESTED |
| 12 | Browser background | Background browser while stationary | Record actual continuation/suspension; do not assume native service | NOT_TESTED |
| 13 | Browser resume | Return after suspension | No stale source/route/voice claim; reacquire | NOT_TESTED |
| 14 | Network loss | Disable network while stationary | Existing journey may continue within available evidence; no new-plan claim | NOT_TESTED |
| 15 | Network restoration | Restore network | Stale responses cannot replace current route/vehicle | NOT_TESTED |
| 16 | Service-worker update | Use approved test install/update environment | No mixed-client false authority; private/GPS APIs never replay | NOT_TESTED |
| 17 | Stale offline route | Restore a deliberately aged test route | Mandatory status unresolved; schema/geometry guard applies | NOT_TESTED |
| 18 | Camera alert | Observe lawful source-backed case, never violate limits | Applicable vs possible wording; no unrelated confident on-route claim | NOT_TESTED |
| 19 | Lane guidance | Use source-backed signed junction case | Correct direction/source or suppressed; no guessed permission | NOT_TESTED |
| 20 | Speed-limit change | Observe signs lawfully without speeding | Mapped applicable provenance or unknown; no flow/default substitution | NOT_TESTED |

Copy `scripts/fixtures/phase8/pwa-device-results-template.json` to a new local result file. Its 20 cases are NOT_TESTED. After real execution, enter device/OS/browser, exact 40-character app commit, timezone-aware record time, observation role (`stationary` or `passenger`) and PASS/FAIL/BLOCKED plus observable notes for each case. Do not substitute simulator results under `physical-device`.

Run `.venv/bin/python scripts/validate-phase8-device-results.py /tmp/phase8-device-results.json`. The unexecuted template deliberately fails readiness. Even a complete operator artifact returns OPERATOR_RECORDED_RESULTS_REQUIRE_INDEPENDENT_REVIEW and **never authorizes production release**. A FAIL or incomplete case remains unaccepted. Raw current status: [VOYAGR_PHASE8_DEVICE_STATUS.json](VOYAGR_PHASE8_DEVICE_STATUS.json).

Focused actual PWA code regressions verify vehicle changes immediately invalidate car attributes before another fix, unsupported/future offline schemas are refused, supported/legacy schemas preserve selected route/stops while invalidating old mandatory claims, and contradictory node geometry is rejected. Full sensor/audio/background/MapLibre/service-worker lifecycle acceptance remains on the physical matrix above.
