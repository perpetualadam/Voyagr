# Original Milestone 3: Calculate, display and refusal

26 November 2026. **PASS within the registered synthetic case scope; Milestone 3
remains PARTIAL. Production migration remains NO_GO.**

This closes a gap in the earlier host/frame acceptance: that lab deliberately
aborted route HTTP requests. It did not exercise normal UK Calculate against Java.

## Implemented corrections

* `app_request_bridge.py:_planning_context` accepts the complete default planning
  metadata added by `calculate-route-orchestration.js:calculateRoute` after the
  initial request builder. The earlier adapter rejected `journey_context`.
  Matching coordinates, known provenance kinds and default `place` arrival are
  preserved in the complete request binding. A supplied bounded accuracy remains
  metadata; `gps_verification` remains `UNVERIFIED`. Returned context explicitly
  says `request_metadata_only`. Live-purpose context, search evidence, explicit
  arrival choices, non-default arrival intent, stops and unknown fields refuse.
* `route-selection.js:normalizeRouteOption` and
  `buildRouteOptionsFromApiResponse` preserve explicit navigation/automatic
  selection restrictions and route evidence scope. Previously normalization
  discarded these fields. An envelope-level false restriction applies to every
  alternative, even if an individual row says true. Missing permission is never
  converted into permission. Existing UK provider selection is unchanged.

## Actual browser and engine acceptance

`test_real_chromium_full_uk_calculate_registered_gh11` copies tracked source and
public assets into disposable storage, imports the full UK application without
its production startup, and serves its real release shell/modules on loopback.
The **test-only** `uk_calculate_test_server.py` dispatches `/api/route` to the
actual registered bridge for one synthetic `detour` fixture. It requires an
explicit synthetic test header. It does not install a production engine selector.
Other APIs except configuration refuse; outbound Python socket connections and
browser external requests are blocked. No operator data, .env, credentials or
existing databases are copied. The browser starts with independent empty device
contexts; it does not clear any existing browser storage.

`uk-calculate-acceptance.cjs` establishes:

1. The real Calculate button sends the complete request through the full UK
   orchestration and local HTTP bridge to GH11.1 Java. A returned route is decoded,
   committed and mounted using the real UK renderer. Its identity, geometry,
   maneuvers, provenance and preview-only restriction survive normalization.
2. The actual journey Start action refuses that displayed preview. No live
   navigation starts.
3. A new mandatory railway-crossing exclusion, unsupported by this registered
   fixture, returns HTTP 422 before another Java execution. The displayed route,
   mounted line and synthetic device marker remain intact.
4. A second disposable device context starts a synthetic baseline through the
   actual UK lifecycle. Actual alternative selection, lifecycle Start and reroute
   replacement with the real GH11 preview retain that baseline's identity,
   geometry, instructions, selected index and LIVE state.
5. Normal Calculate from that active baseline reaches Java again, but its new
   preview cannot replace the existing journey. The same state remains intact.

The server counter must show **three route requests, two Java route executions,
one pre-engine refusal**, with no fallback engine. The baseline is stopped at the
end of the test. Its LIVE state is a synthetic lifecycle check, not physical-phone
guidance or a successful GH11 navigation start.

## Reproduce

Use the pinned JAR SHA-256 documented in the workflow; no map download is needed.
Install web dependencies plus the isolated Flask version and Playwright Chromium
as in `.github/workflows/graphhopper11-prototype.yml`, then:

```sh
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
GH11_BROWSER_ACCEPTANCE=1 .venv/bin/python -m pytest -q \
  tests/test_gh11_isolated_app.py -k full_uk_calculate
.venv/bin/python -m pytest -q tests/test_gh11_app_request_bridge.py
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

`GH11_BROWSER_ACCEPTANCE` must be explicit. The ordinary synthetic CI step skips
browser checks; its separate Chromium step runs this test with full web dependencies.
For a system Chromium installation, also set `CHROMIUM_BINARY=/usr/bin/chromium`
when running all isolated browser scenarios; otherwise install Playwright's browser.

Local validation: 500 non-browser GH11 checks and all six real Chromium scenarios
passed; 4,091 JavaScript tests in 205 suites and the test-quality lint passed.
The required UK web selection passed 2,550 tests and 94 subtests, with one skip,
using Flask 2.3.3 separately from the isolated Flask 3.1 runtime. The initial broad
run lacked the system-browser path and failed five older browser startups; all six
browser scenarios passed after setting that path, without changing assertions.
These are local results; subsequent GitHub checks must validate the committed head.

## Remaining boundaries and next original item

The map uses an empty local style and software graphics; geometry mounting is
verified, basemap providers and real WebGL recovery are not. Physical GPS,
phone/storage retention, real hazard coverage, general legal compliance and
concurrency remain unverified. GH8 and VPS2 have not been contacted or modified.
No production deployment, migration, merge or positive GH11 guidance is enabled.

This is the first bounded slice of the original Start/selection/replacement row;
it does not close all four original integration rows. Next extend the same full
Calculate acceptance to registered alternatives and ordered multi-leg requests,
retaining every setting on every result and leg. Unsupported stop, arrival and
mandatory-policy semantics must keep refusing; do not substitute index research
for that original app integration work.
