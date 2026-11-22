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
