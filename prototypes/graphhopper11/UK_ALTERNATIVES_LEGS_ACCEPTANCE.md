# Original Milestone 3: every alternative and ordered leg

26 November 2026. Registered synthetic acceptance, not production readiness.
Navigation remains disabled and production migration remains NO_GO.

## What is exercised

`test_real_chromium_full_uk_alternatives_and_legs` boots the same disposable full
UK page used by [the first Calculate acceptance](UK_CALCULATE_ACCEPTANCE.md).
It invokes normal Calculate and actual waypoint, selection, map and lifecycle
modules. HTTP requests reach the real registered bridge and GH11.1 Java; success
responses and route counts are not mocked. The server's case-selector header and
fault controls exist only in this loopback test fixture. Production `/api/route`
and the app's engine selector are unchanged.

An independent tiny OSM fixture contains a motorway, three separate residential
bypasses and one-way terminal spurs. Interior visits are graph junctions, so the
graph's tower-node bounds include them. A non-route spur supplies the existing
nonempty registered directed-exclusion contract; it does not block the motorway.
The selected mandatory motorway rule uses the registered custom model and the
Java checker rejects any motorway traversal. Blocking bypass associations gives
three, two, one and zero candidate cases without changing the earlier fixtures.
The native count/leg test checks Java output separately before browser projection.

| Case | Observable acceptance |
| --- | --- |
| Three native alternatives | All three survive normal response normalization; each can be selected for inspection, mounts its exact decoded geometry, retains settings/version/request bindings, and refuses lifecycle Start |
| Two native alternatives | Both pass the same checks; no third route is fabricated |
| One native alternative | The single compliant fixture route passes; no duplicates fill empty slots |
| Zero candidates | HTTP 422; previous preview retained; no fallback or real-world route-absence claim |
| Corrupted third candidate | Actual Java output has a negative third-candidate metric injected before independent validation; the whole response refuses, preserving the earlier preview |
| Two ordered pass-through visits | One continuous route exposes three adjacent, non-collapsed canonical legs; all four visit coordinates match at the declared six-decimal polyline precision |
| Corrupted last leg | Actual Java waypoint indices are collapsed before validation; the whole response refuses, preserving the earlier preview |
| Optimization enabled | Unsupported reordering refuses before another Java execution; the selected setting is not silently disabled |
| Visits reversed | Changed order is not substituted for the registered order; refusal before Java preserves the preview |
| Timed stop added | The actual UK stop request retains its stop and duration, then refuses before Java; it is not relabelled as a pass-through |
| Unsupported mandatory crossing rule | Refuses before Java rather than dropping the rule or falling back |

All comparisons wait for the actual planning transaction and asynchronous line
mount. The assertions inspect live MapLibre layer/source geometry, not just a
route array. Settings are configured after actual guest-profile initialization,
using the real preference form/save handler; an early startup seed is not treated
as the settled selection. There are no native GPS fixes, real accounts, provider requests or
private device records. Every external browser request and outbound server socket
is blocked; the existing browser profile is not accessed or cleared.

## Settings and per-leg meaning

The browser sends a mandatory motorway exclusion, a preferred crossing avoidance,
a disabled toll rule, a non-default detour value and quiet preference. The fixture
compares the **complete actual request** with the bridge's retained request. Every
selected alternative retains the same graph/source/policy and complete-request
bindings and the enabled/mode values, with navigation/automatic selection false.

For the three-leg case, one policy binds the complete ordered request and complete
validated traversal. Contiguous leg ranges partition that route, including every
visit and the final destination; there are no separate unvalidated leg requests.
The normal UK inspector verifies these canonical ranges. Raw validation reports
zero selected forbidden traversals for every accepted candidate.

This establishes fixture motorway enforcement and metadata retention. It does
**not** establish general hazard coverage or that a preferred crossing, quiet
route, detour limit or cost preference was implemented. Those remain unverified
under the existing compiler. Preview assessment remains UNVERIFIED even for this
registered compiled rule; no test promotes it to legal/navigation authority.
Timed stops, optimization and arbitrary user journeys remain unsupported.

The matrix requires **eleven HTTP route requests, seven Java executions and seven
refusals**: four requests succeed; zero-route and two corrupted-output controls
reach Java; optimization, reversed visits, timed stops and unsupported mandatory
avoidance refuse before Java. Previous preview identity, geometry, instructions,
options, selected index and synthetic device marker remain intact on refusal.

## Reproduce and scope

With the workflow's pinned JAR and web/browser dependencies installed:

```sh
CHROMIUM_BINARY=/usr/bin/chromium \
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
GH11_BROWSER_ACCEPTANCE=1 .venv/bin/python -m pytest -q \
  tests/test_gh11_isolated_app.py -k 'full_uk or matrix_native'
```

Omit `CHROMIUM_BINARY` when using Playwright's installed browser instead. CI runs
the native test in its synthetic step and the browser matrix in its Chromium step.

Local validation: all eight grouped checks passed: the native matrix, the existing
six Chromium scenarios and the new full-page matrix. The harness saves selected
preferences through the initialized form before routing. The UK web
selection passed 2,550 tests and 94 subtests with one skip. All 4,091 JavaScript
tests in 205 suites and test-quality lint passed. Committed-head CI is separate.

This is the second bounded original integration slice. The broad alternatives/
multi-stop row remains PARTIAL because real stop semantics, general hazard/legal
proof, arbitrary journeys, deployment and phone acceptance are not established.
No production application source, configuration, VPS service or data is changed.
The next original row is full-page cache/selection binding to versions, settings,
ordered visits and origin, followed by saved/restore/outage/race/fallback acceptance.
