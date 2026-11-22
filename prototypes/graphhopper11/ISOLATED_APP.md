# Milestone 2: separate Flask-to-Java connection

This factory is separate from the UK app and imports neither `voyagr_web` nor
its engine/fallback modules. It starts no listener and has no production feature
flag. Its first scope is **registered public test cases**, not arbitrary user
journeys or verified general hazard avoidance. Every response retains navigation
unavailable and production migration NO-GO.

## Implemented local path

Authenticated request -> exact registered case and expected graph/source/policy
identities -> operator-owned manifest checks -> bounded local Java subprocess ->
existing read-only GH11 weighting and route validator -> independent Python
transport/trace checks -> JSON and a separate SVG geometry/instruction viewer.

This is the actual GH11 JAR and graph path, not the synthetic callback coordinator.
The Flask factory is exercised with its test client, generated OSM and a real
imported graph. The viewer module is separately DOM-tested. The previous release passed selected-case Pixel 6 browser acceptance; the current
development changes have not been deployed or tested on the physical phone.

The manifest records every graph file hash, source data hash, configuration,
registry, Java runner, Python validator and pinned JAR identity. Graph/configuration/registry/runtime
files are checked before and after routing; the source artifact is hashed during
preparation and checked on startup. Source data is treated as a frozen historical
snapshot, not current hazard coverage. A registry-declared source checksum must
match the manifest. The manifest binds supplied local files; it is **not** a
cryptographic proof of import lineage or complete hazard association. Preserve
operator import evidence and mount these files read-only for a future service.

The client can select a registered case only. It cannot supply coordinates, edge
keys, custom model expressions, source paths, budgets or coverage assertions.
A stale version request is refused. Graph modifications and runtime/registry
changes refuse calculation. The server independently reconstructs blocked keys
from returned source associations and registered rule selections, checks every
candidate's complete intervals, exclusions, geometry, metrics and instructions,
and relies on the pinned Java validator for graph access/connectivity/turn checks.
It does not disguise synthetic coverage as real evidence.

One subprocess at a time; no alternate-engine fallback. A process-local cache
retains at most eight raw public-fixture reports for 30 seconds. Every reuse
rehashes the graph/runtime and independently revalidates all candidates; no
validated verdict or client-supplied route is trusted. Nothing is persisted. Each temporary
request directory is removed after use. Java uses one active processor, configured
heap 512/1024/2048/4096 MB, a maximum 120-second transport timeout (default 60),
existing per-route node/time limits and a 2 MiB captured-output cap. Timeout/output
excess kills and reaps its process group. The Python boundary suppresses raw
engine logs and internal paths in HTTP failures. These are process controls, not
an OS sandbox: a future deployment must also use a non-root, network-isolated,
resource-limited container. Rehashing graphs on every request is intentionally
conservative and unbenchmarked.

Basic authentication uses a separate operator-provided secret of at least 32
characters. No default credential is accepted. There are no accounts, cookies,
browser local storage, persistent route history or analytics. Requests and route
responses use no-store; script execution is same-origin, cross-origin JSON posts
are refused, and instructions render as text. No password, engine output or
coordinates are logged by this code. Authentication requires TLS if accessed
beyond a loopback tunnel. Never reuse the production owner password.

## Local verification

```sh
GH11_PROTOTYPE_JAR=/path/to/pinned/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_isolated_app.py
npx jest static/js/__tests__/gh11-isolated-viewer.test.js --runInBand
```

Tests cover actual primary/alternative/continuous-via/changed-departure requests,
no-route refusal, graph immutability, authentication, request allowlisting,
version mismatch, cross-origin/body limits, changed graph refusal, malformed
provider evidence, unsafe third alternatives, transport timeouts/output limits,
geometry display, route switching and text-only instruction rendering. The
runtime-shim timeout/output tests are fault injection, not routing benchmarks.
No live routing infrastructure is used and no listener starts in these tests.

Operator-only manifest preparation (new mode-0600 file; refuses overwrite):

```sh
python -m prototypes.graphhopper11.prepare_app_manifest \
  --jar /path/to/pinned.jar --graph /path/to/existing/graph \
  --config /path/to/config.yml --registry /path/to/registered-cases.json \
  --source /path/to/the/frozen-source.osm.pbf --output /new/private-manifest.json
```

This command does not import a graph, download data, start a server, change
credentials or write production configuration. No VPS command is requested yet.
The factory is `create_app(manifest_dict, password=separate_secret, heap_mb=...)`.

## VPS2 accepted preview release and subsequent development

The operator completed the approved milestone-2 service and Pixel 6 browser checks;
see [VPS2_ACCEPTANCE_2026-11-22.md](VPS2_ACCEPTANCE_2026-11-22.md). The accepted
service stays on its recorded image and schema-1 manifest. Production and GH8
remain unchanged.

The current branch adds opt-in strict browser gates and schema-2 browser-script
binding. These changes are development-only; see [STRICT_MODE.md](STRICT_MODE.md).
The [container package](container/README.md) preserves historical release evidence
and the original proposal for reference. A future update needs a new tested image,
a newly prepared manifest and reviewed update steps. No new physical-phone
acceptance or strict navigation authority is claimed.

## Registered settings and bounded evidence reuse (milestone 3 development)

The cases endpoint exposes server-owned profile, alternative request, motorway
exclusion, mandatory association selections and directional scope. The viewer
shows these in a details panel, submits the exact selected settings and refuses a
mismatched response. HTTP clients may omit the settings for compatibility with
existing operator checks; this always uses the unchanged registered case, never
an arbitrary preference set. Supplied settings must match exactly, including
boolean types, with unknown fields rejected before Java/cache access.

A request fingerprint binds the entire registered case (including ordered visits)
and graph/source/policy versions. Cache hits cannot cross those identities. Raw
reports expire after 30 seconds, are copied on read/write, revalidated for settings,
blocks and every candidate, and evicted on validation failure. Graph checks still
run before and after reuse. Cache lifetime is a resource limit, not evidence of
hazard freshness. Source data remains a frozen snapshot; navigation stays disabled.
This is a dedicated preview cache, not integration with production RouteCache,
saved plans, arbitrary user settings or general navigation authority.

Local validation and packaging limitations: [SETTINGS_CACHE_LOCAL_EVIDENCE.json](SETTINGS_CACHE_LOCAL_EVIDENCE.json). CI results belong to the exact PR head and are separate from these local results.

Registered reference restoration and its acceptance limits: [RESTORE_PLANS.md](RESTORE_PLANS.md). Restoring never trusts saved geometry or a saved compliance verdict.

The additional `app_preview` contract and real-instruction export are described in [RESPONSE_ADAPTER.md](RESPONSE_ADAPTER.md). It remains preview-only and does not grant navigation authority.

Canonical policy preflight, explicit-rule routing and schema-2 reference scope are documented in [SETTINGS_COMPILER.md](SETTINGS_COMPILER.md). Legacy envelopes remain bounded at 1 KiB; explicit policy envelopes allow 4 KiB for all rule categories. The compiler does not grant navigation authority.

Temporary rule controls, preflight/response binding and schema-2 viewer restoration are documented in [POLICY_UI.md](POLICY_UI.md). The viewer and HTML are now manifest-bound; the real UK settings and stored journeys remain unchanged.
