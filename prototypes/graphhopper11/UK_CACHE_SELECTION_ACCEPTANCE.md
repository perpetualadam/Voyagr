# Original Milestone 3: full-page cache and selection binding

26 November 2026. Registered synthetic acceptance only. Milestone 3 remains
PARTIAL; GH11 navigation stays disabled and production migration remains NO_GO.

## Actual path and isolation

`test_real_chromium_full_uk_cache_selection_binding` boots the real UK release
shell and modules in two fresh disposable browser contexts. Normal Calculate
posts its complete request to the existing test-only registered bridge. A fresh
self-signed certificate is generated inside the test directory, and the fixture
listens on loopback HTTPS. Certificate-error handling is limited to these browser
contexts; no production certificate, trust store, Nginx rule or authentication
setting changes.

The fixture explicitly applies the actual `private_route_session` implementation
from the prototype's **separate** private-cache module instance to its test route.
It uses the prototype cookie namespace, signing secret and bounded in-memory raw
evidence store, never the UK singleton or cookie. The production prototype factory
still restricts its cache wrapper to its own app-route paths. This explicit fixture
connection is not a production `/api/route` adapter or engine-selector deployment.

Every accepted request reaches `RegisteredAppRequestBridge.calculate`; warm hits
run `LocalJavaBridge.validate` again against raw evidence and current manifest.
The normal 30-second cache lifetime is unchanged. No cached verdict is promoted
to authority. Cache statistics exist only on the disposable lab evidence endpoint;
no cookie values or cache keys are returned in test evidence or logged.

## Observed checks

| Input or state | Required result |
| --- | --- |
| Identical complete request, same browser | One Java execution and two independent validations across two Calculate actions; matching request binding and fresh UI response commits |
| Changed detour setting | New complete-request binding and fresh Java execution; its subsequent identical request can reuse independently checked evidence |
| Old option selected after settings change | Actual inspection selection retains the old binding and stale preference snapshot, rather than adopting the new settings; lifecycle Start refuses it |
| Ordered pass-through visits | Complete ordered request is retained; an identical repeat revalidates its cached raw evidence |
| Reversed visits | Registered-order mismatch refuses before cache validation or Java; the previous preview stays intact |
| Changed registered origin | A fresh request and binding are required, then identical repeats can reuse private evidence |
| Unregistered changed origin | Refuses before validation/Java; no approximate coordinate cache reuse |
| Graph, source or policy identity mismatch | Each identity is changed independently by a fixed fixture control; all refuse before validation/Java, preserving the old preview |
| Unsupported mandatory crossing exclusion | A warmed preferred-route cache cannot satisfy it; refusal before validation/Java |
| Same complete request in another browser | Same route/request binding but a distinct secure capability and another Java execution; browsers do not share their private evidence |
| Corrupted cached metric | A negative metric is injected into synthetic cached raw evidence while retaining its expiry; independent validation refuses, clears the cache and does not fall back to Java |

Successful calculations must commit a new actual UK response object even on a
cache hit. The selected route retains its returned binding and explicit false
navigation/automatic-selection flags. Map assertions inspect mounted line/source
geometry at its declared six-decimal polyline precision, after the renderer and
camera have settled. This slice tests settled calculations, not rapid/out-of-order
response races. On refusal, preview identity, geometry, selected index, options, rule
metadata and the synthetic device marker must be unchanged immediately. Exact
mounted geometry must remain available once any preceding success's owned delayed
preview redraw settles. This does not claim zero transient redraw time; a permanent
missing line still fails the bounded browser assertion.

The grouped scenario requires **18 route requests, six Java executions, twelve
independent validations and seven refusals**. Eleven requests succeed. Six invalid
request/version/policy controls refuse before validation; the corrupted-cache
request accounts for the final refusal and twelfth validation.

The capability cookie must be host-scoped, Secure, HttpOnly, SameSite=Strict and
path `/`; JavaScript cannot read it. Hits do not issue a replacement cookie.
Responses remain `private, no-store`. Cookie comparisons happen only in memory;
failure messages and final evidence do not print capability values.

## Reproduce

Use the pinned JAR and workflow web/Chromium dependencies; no map download:

```sh
CHROMIUM_BINARY=/usr/bin/chromium \
GH11_PROTOTYPE_JAR=/absolute/path/graphhopper-web-11.1.jar \
GH11_BROWSER_ACCEPTANCE=1 .venv/bin/python -m pytest -q \
  tests/test_gh11_isolated_app.py -k full_uk_cache
.venv/bin/python -m pytest -q \
  tests/test_gh11_private_complete_cache.py tests/test_gh11_app_request_bridge.py
```

The helper accepts an explicit test TLS option; the earlier HTTP full-page cases
remain HTTP and continue bypassing the private cache. Existing isolated tests
cover expiry, capability rotation, HTTP/forwarded-header bypass and cache bounds.
This full-page scenario adds no TTL extension, expiry-delay simulation or clock
override. CI includes it in the existing real-Chromium selection.

Local validation passed all nine grouped checks (eight real Chromium scenarios
and the native matrix), plus 55 focused cache/request tests. The required UK web
selection passed 2,550 tests and 94 subtests with one skip; all 4,091 JavaScript
tests in 205 suites and test-quality lint passed. These are local results;
subsequent CI must validate the committed head independently.

## Limits and next original row

Origin evidence here means synthetic request coordinates, not authenticated live
GPS. Version controls verify mismatch refusal, not deployment or reimport of a
new graph. Basic authentication, service-worker behaviour, genuine phone storage,
outages and real driving are not established by this test. The browser blocks
external requests; the fixture blocks outbound server sockets. No private account,
location history, existing browser profile, VPS or production data is accessed.

Old previews remain available for **inspection**; they must keep their original
evidence and cannot gain current/navigation authority. This does not establish
general strict hazard coverage, timed-stop semantics or preference implementation.

This is the third bounded original integration slice. Next is the original
saved/restored-plan, source-outage, stale-response race, policy-change and legacy
fallback acceptance row, using the full UK page and the same isolation constraints.
