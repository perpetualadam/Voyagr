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
imported graph. The viewer module is separately DOM-tested. An actual browser
connected to VPS2 has not yet been tested.

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

One subprocess at a time; no caching or alternate-engine fallback. Each temporary
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

## VPS2 service proposal — NOT EXECUTED

A reviewable deployment package still needs an immutable Python/JDK image and
WSGI entrypoint. Build/test those locally first. Proposed operational boundary:

- New dedicated directory, container and temporary writable work area; no changes
  to existing GH8, phone-test, Nominatim, tileserver or production app processes.
- Bind only an unused loopback port (candidate 18511; availability unverified).
  Use an SSH tunnel initially; no DNS, public port or Nginx authentication edits.
- Read-only graph, source, pinned JAR, config, registry and application code;
  unprivileged UID, dropped capabilities, no-new-privileges and no outbound network.
- Candidate limit: one CPU, 6 GiB total memory/no extra swap, 4 GiB Java heap,
  bounded PIDs/tmpfs, one WSGI worker and one request at a time and no automatic restart initially.
  Capacity and compatibility with other VPS2 services remain unmeasured.
- Generate a separate random secret in a private external file. Do not put it in
  Git, command arguments, screenshots, pasted output or image layers.
- Verify startup version hashes, anonymous 401, authenticated case list, validated
  route and viewer. Repeat preserved refusal cases; verify graph hashes unchanged.
- Rollback: stop/remove only this new container and tunnel. Keep graph/source and
  GH8 intact. No production routing flag is involved.

Before requesting approval to start this service: present the exact image digest,
file mounts, port/resource checks, startup command, secret-file permissions,
health checks and stop command. None of those infrastructure actions has been
performed here. Milestone 2 remains in progress until an approved VPS2 app route
and viewer are observed. Browser strict Start semantics, real user settings,
source freshness, authenticated association compilation and migration acceptance
remain later work.
