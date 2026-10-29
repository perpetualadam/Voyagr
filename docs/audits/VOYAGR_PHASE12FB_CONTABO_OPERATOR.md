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
        prepared=session.prepare_request(requests.Request('POST',origin+'/route',params={'ch.disable':'true'},json=body,headers={'Accept-Encoding':'identity'}))
        sent=prepared.body.encode() if isinstance(prepared.body,str) else prepared.body
        with session.send(prepared,stream=True,allow_redirects=False,timeout=(2,5)) as response:
            if response.request.method!=prepared.method or response.request.path_url!=prepared.path_url or response.request.body!=prepared.body:
                raise ValueError('request_binding')
            received=bytearray()
            for chunk in response.raw.stream(16384,decode_content=False):
                if time.monotonic()-started>30 or len(received)+len(chunk)>2*1024*1024:raise ValueError('response_limit')
                received.extend(chunk)
            if time.monotonic()-started>30:raise ValueError('late_response')
            status=response.status_code
            encoding=response.headers.get('Content-Encoding','identity')
    response_raw=bytes(received)
    try:
        if encoding.strip().lower() not in ('','identity'):raise ValueError('encoded_response_needs_review')
        parsed=json.loads(response_raw,object_pairs_hook=unique)
    except ValueError:parsed=None  # Raw error bytes are preserved privately, never called a valid route.
    record={'reviewed':False,'method':prepared.method,'request_target':prepared.path_url,
            'request':body,'response':parsed,'http_status':status,'response_content_encoding':encoding,
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

The example deliberately requires a dedicated exact camera75 hard rule; a combined reviewed model needs independent rule review rather than weakening that assertion or stripping other restrictions. Keep requested points/restrictions from the intended fixture; do not disable avoidance. Preserve all old capture files separately. Independently compare raw byte hashes, strict parsed objects and intended request/response/status/build/graph binding, then derive canonical fixture and separate transport hashes. The recorder requests identity encoding and retains undecoded response entity bytes (excluding HTTP transfer framing); an unexpected content encoding stays raw/unparsed pending review. Raw recording bytes belong only in the restricted private evidence file. `reviewed:false` must remain until independent review; no successful capture or printed message certifies routing safety or production GO.

## Independent offline road diagnostic

See [the technical audit](VOYAGR_PHASE12FB_INDEPENDENT_ROAD_ORACLE.md) for the
supported topology subset, exact schemas and unverified coverage limitations.
This procedure authorizes no server access. Use existing private exports/captures
and independently reviewed receipts; do not download OSM or contact a routing engine.
Install the existing `requirements-geometry.txt` in the disposable checkout first.
Keep private inputs outside git, with `umask 077`. The tool only reads them.

The private specification is an object with `fixture_id`, `origin`, `target`, and an
optional `candidate` list. Endpoints each have `way`, zero-based `segment`, ordered
`nodes:[start_id,end_id]` and `coordinate:[latitude,longitude]`. Origin must match
the recorded requested origin; target must match the recorded native snapped origin.
Use genuine independently checked IDs/coordinates, not chat summaries. Each candidate
entry is `[way_id,segment_index,+1_or_minus_1]`; start with the actual projected
origin partial segment, never a downstream junction. The separate reviewed binding
receipt must contain all fields documented in the audit. No fill-in receipt is
provided: identities must come from genuine private evidence.

```bash
umask 077
.venv/bin/python scripts/diagnose-phase12fb-road-oracle.py \
  --export /tmp/private-osm-export.json \
  --capture /tmp/phase12fb-private-bundle.json \
  --receipt /tmp/private-independent-binding.json \
  --specification /tmp/private-segment-specification.json \
  > /tmp/private-road-diagnostic.json
```

Stdout contains sanitized classifications/counts/digests and projection distances;
stderr contains a fixed human summary. Neither includes coordinates, OSM tags,
paths, candidate edges or response bodies. Exit 0 means diagnostic execution only;
exit 2 means refusal/unavailability. Every output stays unreviewed and navigation
unauthorized. Treat even sanitized hashes as private evidence until reviewed.

To attach a diagnostic to the existing replay, add `--oracle-export`,
`--oracle-receipt`, `--oracle-specification` to its existing `--bundle`/`--areas`
command. All three are required together. Normal replay still needs its independently
accepted `oracle_sha256`; the standalone diagnostic can prepare evidence before
that acceptance reference exists and never generates it. Missing reviewed evidence
is a blocker, never a reason to fabricate a hash or modify an old capture.

## Private provisional topology evidence inspector (PR #361 follow-up)

Use a disposable local checkout with the pinned geometry requirements installed.
This is a separate operator-only entry point. It needs only the existing export and
exact-endpoint specification; it does **not** need reviewed capture/provenance or an
accepted oracle reference. That independence permits inspection, not approval.
It uses the same bounded BFS and representative path as the public diagnostic.

Before running, confirm the private evidence directory is outside **every Git
checkout/worktree** and has a private user-only ACL. On Windows the file inherits
NTFS directory ACLs; POSIX mode 0600 is not a Windows ACL guarantee. Use a trusted
local directory whose parent directories other users cannot replace. UNC/network
paths are refused. No report is uploaded or committed by the tool.

From the repository root, run this exact PowerShell command (choose a new output
filename if it already exists; do not overwrite or delete earlier evidence):

```powershell
& ".\.venv\Scripts\python.exe" ".\scripts\inspect-phase12fb-road-oracle-private.py" `
  --export "C:\Users\Brian\Documents\Voyagr-Private-Acceptance\fixture-0-oracle-export.json" `
  --specification "C:\Users\Brian\Documents\Voyagr-Private-Acceptance\fixture-0-oracle-spec-unreviewed.json" `
  --output "C:\Users\Brian\Documents\Voyagr-Private-Acceptance\fixture-0-private-topology-inspection-unreviewed-01.json"
```

The existing specification schema is unchanged: `origin` and `target` each name a
way, zero-based segment index, ordered node pair and coordinate. Optional candidate
validation is unchanged. An optional `export_sha256` must equal the exact export
bytes if present. No coordinate is printed or copied into the report. The tool
cannot verify association with native captured endpoints without the separate
formal capture-binding procedure. Preserve the private source files unchanged.

Success prints only `PRIVATE_PROVISIONAL_TOPOLOGY_ONLY_REPORT_CREATED`; refusal
prints only `PRIVATE_INSPECTION_REFUSED` to stderr and exits 2. Exit 0 means the
private report was written, not acceptance. The absolute output path is required;
the parent must already exist. The inspector refuses repository paths, worktrees,
bare repositories, existing files and existing leaf symlinks. POSIX creation uses
0600 and exclusive creation; do not place output in a shared/replaced directory.
A failed write may leave a restricted partial file; it is not a usable report and
will not be overwritten by another invocation.

Open the report privately. It is labelled `PRIVATE_PROVISIONAL_TOPOLOGY_ONLY` with
`capture_binding:NOT_CHECKED`, `independent_approval:false`, `reviewed:false`,
`navigation_authorized:false`, `acceptance:UNVERIFIED`, `PRODUCTION_NO_GO`.
Review `PATH_TRANSITION` records in `path_index` order. They identify way, segment,
direction, ordered node pair, real departure/arrival node references or a virtual
position marker, incoming edge, uncertainty source and applicable supported turns.
No virtual projection fraction or coordinate is emitted. Compare referenced tags
with the unchanged export; object hashes use canonical sorted compact JSON, whereas
export/specification hashes bind exact file bytes. These are evidence references,
not an accepted `oracle_sha256`.

Review every global unresolved relation as well as local path evidence. A locatable
via node outside this path does not establish legal irrelevance or remove the global
guard. Conditional expressions, vehicle exceptions, incomplete members, unsupported
via-way effects and physical applicability still need independent human review.
Routing-tag allowlisting and conservative value redaction may withhold free-form,
credential-like or coordinate-like text. Use object/tag/value hashes to consult
those originals privately; a redaction is not interpretation or permission.

The report has explicit record/byte/member limits and omission counts. If `truncated`
is true, missing records are not evidence of absence. If the search is exhausted or
finds no path, no representative path is invented; endpoint segment evidence is
provided separately. Never copy the private report into GitHub, CI logs or public
chat. Share only the existing sanitized public diagnostic after review. See the
[technical audit](VOYAGR_PHASE12FB_INDEPENDENT_ROAD_ORACLE.md) for classifications,
limits and the compatibility validation.

## Alternative motorcar plausibility investigation

The ordinary potential path can include normally non-motorcar roads as uncertain
traversals. That is not proof of a passenger-car route. Use the separate offline
policy below to investigate a stricter subset without changing the authoritative
oracle. It still needs only the local export and exact-endpoint specification;
no reviewed provenance or accepted oracle reference is required for investigation.
Do not access a server or obtain fresh routing/OSM data for this procedure.

From the repository root, with the same secure local private folder/ACL precautions
as the inspector above, run this PowerShell command:

```powershell
& ".\.venv\Scripts\python.exe" ".\scripts\investigate-phase12fb-motorcar.py" `
  --export "C:\Users\Brian\Documents\Voyagr-Private-Acceptance\fixture-0-oracle-export.json" `
  --specification "C:\Users\Brian\Documents\Voyagr-Private-Acceptance\fixture-0-oracle-spec-unreviewed.json" `
  --private-output "C:\Users\Brian\Documents\Voyagr-Private-Acceptance\fixture-0-motorcar-investigation-unreviewed-01.json"
```

Omit `--private-output` for sanitized aggregate JSON only and no report file. With
that option the same public JSON goes to stdout, and a NEW exclusive private file
contains the evidence for the policy's representative path. Existing files and
Git destinations are refused using PR #362's writer. The output folder must exist,
be outside all Git repositories, and have a private Windows ACL. Choose a fresh
filename on later runs. No source file/capture/export is modified. No endpoint
coordinates, virtual fractions, geometry, HTTP bodies or credentials are output.

Interpret `classification` as follows:

| Classification | Meaning |
| --- | --- |
| `POTENTIAL_MOTORCAR_PATH_IN_EXPORT` | A non-empty path exists under the explicitly provisional motorcar policy. It is not legally verified or navigation-authorized. Review every remaining condition. |
| `NO_MOTORCAR_PATH_FOUND_IN_EXPORT` | The policy found no path in the bounded export. Pruning, unknown evidence and extract boundaries can exclude real connections. This is not real-world disconnection. |
| `SEARCH_INCOMPLETE` | The potential search hit STATES or EDGE_EXAMINATIONS limits; no no-path conclusion follows. |
| `EVIDENCE_INSUFFICIENT` | Invalid/missing/conflicting endpoint/export evidence, a failed search with known missing-node coverage, or zero-transition evidence cannot answer the question. CLI input/output refusals also exit 2 without exposing details. |

Exit 0 means a diagnostic completed, including a bounded no-path or incomplete-search
result; inspect the classification, not the exit code alone. Exit 2 is insufficient
input/output evidence or refusal. `--max-states` retains the existing 1..200000
bound (default 100000). No limit increase or repeated search guarantees completeness.

The policy permits default plausibility only on the ordinary road-class allowlist.
Footways, pedestrian streets, steps, paths, cycleways, bridleways, tracks and generic
`road` require explicit unconditional `motorcar=yes/designated/permissive` applying
to the direction. Broader motor_vehicle/vehicle permission alone is deliberately
insufficient for that exception. Construction/proposed/unknown classes remain
excluded even with a positive access tag. Directional access precedence remains
access -> vehicle -> motor_vehicle -> motorcar. Private, destination, delivery,
customer and unknown permissions are excluded unless a more specific supported
permission overrides them. Conditional access, unsupported access qualifiers,
ambiguous direction, all barrier tags (including kerb/gate/bollard) and ambiguous
supported turn handling are excluded. This is conservative investigation policy,
not a modification of OSM rules or the authoritative oracle.

Dimensional/physical evidence such as `maxheight=default` may remain on a provisional
path and is explicitly flagged as unsupported clearance/applicability evidence.
Numeric dimensions are not compared with an invented vehicle specification.
An explicit motorcar exception on normally non-motorcar infrastructure also leaves
physical suitability unverified. All unresolved relation guards remain active,
including relations outside the selected path. Review `remaining_conditions` and
`representative_uncertainty`; access uncertainty overlaps physical/conditional
uncertainty in the existing evaluator and is not solely an access-tag verdict.

The new policy does not validate a supplied candidate or use its first edge as a
start. Run the unchanged ordinary oracle for candidate validation. The private
report uses `policy_search_report`, not `public_diagnostic`, to prevent confusing
this filtered graph with the authoritative report. Its root scope remains
`PRIVATE_PROVISIONAL_TOPOLOGY_ONLY`, and `motorcar_investigation` contains the public
aggregate summary. Capture binding is NOT_CHECKED; all review/navigation/acceptance
flags stay false/UNVERIFIED and **PRODUCTION_NO_GO**.

No private fixture 0 run is claimed here. A new plausible route cannot waive the
reported 46.31 m origin displacement or Voyagr's two-metre integrity gate.

## Prepare a private independent-review package

This is metadata-only preparation, not independent approval or replay acceptance.
Original captures, exports, receipts and reports remain in the existing evidence
folder. The tool never copies their bodies, modifies reviewed flags, creates an
accepted oracle reference, uploads evidence or creates a ZIP.

Use a trusted, idle, local evidence directory outside Git. Close editors/capture
writers and stop concurrent indexing of that evidence. Both the evidence folder
and output parent must already have private Windows NTFS ACLs; the output inherits
those ACLs. Do not create the output directory first: it must be new. The output
must be a sibling/separate directory, never inside the evidence tree.

From the repository root, run this exact PowerShell command:

```powershell
& ".\.venv\Scripts\python.exe" ".\scripts\prepare-phase12fb-review-package.py" `
  --evidence-directory "C:\Users\Brian\Documents\Voyagr-Private-Acceptance" `
  --output-directory "C:\Users\Brian\Documents\Voyagr-Phase12FB-Review-Unreviewed-01"
```

Choose a fresh output suffix for subsequent runs. Do not delete or overwrite old
review packages to make a run succeed. The output is five files only:

- `evidence-manifest.json`: safe paths relative to the original evidence root,
  byte sizes, recomputed SHA-256 fingerprints, categories and availability.
- `verification-results.json`: byte/JSON/object/binding observations and explicit
  authenticity/approval limitations.
- `reviewer-checklist.md`: evidence availability, machine observations,
  unauthenticated operator assertions, unresolved/missing evidence and independent
  review still required for each topic.
- `unresolved-findings.json`: unreviewed/missing/invalid/conflicting/unsupported
  observations; no automatic restriction resolution.
- `package-summary.md`: aggregate package scope and PRODUCTION_NO_GO status.

Stdout is only `PRIVATE_REVIEW_PACKAGE_CREATED_UNREVIEWED_PRODUCTION_NO_GO`.
Refusal is only `PRIVATE_REVIEW_PACKAGE_REFUSED` on stderr, exit 2; argument/errors
never echo private paths or evidence. Exit 0 means a metadata package was created,
**not that evidence is complete or accepted**. Inspect all findings privately.
A failed write can leave a restricted partial output directory; it is incomplete
and will not be overwritten. No approval or automatic repair command is provided.

### Read-only and filesystem requirements

On Linux, directory enumeration and file hashing use no-follow O_NOATIME handles.
The evidence owner must have the required no-atime capability; there is no ordinary
read fallback and no attempt to restore timestamps after reading. Source file and
directory timestamps/identity/permissions are checked around reads. Symlinks,
hardlinks, reparse points, special files, cross-device subtrees, nested repositories,
unsafe/nonportable relative names, case-conflicting paths and overlapping input/output
are refused. No Git command is executed by the packaging CLI.

On Windows, local drive handles use GENERIC_READ plus FILE_WRITE_ATTRIBUTES solely
for SetFileTime's documented all-ones **per-handle access-time-update suppression**.
No actual timestamp is assigned, no data is written and no source ACL is changed.
Directory entries are enumerated through that same frozen handle. If the source
policy denies the attribute capability, or access-time preservation cannot be
provided, the run is refused; do not weaken original evidence permissions merely
to satisfy it. Actual Windows filesystem/ACL execution has not been tested here.
A separately authorised forensic snapshot/workstation procedure may be needed.

Windows UNC and mapped remote/unknown drives are refused. Linux requires a known
local filesystem type from mount metadata; network/FUSE/unknown types are refused.
Other platforms without the implemented no-atime guarantee are unsupported. This
checks the software filesystem boundary, not physical storage/driver authenticity.
Use trusted private parents: concurrent malicious replacement, privileged OS users,
external writes and filesystem-driver behaviour are outside this tool's guarantee.

### Scope, matching and limits

The scanner inventories regular files recursively; it does not follow references
inside documents. Known Phase12FB filenames/prefixes identify the export,
specification, reports and three receipts/manifests. Body-hint capture selection
is defined narrowly below; directory membership alone is insufficient. Supporting
roles use graph-manifest/import-receipt/engine-provenance/profile-config/road-source/
camera-dataset/offline-replay/application-acceptance/device-acceptance name fragments.
Unknown names remain inventoried as supporting_unclassified; a missing role can
mean **not identified**, rather than proof that the underlying file does not exist.
An authorised reviewer must resolve naming/schema ambiguity.

An optional additional local JSON index can explicitly identify existing artifacts:
`kind:PHASE12FB_EVIDENCE_INDEX`, `schema_version:1`, and an `artifacts` array whose
entries have `role`, `path` (forward-slash relative path) and `sha256` (expected
raw-byte digest). Allowed roles are those listed in the manifest availability table,
plus capture_bundle/supporting_unclassified. This index is only a declaration;
referenced bytes are matched against the inventory, never opened outside it.
Duplicate/conflicting references are reported. Absolute paths, traversal, URLs and
unsafe references are rejected as bindings and recorded without copying their
values. Historical server paths/URLs in unknown receipts are not executed or
resolved; their meaning still needs human review. Do not edit originals to make
index or binding checks match.

The tool checks strict JSON (including duplicate/nonfinite rejection), documented
export/specification/raw-bundle byte bindings, known capture object and embedded
wire-body hashes/JSON pairing, transport sidecar hashes/claim consistency, literal
POST/body/query declarations and recording-hop presence. Exact ordered endpoint
segments are checked against the supplied OSM parser; requested/native snapped
origins are compared only when a supported receipt declares a matching fixture ID
and canonical request/response pair. These are equality/structure observations,
not recording-hop, installed-engine or legal-connectivity attestations. Query-only
POST requires installed-effect review; HTTP200 never establishes ch.disable.

Unknown receipt schemas, graph hash conventions, installed build/profile/config,
import history, source date/extraction completeness, camera dataset enforcement,
vehicle exceptions/conditional barriers, device acceptance and the separately
accepted oracle reference are not invented. Import/graph identity hashes are not
assumed to equal a receipt/manifest file hash unless a documented reference supports
that comparison. Consistent claims remain unauthenticated. Truncated diagnostics
remain explicitly incomplete. Operator-reported 94-transition connectivity, five
unresolved relations and approximately 46.31 m displacement are not approved by this
packager. The two-metre integrity failure is not waived.

Hard traversal limits: 512 files, 128 directories, depth 8, 2,048 entries. Hashing
limits: 512 MiB/file and 2 GiB total. JSON decoding: 32 MiB/file and 64 MiB total.
Oversized/unparsed artifacts get unavailable-check states and null fingerprints
where no hash was computed, never fabricated values. Verification is capped at
8,192 observations, JSON nesting depth 64, and 200,000 reference-scan visits per artifact. Generated files
are capped at 16 MiB total. Exceeding hard traversal/check/output bounds refuses the
run rather than presenting a complete inventory. Source bytes are never copied.

Keep the entire package private: relative filenames and fingerprints can identify
evidence even without bodies. Deliberately share it and access to unchanged originals
only with an authorised independent reviewer. Review outcomes belong in a separate,
scoped review record; this package has no conversion-to-approved mechanism.
**PRODUCTION_NO_GO** remains mandatory.

## Diagnose a Windows review-packager refusal

A healthy NTFS volume, non-reparse root folders and a full-control ACL do not locate
the failing guard. They do not establish that the running process can open every
source entry with the packager's exact rights, freeze access-time updates, enumerate
through the protected handle or obtain consistent metadata from path/handle APIs.
Medium integrity alone is not a failure. An inherited CodexSandboxUsers read/execute
ACE is not by itself a deny; restricted-token checks, descendant permissions,
sharing state or filesystem/security filters can still affect effective access.
None of these is established as the operator's actual cause here.

Use the same standard, **non-elevated** PowerShell context that produced the refusal.
Do not switch tokens/sandbox policy to get past the guard. Do not change ACLs,
CodexSandboxUsers permissions, token restrictions, last-access policy or source
attributes, and do not retry with weaker/no-atime protection. From the repository
root run this exact command with a NEW output directory:

```powershell
& ".\.venv\Scripts\python.exe" ".\scripts\prepare-phase12fb-review-package.py" `
  --evidence-directory "C:\Users\Brian\Documents\Voyagr-Private-Acceptance" `
  --output-directory "C:\Users\Brian\Documents\Voyagr-Phase12FB-Review-Unreviewed-Diagnostic-01" `
  --diagnose-refusal
$LASTEXITCODE
```

If that output already exists, choose an unused suffix; do not delete/overwrite it.
This attempts the **same** protected packaging workflow, not a dry run or a separate
probe. On refusal it exits 2, prints the original PRIVATE_REVIEW_PACKAGE_REFUSED
line to stderr, then one bounded JSON diagnostic line. With no explicit option,
the default message/exit behaviour is unchanged. If the attempt succeeds, it creates
the normal metadata-only package, prints the unchanged success line and exits 0;
there is no additional scan, refusal JSON or automatic approval.

Illustrative diagnostic only, **not an observed result from the operator's PC**:

```json
{"diagnostic_schema_version":1,"outcome":"REFUSED","category":"WINDOWS_NO_ATIME_CAPABILITY","operation":"WINDOWS_FREEZE_ATIME","reason":"ACCESS_DENIED","reviewed":false,"navigation_authorized":false,"production":"PRODUCTION_NO_GO"}
```

Only category/operation/reason enums and safety fields are output. No private paths,
filenames, entry indices, OSM IDs, coordinates, stack traces, raw OS errors, credentials
or evidence bodies are emitted. Sharing just this JSON line is sufficient for the
next diagnosis; do not upload private evidence, raw traces or ACL dumps. The first
failing operation is reported; later guards may not have been reached.

| Category | Interpretation and safe next step |
| --- | --- |
| `ARGUMENTS_INVALID` | Parser rejected arguments; use the exact documented flags/quotes. No source was inspected by argument parsing. |
| `PATH_POLICY`, `INPUT_UNAVAILABLE` | A local absolute no-traversal path or accessible directory requirement failed. Verify the intended location privately without changing original evidence. A false directory check is not proof of physical absence. |
| `STORAGE_POLICY`, `NO_ATIME_CAPABILITY` | Local storage/capability validation failed. Do not bypass storage or no-atime requirements. |
| `REPOSITORY_POLICY` | An input/output/nested location is protected as Git. Use a separately authorised private evidence/output location; never force writing into the repository. |
| `SOURCE_ACCESS_DENIED` | The actual source open/stat/read operation was denied. `WINDOWS_OPEN_FILE` or `WINDOWS_OPEN_DIRECTORY` requests GENERIC_READ plus FILE_WRITE_ATTRIBUTES; a family denial cannot identify the responsible ACL/token/filter. Do not grant rights/remove restrictions/elevate as a workaround. |
| `WINDOWS_NO_ATIME_CAPABILITY` | SetFileTime's per-handle last-access suppression failed after opening the handle. The reason distinguishes denial, unsupported operation, invalid parameter or other OS family. Stop; no ordinary-read fallback is permitted. |
| `SOURCE_BUSY` | Sharing/lock conflict was returned. Do not alter sharing flags or source files; arrange an authorised quiescent review context. |
| `WINDOWS_SOURCE_OPEN`, `WINDOWS_BACKEND_UNAVAILABLE` | Other Windows handle/backend failure. Treat the operation/reason as implementation/environment evidence, not proof of source corruption. |
| `WINDOWS_DIRECTORY_ENUMERATION`, `WINDOWS_DIRECTORY_FORMAT` | The protected directory API or returned record/encoding was rejected. Requires implementation/filesystem review; no fallback enumeration is introduced. |
| `UNSAFE_FILESYSTEM_ENTRY` | Existing guard rejected a reparse/symlink, hardlink/special/cross-device object, nonportable name or case collision. Root-folder checks do not cover all entries/ancestors. Do not remove or rewrite originals to satisfy the guard. |
| `EVIDENCE_CHANGED` | A path/handle identity, size, permission or timestamp comparison failed before/during/after read. Can indicate concurrent change or a platform metadata-representation issue; it does not establish tampering. Preserve the comparisons for review. |
| `INVENTORY_LIMIT`, `VERIFICATION_LIMIT`, `OUTPUT_LIMIT` | Existing directory/depth/entry/file, verification/reference or output-size bound stopped the run. Do not silently raise or ignore bounds. Review the supported scope separately. |
| `OUTPUT_POLICY` | Existing output, overlap, missing/inaccessible parent, unexpected output name or creation race. Choose a genuinely new permitted destination; do not delete prior packages. |
| `OUTPUT_ACCESS_DENIED`, `OUTPUT_IO` | Output preflight/create/write failed. Do not weaken ACLs; a partial private directory may exist and remains incomplete. |
| `SOURCE_IO` | Other source IO failed; the reason is a coarse OS family, not a filename or definitive cause. |
| `RUNTIME_UNAVAILABLE`, `INTERNAL_ERROR` | Dependency/import or otherwise unclassified internal failure. Preserve the safe diagnostic line for focused implementation review; do not request/enable raw exception output. |

An ACCESS_DENIED family does not distinguish ACL, restricted token, integrity policy
or filtering. UNKNOWN/UNCLASSIFIED_FAILURE is intentional when the tool cannot safely
classify a failure. No raw exception-string matching is used. Windows last-error is
captured before cleanup can overwrite it. No diagnostic performs AccessCheck probes,
extra source opens, retries, permission/time writes or administrator elevation.

**Conflicting evidence is not a new refusal category:** mismatched fingerprints,
unreviewed receipts, missing required roles, duplicate JSON or unsupported schemas
normally produce the existing private findings package. Unsafe filesystem entries
and hard processing bounds can refuse it. Read unavailable byte/JSON budgets as
unavailable checks, not a successful integrity finding. A completed package with
conflicts still has PRODUCTION_NO_GO; --diagnose-refusal does not resolve or approve
those conflicts or change any accepted-oracle/replay/navigation requirements.

CI exercises the existing Linux no-atime/timestamp-preservation tests plus injected
Win32 open/suppression/enumeration errors, pointer-sized handles and cleanup ordering.
It cannot attest Windows 11 build 26300, CPython 3.13.14, the operator's NTFS driver,
DACLs, restricted token, security software or real path/handle metadata equivalence.
The actual root cause remains unknown until the operator runs the protected command.

## Investigate before-read Windows identity mismatches

`EVIDENCE_CHANGED / INVENTORY / BEFORE_READ_IDENTITY_OR_METADATA_MISMATCH` from
PR #365 does not itself prove evidence mutation. CPython 3.13 path and descriptor
metadata can use different ctime meanings. See the focused [Windows identity
investigation and exact non-elevated PowerShell commands](VOYAGR_PHASE12FB_WINDOWS_IDENTITY.md)
for the native-comparison correction, bounded metadata-only diagnostic, category
interpretation and remaining operator-specific uncertainty. Existing no-atime,
permission and acceptance requirements still apply. **PRODUCTION_NO_GO**.

## Capture records versus supporting artifacts

The former rule classified **every JSON file** under `phase12fb-body-hint/` as a
capture. Supporting metadata could therefore receive spurious CAPTURE_STRUCTURE
INVALID findings. This is a demonstrated classification defect, not a finding
that the operator's five private artifacts are necessarily supporting files.
Those files and their role declarations have not been examined here.

The corrected selection rule is case-insensitive for path names:

| Selection | Role and validation |
| --- | --- |
| Below `phase12fb-body-hint/`, basename `fixture-<decimal digits>-record.json` | Capture record, including original fixture-0-record.json through fixture-4-record.json. |
| Same directory subtree, basename `capture-<decimal digits>.json` | Legacy capture-record naming supported by existing tooling/tests. |
| Decoded JSON object with exact `kind:RECORDED_GRAPH_HOPPER8_CAPTURE_RECORD` | Explicit capture-record declaration anywhere in inventory. This optional marker is not required on original named records. |
| Explicit local evidence-index role `capture_record` | Claimed capture record at the referenced inventoried path; malformed declared hashes still produce INVALID_HASH and cannot hide the claimed file from schema validation. No references outside inventory are opened. |
| Exact `kind:RECORDED_GRAPH_HOPPER8_CAPTURE` or indexed `capture_bundle` role | Bundle; requires a nonempty fixtures list, bounded by the existing 100-entry limit. A bundle is not a replacement for the five individual record artifacts. |
| Other JSON files in the directory | Supporting/unclassified or another existing filename-selected role; still inventoried, byte-fingerprinted within limits, strictly parsed, and checked for supported references/identity declarations. Directory membership does not assert a capture role. |

Request/response object presence alone does not assign a role. Arbitrarily named
captures need an explicit kind or an additional, separately prepared evidence
index; missing identification remains unresolved. **Do not rename or edit original
evidence** to satisfy selection. Naming/role declarations identify candidates,
not valid schemas or authentic captures. Selected records still need decoded
request/response objects, request-point/custom-model checks, canonical and Base64
wire bindings and transport/hop evidence. Invalid JSON, non-object JSON and
unavailable parsed bytes retain strict-JSON/schema findings and a capture-structure
INVALID_OR_UNAVAILABLE finding. Missing request/response objects remain INVALID.

Capture/receipt role collisions and record/bundle collisions are reported as
ARTIFACT_ROLE CONFLICTING_ROLES. Both claimed capture shapes are examined rather
than allowing the bundle role to hide a malformed record. An explicit supporting
role cannot downgrade a named or otherwise declared capture. Conflicting records
do not count toward FIVE_CAPTURE_RECORDS STRUCTURE_VALID. Extra records, duplicate
capture pairs, duplicate bytes and duplicate/conflicting singleton roles remain
findings. Five structurally identified records do not establish correct fixture
identity, provenance or independent acceptance.

Transport binding checks now distinguish:

| Status | Meaning |
| --- | --- |
| UNBOUND_UNREVIEWED | A present transport hash is JSON null and the capture explicitly has reviewed:false, or inherits reviewed:false from its bundle when its own marker is absent. An unresolved placeholder, **not** a hash match or accepted transport attestation. |
| MISSING | No transport hash field was supplied. |
| INVALID_HASH | Malformed non-null declaration, or null without the explicit unreviewed marker. |
| UNAVAILABLE | A well-formed declared hash has no valid counterpart to compare. |
| MISMATCH | Well-formed non-null hash contradicts the calculated/bound counterpart. |
| MATCH | The stated binding matches; authenticity and review are still unestablished. |

These statuses apply to the transport-sidecar digest, sidecar-to-capture digests
and sidecar-to-engine digests. Identical malformed values cannot yield MATCH.
UNBOUND_UNREVIEWED stays in unresolved-findings.json. This does **not** exempt null
or malformed top-level/engine identity claims: IDENTITY_CLAIM INVALID_HASH and
receipt/schema checks remain unchanged. A derived bundle can intentionally leave
transport binding unbound without concealing contradictory hashes in originals.

Rerun only after obtaining the updated checkout. Use the existing non-elevated
PowerShell command with a **new, nonexistent** output directory outside Git:

```powershell
& .\.venv\Scripts\python.exe .\scripts\prepare-phase12fb-review-package.py `
  --evidence-directory 'C:\PrivateEvidence\Phase12FB' `
  --output-directory 'C:\PrivateReview\Phase12FB-classification-01' `
  --diagnose-refusal
$LASTEXITCODE
```

Use the already compliant evidence directory and private output parent. Do not
change original bytes, timestamps, permissions or reviewed markers. Keep old
packages unchanged. Locally compare the new manifest's selected capture paths
against the five original records and inspect every remaining finding. Do not
share private paths, contents or captures with CI/Codex.

Synthetic regression results demonstrate mixed-content selection, malformed named
and explicitly claimed captures, original record discovery/wire validation,
duplicates/role conflicts, and null versus contradictory transport hashes. They
**do not resolve the operator's five CAPTURE_STRUCTURE findings, five transport
findings or nine invalid identity-claim checks**. Resolution requires rerunning
on actual evidence and independent examination. All filesystem/no-atime handling,
private isolation and independent-review requirements remain. **PRODUCTION_NO_GO**.
