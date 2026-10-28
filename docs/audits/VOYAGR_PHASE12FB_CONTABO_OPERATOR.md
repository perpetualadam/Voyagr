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

Use a disposable offline checkout with repository Python web/geometry dependencies and Node installed. The current harness uses a minimal Flask fixture around the shipped production response gate with cache-tier stubs; it does not import the full application or initialise a database. Network/SQLite/application DB operations are forbidden during replay. This does not test production cache storage lookups. Do not run it inside a live production worker. See TRANSPORT_COMPATIBILITY for the separately reviewed transport requirement.

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


## Transport compatibility addendum — preserve original captures

The body/query distinction and sidecar schema are specified in [transport compatibility](VOYAGR_PHASE12FB_TRANSPORT_COMPATIBILITY.md). Keep existing bodies/responses/hashes intact and reviewed false until independent review. Every fixture now needs exact recorded method/target, request/response/build/graph bindings, an independent transport evidence SHA and separate sidecar SHA. The raw receipt should retain exact request/response byte hashes and recording hop; canonical object hashes remain the existing immutable fixture hashes.

For URL-only POST, stock GH8 does not merge query hints. Independently reviewed adapter/effective-hint proof or global absence of loaded CH graphs is necessary. If those records are missing, **require new separate captures**, not retrospective guesses. Do not manufacture source/import/oracle receipts.

Fresh bounded capture procedure (operator-run isolated lab only, NOT_EXECUTED here):

1. Verify the approved isolated service, build/graph/import identities read-only. Do not access production, restart, rebuild or swap files.
2. Prepare a **new** private request file with car, original reviewed route points/camera75 hard-zero rule and JSON boolean `ch.disable:true`. Retain old files/hashes untouched. Matching URL query true is optional. This is a fresh request, not a repaired historical capture.
3. Use one metadata GET plus one POST at most, no retry/redirect,2s connect/5s read,30s cooperative batch and2MiB response bound as in Phase12F. Capture the actual prepared/sent request's method, complete origin-form target, exact body bytes, HTTP status and full response bytes privately. In a Requests-based recorder use `PreparedRequest.method`, `.path_url` and `.body`, verify `response.request` matches, and preserve the stream-bounded response before JSON decoding. Do not log auth headers or secrets.
4. Write the **new** complete private record exclusively (no overwrite), with reviewed false and original byte hashes. Store it outside git with restrictive permissions. Independently verify method/target/body/response/status/build/graph bindings and strict JSON (no duplicate keys) before filling the new sidecar/receipt hashes. Do not replace the existing five with new results until independently reviewed as the intended five cases.
5. Leave bundle/sidecar reviewed false while review is pending. When independently approved, copy references/attestations into a separate versioned wrapper, preserving each original request/response object and its established hash. Run the existing offline CLI. Query-only legacy captures without the required independently established effect remain refused.

No fresh capture is authorised on production. No missing transport/source/import/road oracle is filled automatically. Any response change or mismatch with the expected five metrics stays unverified pending review.

Example **fresh-only** one-POST recorder, for the approved isolated lab (NOT_EXECUTED here). `/tmp/phase12fb-new-request.json` must be a separate reviewed request file; this command never overwrites it or an existing output. Obtain metadata/import identity with the separate bounded read-only check first. Do not point this at production. The output is a private, unreviewed recording, not an automatic replay bundle or receipt/oracle substitute.

```bash
umask 077
ISOLATED_GH_URL=http://127.0.0.1:18989 .venv/bin/python - <<'PY'
import base64,hashlib,json,os,time
from pathlib import Path
import requests
from voyagr.utils.graphhopper_acceptance import isolated_origin,checked_request

def unique(pairs):
    value={}
    for k,v in pairs:
        if k in value:raise ValueError('duplicate_key')
        value[k]=v
    return value
try:
    origin=isolated_origin(os.environ['ISOLATED_GH_URL'])
    raw=Path('/tmp/phase12fb-new-request.json').read_bytes()
    if len(raw)>65536:raise ValueError('request_limit')
    body=json.loads(raw,object_pairs_hook=unique)
    checked_request({'points':body.get('points')})
    if body.get('profile')!='car' or body.get('ch.disable') is not True:raise ValueError('required_flags')
    if not any(str(r.get('multiply_by'))=='0' and r.get('if')=='in_camera_area_75' for r in body.get('custom_model',{}).get('priority',[])):
        raise ValueError('review_camera75_hard_rule')
    started=time.monotonic()
    with requests.Session() as session:
        session.trust_env=False
        prepared=session.prepare_request(requests.Request('POST',origin+'/route',params={'ch.disable':'true'},json=body))
        sent=prepared.body.encode() if isinstance(prepared.body,str) else prepared.body
        with session.send(prepared,stream=True,allow_redirects=False,timeout=(2,5)) as response:
            if response.request.method!=prepared.method or response.request.path_url!=prepared.path_url or response.request.body!=prepared.body:
                raise ValueError('request_binding')
            received=bytearray()
            for chunk in response.iter_content(16384):
                if time.monotonic()-started>30 or len(received)+len(chunk)>2*1024*1024:raise ValueError('response_limit')
                received.extend(chunk)
            if time.monotonic()-started>30:raise ValueError('late_response')
            status=response.status_code
    response_raw=bytes(received)
    try:parsed=json.loads(response_raw,object_pairs_hook=unique)
    except ValueError:parsed=None  # Raw error bytes are preserved privately, never called a valid route.
    record={'reviewed':False,'method':prepared.method,'request_target':prepared.path_url,
            'request':body,'response':parsed,'http_status':status,
            'request_body_base64':base64.b64encode(sent).decode(),
            'response_body_base64':base64.b64encode(response_raw).decode(),
            'source_request_file_sha256':hashlib.sha256(raw).hexdigest(),
            'wire_request_body_sha256':hashlib.sha256(sent).hexdigest(),
            'wire_response_body_sha256':hashlib.sha256(response_raw).hexdigest()}
    encoded=json.dumps(record,allow_nan=False).encode()
    descriptor=os.open('/tmp/phase12fb-new-private-record.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(descriptor,'wb') as output:output.write(encoded)
    print('FRESH_CAPTURE_STORED_REVIEW_REQUIRED')
except Exception as error:
    print('CAPTURE_REFUSED_OR_FAILED '+type(error).__name__)
    raise SystemExit(1)
PY
```

The example deliberately requires a dedicated exact camera75 hard rule; a combined reviewed model needs independent rule review rather than weakening that assertion or stripping other restrictions. Keep requested points/restrictions from the intended fixture; do not disable avoidance. Preserve all old capture files separately. Independently compare raw byte hashes, strict parsed objects and intended request/response/status/build/graph binding, then derive canonical fixture and separate transport hashes. Raw recording bytes belong only in the restricted private evidence file. `reviewed:false` must remain until independent review; no successful capture or printed message certifies routing safety or production GO.
