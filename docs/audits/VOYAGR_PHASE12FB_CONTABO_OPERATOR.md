# Phase12F-B — Operator commands

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** All commands below are NOT_EXECUTED on Contabo here. No configured private-network/VPN grant or raw12E capture bundle was available. Production `vmi2887070` must not be accessed or modified. The isolated lab is `vmi3072171`; verify isolation independently, not merely from a port number.

## 1. Read-only lab identity

In an approved isolated checkout, inspect `git rev-parse HEAD`, source/candidate SHA256, existing graph import receipts and fresh bounded `/info` output. Follow Phase12F operator procedure for one bounded local GET and existing Phase12C graph/import binding. Record GH8.0/car, December2025 GB source hash/date, build, profile/config/encoded values, graph revision and dataset identity. Do not dump environment/service configurations or credentials. Do not restart/reimport/rebuild anything. Only original/candidate **matched dataset+graph pairs** may be compared.

Original area SHA: `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`.
Candidate area SHA: `6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7`.

## 2. Obtain real captures privately

Retrieve the five actual12E request/native response pairs and status codes from existing lab evidence, not invented coordinates or reconstructed summaries. Keep originals private with `umask 077`, outside git. Preserve raw request points, actual native `snapped_waypoints`, response geometry/precision and camera hard rule. Review graph/road/import/source/oracle receipts. The chat's summary alone cannot populate them.

```bash
umask 077
cp scripts/fixtures/phase12fb/recorded-bundle-template.json /tmp/phase12fb-private-bundle.json
```

The template intentionally has `reviewed:false`, null payloads/hashes and will be refused. Operator fills five unique IDs0–4; original native JSON request/response objects; actual `http_status`; canonical request/response SHA; and engine metadata. Dataset hash must match `--areas`. `graph_sha256`, `import_receipt_sha256`, `engine_build_sha256`, `road_source_sha256`, `oracle_sha256` bind reviewed evidence. Hashes/`reviewed:true` are attestations, not automatic engine provenance. Never label generated cases RECORDED.

Canonical content hash for each embedded request/response is:

```python
hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
```

Rehashing alone does not turn an edited body into a genuine capture; retain original byte hashes privately in the reviewed receipt. Keep the actual raw coordinates and native metadata. Default native precision is GH8 precision5 unless a recognized encoded multiplier declares precision6. Unknown/missing/malformed native snaps cannot pass as the five successful displaced-route captures.

## 3. Replay existing captures — no engine calls

Use a disposable offline checkout with repository Python web/geometry dependencies and Node installed. The harness imports the real Flask app and uses deterministic mocked cache backends; do not run it inside a live production worker or against production databases. Backend import may initialise only the disposable local development DB. All outbound HTTP during cache replay is explicitly refused.

```bash
.venv/bin/python scripts/replay-phase12fb-origin.py
# Prints five NOT_TESTED rows without captures; zero engine calls.
.venv/bin/python scripts/replay-phase12fb-origin.py \
  --bundle /tmp/phase12fb-private-bundle.json \
  --areas artifacts/camera-areas/phase12b/camera_areas_candidate.geojson \
  > /tmp/phase12fb-sanitized-recorded-results.json
```

Use `--areas camera_areas.geojson` only for genuine original-graph captures whose receipt binds that original. The CLI accepts only the known matched area SHA. Results omit private coordinate/model bodies and per-journey hashes; exact displacements are operator diagnostics, not production telemetry. A failed input/decoder/browser/cache stage returns nonzero and remains unverified. Node receives private route data via stdin, never command arguments. `PASS_RECORDED_REPLAY` means existing captures passed production assessment/cache/browser replay, **not a fresh engine run or legal safe exit**. No automatic production GO is possible.

## 4. Fresh live requests — separately approved lab only

The replay tool has no HTTP engine mode. If fresh lab capture is needed, use the bounded one-request Phase12F procedure after reviewing this exact request/service identity; save its actual status/native JSON privately and create a **new** reviewed receipt identifying that live execution. Do not relabel this task's offline report LIVE. Literal-loopback high ports are guarded by `isolated_origin`; its guard does not prove a service is disposable. No remote production URLs, credentials, redirects or public fallback.

Run one fixture at a time, no concurrent query loop; max2 HTTP calls per metadata+fixture capture,30s cooperative budget,2s connect/5s read,2MiB response cap, no retry. Stop on unexpected status/resource pressure/identity mismatch. Check all mandatory rules remain; never remove exclusions to get200. Use existing isolated engine instrumentation/read-only `ps` for verified lab PID CPU/RSS. Record n/median/p95/max, cold/warm and graph/build/data identities. HTTP duration is not compiler-only time.

The thirteen slots in `scripts/fixtures/phase12fb/acceptance-plan.json` are **unreviewed plans**, not graph-backed fixtures. Fill/review legal road/edge/direction/topology oracles and private coordinates, baseline/restricted/native responses and expected no-path/error outcomes. Include origin/destination inside, endpoint/route boundaries, near miss, one-way/divided/disconnected roads, all blocked, genuine no-path, validation failure, deadline exhaustion and inside recalculation. Whole-segment and edge checks from12C remain separate; origin continuity cannot certify enforcement.

## 5. Device/application acceptance and matched rollback review

In an approved isolated app/PWA, replay actual captures through initial preview, manual selection, Start Navigation, moving GPS reroute, cache hits, multi-stop/current visits, stale/offline resume, cancellation/late result and voice/progress pausing. Verify quarantined routes are not applied and cannot be confirmed into navigation. Verify eligible GH remains first and each eligible alternative retains its own limitations. No physical-device result was obtained here.

Review backup/rollback for the original **dataset+compatible imported graph+profile/config identity** together. Candidate deployment must use its matched imported candidate graph. A source-only revert reopens evidence gaps; a GeoJSON-only swap against the old graph is not an acceptable proposal. No backup restoration, swap, service restart, deployment or production change is authorised by this procedure. Share redacted aggregate results, not private fixtures/coordinates, before any separate release decision.
