# Isolated GH11 application-boundary investigation

This audit describes the main-branch behaviour inspected before the opt-in
strict-mode change. [STRICT_MODE.md](STRICT_MODE.md) records the new development
guards; default UK behaviour is preserved. The original explicit-Start finding
remains relevant to a default-mode migration, while opt-in gates are now tested.

No application endpoints, frontend gates, production settings or engine selection
are changed. The web app is Flask; the main route handler is still in
`voyagr_web.py`, not FastAPI. This is an offline synthetic contract experiment,
not a deployed or browser-connected adapter.

## Current source evidence

| Path | Evidence | Implication for GH11 strict mode |
| --- | --- | --- |
| `voyagr_web.py:1136` | Cache access precedes provider hazard preparation; a hit returns to the response pipeline. | Bind GH11 graph/source/policy identities before strict cache use; inspect the after-request hook rather than assuming cached responses escape assessment. |
| `voyagr/services/routing/integrity_api.py:20` | Explicit avoidance requirements set force_refresh; the after-request hook reassesses responses, fetching current local hazards on cache hits when needed. | Existing protections must be preserved. They are not the GH11 graph/source manifest contract, but cached responses are not simply trusted without assessment. |
| `voyagr/services/routing/private_route_cache.py:67` | Key MAC includes all resolved request inputs, cost fingerprint, private capability and process epoch. Values are serialized, bounded and expiring. | Reuse this implementation's isolation properties, while explicitly supplying GH11 graph/source/policy identities and revalidating hits. Current request identity alone is not source freshness. |
| `voyagr/services/routing/route_cache_key.py:94` | Reroute and force-refresh requests bypass the current route cache. | Preserve bypass semantics in a future application adapter; the synthetic boundary instead makes changed departures distinct requests. |
| `voyagr_web.py:1738` | Settings requiring a capable engine are refused before OSRM fallback. | Existing protection must be preserved. It does not establish support for exact GH11 directed-edge exclusions. |
| `voyagr/services/routing/graphhopper_fallback.py:12` | Legacy custom-model fallback helpers recognize avoidance models. | Stock legacy HTTP routing is not the Java directed-exclusion prototype. Do not silently substitute it after GH11 failure. |
| `static/js/app/calculate-route-orchestration.js:660` | Automatic in-navigation replacement invokes the integrity gate. | Browser acceptance remains a separate boundary from successful engine routing. |
| `static/js/app/reroute-map-orchestration.js:216` | Manual guidance and automatic navigation candidate paths differ. | Both paths need strict-mode acceptance tests before GH11 integration. |
| `static/js/app/navigation-safety-ux.js:25` | A refused integrity decision can become allowed ADVISORY for explicit Start when guidance geometry exists. | **BLOCKER:** incompatible with a claim that mandatory exclusions always fail closed. No change to this UK behaviour is made here. |
| `static/js/__tests__/best-effort-navigation.test.js:57` | Existing tests explicitly preserve advisory explicit Start for mandatory refusal. | Existing passing frontend tests establish the current behaviour, not the proposed strict-mode contract. |

Line references describe the inspected main/prototype base; review surrounding
functions if subsequent edits shift them. No live API, private history, production
configuration, service restart or deployment was used for this investigation.

## Synthetic boundary experiment

`integration_boundary.py` composes the existing synthetic journey validator with
an independent instance of the actual bounded memory-cache implementation. It
loads only that cache source file, avoiding routing-package engine initializers.
There is no HTTP server, fallback engine, file persistence, log emission or app
import. Caller-owned requests/policies and provider output are copied.

A request carries ordered visits and car profile. Trusted test policy carries
explicit graph/source/policy versions, directed exclusions, turn evidence,
synthetic coverage, and bounded freshness using an injected monotonic clock.
This is not a hazard association compiler or an authenticated evidence service;
real data, UNKNOWN/STALE/AVAILABLE coverage and missing evidence are refused.

Each private session MACs the complete request and policy with a fresh secret
and cache epoch. Calculation validates all one-to-three returned candidate
journeys, every leg and seam, before retaining a result. Cache hits and selections
revalidate all candidates against the current context. Changed versions, rules,
visits, departure point, expired evidence or a different session cannot select an
old handle. Provider exceptions, empty results, incomplete legs, incompatible
versions or an unsafe alternative refuse the whole result without fallback.

Every result and selection retains `navigation_allowed: false`. This cannot be
used as evidence that arbitrary real-world routes are safe or legally compliant.
The existing adapter's synthetic turn/continuity scope is unchanged. The harness
accepts only car and has no UI settings mapping, preference compiler, browser
Start gate or real GH11 transport.

## Verification

Run:

```sh
.venv/bin/python -m pytest -q tests/test_gh11_integration_boundary.py
GH11_PROTOTYPE_JAR=/path/to/pinned/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_prototype.py tests/test_gh11_integration_boundary.py
```

The new tests cover one/two/three validated alternatives, unsafe third candidate,
every multi-stop leg, prohibited turns at leg seams, changed-departure requests,
cache hits, changed graph/source/policy/rules, mutated returned objects, private
session separation, corrupted cache contents, expired evidence, provider failures
and refusal to treat real/unknown evidence as synthetic complete coverage. They
exercise the cache implementation, not Flask routing or the browser.

Separate operator evidence: the UK primary, one returned native alternative,
continuous three-point route and changed-departure provider query all passed
selected graph checks with the camera edge blocked. This does not establish
three distinct UK alternatives or automatic browser rerouting.

## Remaining acceptance work

Before a real isolated application integration, implement an authenticated,
versioned association/policy compiler and a GH11 Java transport whose graph and
source manifests are bound to every response. Wire an explicit isolated mode;
never reuse the production engine chain implicitly. Preserve request settings,
ordered stops and rules through every alternate, reroute and cache boundary.

Then add Flask test-client and browser tests of the actual GH11 adapter, automatic
and manual selection, explicit Start, saved/restored plans, stale-response races,
policy/source changes, source outages, no-route responses and forbidden fallback.
Any strict-mode mandatory refusal must remain refused through explicit Start.
A refusal must retain the current journey rather than substituting an unverified
route. Require reviewed proposed changes before any production action.

Status: synthetic boundary experiment PASS when tests pass; actual Flask/GH11
transport and browser integration UNVERIFIED; strict production migration NO-GO.
