# Isolated Chromium / HTTP / GH11 acceptance

The opt-in `test_real_chromium_http_settings_and_restore` now runs the real
standalone viewer in headless Chromium against a real temporary Flask HTTP server
and the pinned local GraphHopper 11.1 JAR. It reuses the generated graph/registry
fixture from the API suite. No browser responses are mocked and no production app
is imported. This is registered-case preview acceptance, not production readiness.

The Python harness binds only `127.0.0.1` on an OS-selected port, disables request
logging, creates a fresh browser context with a synthetic Basic credential and
shuts down the listener/thread/browser after the test. The Node runner refuses
non-loopback origins, aborts and counts external browser requests, and never
loads a device/browser profile, camera, GPS, map dataset or private history.
Chromium uses `--no-sandbox` in this disposable harness; this does not change the
service/container security settings or production authentication. No screenshots,
videos, browser traces or HTTP bodies are retained as artifacts.

The acceptance sequence checks:

- Anonymous HTTP 401 followed by authenticated viewer/resource access.
- Full synthetic settings -> server preflight -> real Java route -> SVG and
  instructions, with no navigation authority.
- Rich reference restoration, loading the original settings only on success, then
  a subsequent calculation preserving every setting.
- Unsupported mandatory toll avoidance returns HTTP 422 without a route request
  or replacement of the current preview/settings.
- An edited saved setting fails binding validation and preserves the preview.
- Offline restoration fails safely, then online reload/restoration succeeds.
- Synthetic localStorage/sessionStorage markers survive reload without clearing
  storage. This establishes only marker retention in a fresh test context.
- No external requests or uncaught browser errors; Start remains disabled.

The service wrapper additionally asserts exactly one Java execution and four
independent route validations across initial calculation, restore, repeat and
post-reload restore. This checks raw-evidence cache reuse and revalidation in the
real HTTP workflow. Final manifest verification checks the graph/source unchanged.

Local execution passed on 22 November 2026 using system Chromium and Java 21.
The workflow pins supported Ubuntu 24.04, installs its lockfile Playwright
Chromium and Java 17, and runs the
opt-in test separately from the normally skipped browser check. CI acceptance is
separate from the local result; no timing here is a routing/capacity benchmark.

To reproduce on an authorized local test host with Node dependencies, Chromium,
Python/Flask/pytest, Java and the already verified patched JAR:

```sh
GH11_PROTOTYPE_JAR=/path/to/graphhopper-web-11.1.jar \
GH11_BROWSER_ACCEPTANCE=1 CHROMIUM_BINARY=/usr/bin/chromium \
.venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py -k real_chromium
```

Omit `CHROMIUM_BINARY` to use the browser installed by Playwright. The ordinary
API suite intentionally skips this check unless explicitly enabled. Socket/browser
execution restrictions can block local testing; that is not a feature pass.

This does not test a physical Pixel, VPS2, private-site Nginx, installed PWA/service
worker, arbitrary journey, WebGL map/tiles, GPS, live warning delivery, legal/hazard
data coverage or capacity. No merge, deployment or production change was performed.
Milestone 3 remains in progress; production migration remains NO-GO.

## Controlled HTTP denial and delayed-preflight checkpoint

`test_real_chromium_http_fault_recovery` now adds a second real-browser scenario.
The fixture registers authenticated, test-only fault controls on its temporary app,
after the factory's unchanged Basic/Origin guards. These routes are defined only
in the test file; a regression verifies that the normal factory returns HTTP 404
for both control paths. They are not production configuration or packaged runtime
features. The runner still blocks external page requests and uses a fresh profile.

The server deliberately returns 401 and 403 at each of `/api/prototype/policy` and
`/api/prototype/route`. Each denial must retain the existing SVG preview, current
full settings, a synthetic storage marker and disabled Start. A denied preflight
must not issue a route request. Clearing the fault must allow a newly preflighted
reference restoration. Four refusal/recovery pairs are exercised through real HTTP.

