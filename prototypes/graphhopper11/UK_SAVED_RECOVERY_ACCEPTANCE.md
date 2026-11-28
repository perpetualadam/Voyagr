# Original Milestone 3: saved plans, outages and response ownership

27 November 2026. **PASS within the registered synthetic scope.** Milestone 3
remains PARTIAL outside that scope; production migration remains NO_GO and GH11
navigation remains disabled.

## Confirmed issues and source corrections

1. Normal UK saving previously omitted the GH11 preview restriction fields.
   `route-sharing.js:inspectionRefusals` now carries explicit refusals and the
   selected-fixture scope through saving/restoration. It does not persist positive
   permission. A fixture claim also preserves the refusal when other metadata is
   contradictory. Existing records are not rewritten or migrated.
2. Saving used the legacy `time` property, which can be absent or belong to an
   earlier selection. It now prefers the selected route's `duration_minutes`, with
   the existing `time` fallback for older route shapes.
3. The previous commit's CI cache browser test failed after a successful response
   did not commit. Local diagnostics reproduced the rejection: **Map not ready;
   current journey retained.** A renderer can become busy after the request starts.
   `calculate-route-orchestration.js:waitForPlanningMapReady` now waits at most four
   seconds before staging. `journey-modes.js:commitPlanning` retains its outer
   bounded operation and rechecks intent ownership. The final stage readiness,
   geometry, publication, cleanup and navigation gates are unchanged. Cancellation,
   an invalid current-intent checker or permanent unavailability refuse safely.

The cache browser fixture now waits for the actual window-load initialization
before setting preferences. Timeout diagnostics expose only synthetic state,
status and calculation errors, never capability values. The CI-matching Playwright
download was denied by this workspace's download policy; local runs use installed
Chromium. GitHub CI independently runs the workflow's browser and Java 17.

The readiness fix concerns **planning commits**, not disappearance while driving.
It does not establish the cause of the owner's earlier phone map loss, GPS issues,
private website access failures or a WebGL context failure.

## Actual full-page acceptance

`test_real_chromium_full_uk_saved_outage_race_refusal` boots a disposable full UK
page and uses its normal Calculate, device storage, save, restore, offline
inspection, preference and Start paths. Successes reach registered GH11.1 Java and
independent validation. The browser and server block external provider traffic.

| Scenario | Observed assertion |
| --- | --- |
| Save a calculated preview | Actual scoped IndexedDB row retains geometry, maneuvers, canonical duration, version/request provenance and navigation refusals |
| Reload and use saved plan | Same saved row and geometry survive; actual saved-plan action restores an inspection; Start refuses without another route calculation |
| Offline inspection | The saved plan is usable for inspection with the browser offline; no browser storage is cleared |
| Changed mandatory policy | Unsupported crossing exclusion refuses before Java; restored preview and stored row remain intact |
| Request transport unavailable | Browser network failure retains the existing inspection; no provider calculation occurs |
| Engine timeout boundary | Test-only transport failure raises the actual refusal type before spawning Java; HTTP 504 retains the preview; no fallback occurs |
| Legacy-format engine envelope | Actual Java output is marked version 8 before the independent checker; it refuses the whole response; no live GH8/Valhalla/OSRM service is contacted |
| Delayed valid response after policy change | The browser holds an actual validated response, changes selected policy, then releases it; stale data cannot publish or satisfy the changed mandatory rule |
| Newer request finishes first | The older held request is cancelled/superseded; releasing it cannot replace the newer selected identity or binding |
| Temporarily unavailable map style | With a valid result ready, an explicit synthetic style-readiness control holds staging; previous plan remains until readiness returns and guarded publication succeeds |
| Changed policy during readiness wait | The obsolete wait cancels, without staging or replacing the previous plan |
| Permanently unavailable map style | Bounded waiting refuses; previous geometry, saved row and navigation refusal remain |

Response gates hold **real upstream output** after Java/checking; they do not
fabricate successful routes. Transport and legacy-envelope faults are explicit
test-only controls in `uk_calculate_test_server.py`. Readiness controls override
the map instance's readiness predicate temporarily, not its geometry or ownership
implementation, and are restored after each check. They are not physical WebGL
recovery evidence. Unexpected route-interception errors fail the scenario; only
the expected cancellation of the superseded request is allowed.

The final actual Start still refuses, and the original saved row, ID and geometry
remain present. No account, GPS fix, precise private journey or existing browser
profile is read. No reports or stored user data are deleted. The source changes
are additive save metadata and bounded planning readiness, not a production
configuration, authentication, service, graph or deployment change.

## Regression commands and evidence levels

With the workflow's pinned JAR and web/browser dependencies installed:

```sh
CHROMIUM_BINARY=/usr/bin/chromium \
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
GH11_BROWSER_ACCEPTANCE=1 .venv/bin/python -m pytest -q \
  tests/test_gh11_isolated_app.py -k 'real_chromium or matrix_native'
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

Focused Jest coverage includes saved refusal/provenance retention, omission of
positive authority, selected-duration precedence, temporary readiness, cancellation,
timeout and a broken intent checker. The existing real planning-settlement test
keeps all prior state/progress assertions and advances its fake clock through the
new bounded wait, instead of freezing `Date.now()` during a timeout test.

Local validation: ten grouped browser/native checks passed; the final save-duration
assertion also passed in the focused full-page recovery run. All 4,098 JavaScript
tests in 206 suites and test-quality lint passed. The required UK backend selection
passed 2,550 tests and 94 subtests with one skip. Committed-head CI is separate.

## Original roadmap boundary

All four original Milestone 3 rows now have bounded, registered full-page
acceptance. This is not completion of general GH11 app integration: timed stops,
optimization, arbitrary journeys, general hazard/legal proof, deployment and
physical-phone acceptance remain unverified or unsupported and must fail closed.

The next step is an original-milestone exit review: consolidate what these four
slices establish and which implementation/capability gaps block migration. Do not
resume serial index/import research or declare production readiness from these
synthetic results. No merge, deployment or removal of UK routing engines is
authorized by this acceptance.
