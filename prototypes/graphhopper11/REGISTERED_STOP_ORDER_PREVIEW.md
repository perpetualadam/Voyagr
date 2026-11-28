# Registered stop-order comparison preview

27 November 2026. Original Milestone 3 journey/settings work; PR #540 remains
unmerged. This is application-level finite comparison using self-hosted GH11.1,
not the commercial GraphHopper Route Optimization API. Navigation stays disabled.

## Supported request and trusted registry

An operator may register a root continuous-stop case with `stop_order_cases`
listing all two or six orderings for two or three distinct stops. The request
must match the root's original endpoints/visits exactly and explicitly select
`optimize_stop_order`. The public general normalizer cannot grant this capability,
and request JSON cannot supply execution case lists.

Before any Java work, the bridge verifies the entire factorial permutation set:
unique case names and stop coordinates, unchanged endpoints, identical registered
constraints/settings (apart from IDs, point order and the order-list declaration),
and no missing or duplicate ordering. The cases all use the same manifest-bound
graph/source/profile and complete user policy. Unsupported mandatory requirements
refuse before evaluation. This increment supports the `fastest` objective only;
quiet/scenic requests, mixed vias, explicit fixed order, alternative-generation
combinations, round trips, schedules and time windows refuse.

## Calculation and selection

Each declared order executes a fresh complete registered GHRequest. Existing
independent geometry, directed traversal, imported turn/profile, instruction,
waypoint and exclusion validation applies to every primary path. No independently
calculated legs are concatenated. If any order fails or remains unverified, the
entire comparison refuses; it does not choose from an incomplete subset.

The selected order has the lowest **native-reported primary driving duration**
among this complete finite registered set. Equal scores prefer the original
position order lexicographically. This is not a global optimal-route proof, fleet
optimizer, live traffic ETA or validation of every possible path for an order.
Each order's primary path comes from the configured car/profile cost function.
Constant total dwell is preserved separately and added after selecting the path.

The comparison has a cooperative 60-second budget checked before/after each order.
An in-progress native call remains subject to the existing process/node/output
limits; this is not a hard 60-second cancellation of that call. Expired comparisons
never publish a winner and return the fixed safe HTTP 504 refusal enum. There are
at most six orders and one primary route per order. Real-graph cost and latency
remain unmeasured; this workload requires Milestone 5 benchmarking.

Optimization bypasses both public and private raw-evidence caches. It never picks
a winner from mutable cached duration metrics, a partly warm set or fallback
provider output. Existing warm fixed-order cache entries are retained. Fresh
reference restoration repeats the comparison; changed requests/versions refuse.

## Response, display and saved inspection

The complete original request remains bound to its root selector. The response
records the resolved native case separately, requested/resolved original indices,
all comparison scores, assessed order count and the restricted primary-path scope.
Each stop's provenance/name/dwell follows its identity into the resolved order.
Complete leg ranges, instructions and driving/dwell/total timing follow the chosen
trajectory. Requested input metadata is retained in the bound request; the
displayed ordered-stop context describes the resolved trajectory.

The normally booted UK page calculates and mounts this preview. Actual device
save/reload/use retains the resolved order and comparison context. Explicit Start
refuses. Fresh/live continuation also explicitly refuses optimized registered
plans rather than silently converting the optimized request into a legacy fixed
order. Existing browser data is not migrated, cleared or replaced.

## Verification

Generated native fixtures evaluate two and six complete orders. The three-stop
example changes requested A/B/C to A/C/B with all three stop identities and dwell
durations intact; its selected driving estimate equals the minimum reported score.
The two-stop reference is restored through fresh native calculation. Missing,
duplicate, unknown, changed-policy or changed-endpoint registrations refuse before
Java, as do unsupported objectives and mandatory policies. Deadline and final-order
failure controls refuse after earlier valid results without publishing a subset.

An authenticated HTTPS test first warms a fixed-order cache, then verifies the
optimizer still executes every order freshly, leaves the old cache unchanged,
rejects an altered restore reference and reports budget refusal precisely.

`test_real_chromium_full_uk_registered_stop_order_preview` uses normal UK stop and
optimization controls, actual Calculate, local Java and map geometry. It checks
all six scores, resolved order, four complete legs, dwell and Start refusal. A
test-only failure on the last order returns 504 and retains the earlier complete
preview. Actual saved-device reload keeps the resolved order and comparison count.
All coordinates/graphs/profiles/storage are synthetic and provider networking is
blocked. Physical-phone behavior and deployed acceptance remain unverified.

```sh
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py \
  -k 'stop_order_optimization or incomplete_or_unsupported_stop_order or incomplete_comparison or optimizer_http'
GH11_BROWSER_ACCEPTANCE=1 GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py \
  -k full_uk_registered_stop_order_preview
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

## Remaining original scope

PASS applies to the registered finite preview only. General journey execution,
mixed/interleaved stop-order optimization, arbitrary stopping maneuvers,
optimization combined with alternatives, time-dependent routing and trusted
general road/hazard association remain unsupported/unverified. Milestone 3 remains
PARTIAL; production migration remains NO_GO. No production handler, authentication,
configuration, VPS2 service, dataset, merge or deployment is changed here.