A bounded server-side gate then delays a real preflight. Editing the settings
invalidates/aborts the request; releasing the old reply must not issue routing or
replace the preview/new choices. A fresh calculation with the edited settings must
succeed. The service wrapper expects two Java executions and six independent route
validations across this scenario; all results remain preview-only and the graph/
source hashes must remain unchanged. The gate times out rather than hanging CI.

Both browser scenarios passed locally on 22 November 2026. The existing opt-in CI
command selects both `real_chromium` tests on supported Ubuntu 24.04 with Java 17.
No response is mocked in Chromium: faults are deliberately injected in the test
server. This verifies handling of authenticated HTTP denials without a new password
challenge. It does not prove Basic credential expiry/recovery, Nginx behavior,
private-access overlays while driving, or the original phone map-loss cause.
The delayed-reply test exercises real browser cancellation; ignored-cancellation
and other stale-response permutations remain separate DOM regression evidence.

No runtime defect was observed in these controlled paths, so no application source
or authentication configuration was changed. Other Milestone 3 goals remain open.

## Complete-request HTTP/browser checkpoint

`test_real_chromium_http_complete_requests` adds a third actual Chromium scenario.
It uses the complete-request mode and dedicated authenticated endpoints to calculate
normal, via, changed-origin reroute and alternative registered cases. It verifies
full payload retention (including manual pricing and reroute flags), UNVERIFIED cost
reporting, fresh schema-3 restoration, next calculation, mandatory refusal before
a route request, edited-reference refusal and validated cross-case restoration.
Every displayed alternative remains non-navigable; all returned via leg ranges are
checked. A synthetic storage marker and the previous preview survive refusal.

The wrapper requires seven actual Java executions and seven independent validations,
with no fixture-cache writes: this is a fresh-routing workflow, not private-cache
acceptance. The normal factory tests additionally cover 401/403 Origin/authentication
guards, 4 KiB bounds, changed versions/coordinates, mandatory refusal and preservation
of anchor-only legacy case metadata. DOM tests cover altered contexts/cost warnings,
legacy-reference downgrades and late results after programmatic edits.

All three opt-in browser scenarios run under the existing CI command. No production
UI, owner-store data, live GPS/map tiles or physical phone is used. Milestone 3 remains
in progress; these results do not authorize deployment or production migration.

## HTTPS private-cache checkpoint

`test_real_chromium_https_private_cache` adds a fourth opt-in scenario. The harness
generates a temporary localhost self-signed certificate and starts a separate TLS
listener. Fresh browser contexts ignore that test certificate only, while requests
remain restricted to the exact loopback origin. It checks Secure/HttpOnly/Strict
capabilities, independent browsers, changed requests, private reuse with validation,
all fresh bypass paths and invalid-cookie recovery. Seven Java executions/nine
validations are required. No real browser profile or production certificate is used.
See PRIVATE_COMPLETE_CACHE.md for scope and retention limits. The prior HTTP
scenarios still bypass cache reuse and keep their original counts. No production
authentication or trusted-proxy settings changed.

## Owner-scoped device saved-plan checkpoint

`test_real_chromium_owner_saved_plans` adds a fifth opt-in scenario using actual
IndexedDB plus the local HTTP/GH11 stack. It saves only a schema-3 request selector
in a separate database, verifies reload and fresh restoration, separates two
synthetic local scopes, and switches scope after a restore has reached the server.
The completed old result cannot repopulate the next scope. Four Java executions/
validations are required. Synthetic legacy records and a localStorage marker are
unchanged. No device profile or production journey collection is accessed; see
OWNER_SAVED_PLANS.md for the distinction between local scopes and authentication.

The saved-plan scenario additionally binds the actual journey guard to the preview
UI using synthetic sources. A valid context displays a route; changing generation
without notification prevents alternative display, and an explicit refresh during
actual restore prevents late UI completion. Six Java executions and validations
are now required. No physical GPS or production journey is used.


The bound restore race now changes only the synthetic accepted fix and emits its
no-payload subscription callback, rather than manually refreshing the UI or
changing the journey intent. The packaged host adapter forwards that notification
to the viewer. The six-execution/six-validation requirement remains unchanged.
Actual GPS-orchestration notifications are tested separately in deterministic
JavaScript integration with synthetic positions; no physical GPS test was run.
