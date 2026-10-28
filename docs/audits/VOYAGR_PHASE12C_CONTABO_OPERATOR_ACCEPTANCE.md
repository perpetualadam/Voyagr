# Phase12C — Operator acceptance

**PHASE12C_PARTIALLY_VERIFIED; CANDIDATE_NOT_VERIFIED; production NO-GO.** These commands were not executed on Contabo. No SSH, deployment, restart, config/data modification or production graph rebuild is authorised. GraphHopper remains preferred first eligible Optimised; keep the installed original. See [test results](VOYAGR_PHASE12C_TEST_RESULTS.md) for the complete changed-file inventory.

## 1. Read-only identity on Contabo — NOT_TESTED

Operator runs locally after reviewing paths. Do not paste entire environment, service configuration, raw responses, coordinates or custom models into logs. Do not use `systemctl cat`/`docker inspect` dumps which may expose credentials.

```bash
cd /opt/voyagr
git rev-parse HEAD
git status --short
sha256sum camera_areas.geojson /opt/graphhopper/custom_areas/camera_areas.geojson
```

Expected original SHA is `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`. Candidate SHA is `6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7`. Stop on unexplained identity differences; do not overwrite anything.

One small metadata GET (not a routing query), with no retry or redirect:

```bash
curl --silent --show-error --fail --connect-timeout 2 --max-time 5 \
  --max-filesize 131072 http://127.0.0.1:8989/info |
  /opt/voyagr/.venv/bin/python -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ("version","profiles","encoded_values","graph_revision")},sort_keys=True))'
```

Review output locally. `/info` may not expose graph revision, import source, profile weighting, area hash or build hash. Obtain those from existing, read-only import/build receipts and allowlisted configuration fields; missing receipts mean NOT_TESTED. Do not assume the current file was loaded by the active service. Do not rebuild to create evidence.

Bounded aggregate inventory (no source coordinates):

```bash
/opt/voyagr/.venv/bin/python - <<'PY'
import json,hashlib
from pathlib import Path
for name in ['/opt/voyagr/camera_areas.geojson','/opt/graphhopper/custom_areas/camera_areas.geojson']:
    p=Path(name)
    if p.stat().st_size > 16*1024*1024: raise SystemExit('STOP_SIZE_LIMIT')
    raw=p.read_bytes();d=json.loads(raw);fs=d['features']
    print(json.dumps({'file':p.name,'sha256':hashlib.sha256(raw).hexdigest(),'features':len(fs),'unique_ids':len({f.get('id') for f in fs}),'multipolygon_components':sum(len(f['geometry']['coordinates']) for f in fs if f['geometry']['type']=='MultiPolygon')}))
PY
```

For137: use the actual Gunicorn worker PID selected by the operator (do not assume a service name); inspect only these allowlisted values locally:

```bash
# Set APP_PID to a verified Voyagr worker PID before this command.
APP_PID="$APP_PID" /opt/voyagr/.venv/bin/python - <<'PY'
import os,json
from pathlib import Path
pid=int(os.environ['APP_PID'])
allow={b'GRAPHHOPPER_CAMERA_AREAS_COUNT'}
values={}
for item in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0'):
    key,sep,value=item.partition(b'=')
    if sep and key in allow: values[key.decode()]=value.decode(errors='replace')[:256]
print(json.dumps(values,sort_keys=True))
PY
rg -n 'CAMERA_AREAS|CAMERA.*COUNT|137|load.*camera' voyagr/services/hazards.py
```

Permissions may block worker environment inspection; report NOT_TESTED rather than widening access. Code inspection does not reveal worker in-memory state. Correlate deployed revision, startup acquisition timestamps/source labels, any section/grouping source and existing import receipt. Do not equate features with sections. Do not import the production Flask application merely to inspect loader state, since imports may initialize services.

## 2. Isolated paired acceptance — NOT_TESTED

Do **not** point the supplied runner at production. It deliberately refuses port8989, hostnames, remote hosts, credentials and redirects. High ports alone do not prove isolation: the operator must attest both services are disposable/non-production. This task does not authorise creating/reimporting production graphs. Provisioning isolated graphs requires an independently approved environment; stop if unavailable.

Use the exact GH8 build, same approved road extract and car/custom profile/config, matching encoded values and only the original/candidate area file difference. Review import receipts binding each graph revision to its area SHA, graph/config hashes, source timestamps, source licence and isolation. Check all128 IDs are loaded. The runner verifies local artifacts and selected fresh metadata; operator-attested provenance is not native runtime proof.

In a private isolated checkout (commands create only operator-local evidence files):

```bash
umask 077
cp scripts/fixtures/phase12c/plan-template.json /tmp/phase12c-private-plan.json
# Edit the private plan with reviewed provenance and fixtures; never commit it.
.venv/bin/python scripts/accept-phase12c-graphhopper.py \
  --plan /tmp/phase12c-private-plan.json > /tmp/phase12c-offline.json
```

First command does no HTTP. Fill all approvals only after review. Plan fields:

- `operator_approved`, `isolated_not_production`, `reviewed_graph_oracle`: true only with actual approval/evidence.
- `provenance`: SHA256 of engine build, road source, profile config and reviewed oracle. Those hashes are documentary attestations; verify genuine receipts matching both services. `encoded_values_sha256` is different: SHA256 of the full `/info` encoded_values object serialized using Python `json.dumps(value, sort_keys=True, separators=(",", ":")).encode()`; fresh metadata from both services must match it exactly. Do not substitute the hash of an evidence file.
- `instances.original`/`.candidate`: distinct literal-loopback high-port URL, correct dataset SHA, graph revision SHA and import receipt SHA. Store the receipts privately; their content is not inferred from a hash.
- `seed_request`: approved non-private road-network points, in GraphHopper longitude/latitude order;2–10 waypoints. No request-supplied profile/custom model is allowed.
- `fixtures`: up to18 reviewed cases. Each requires `category`, `reviewed: true`, `oracle_sha256`, `request`, known `area_ids`, `expected_restricted: ROUTE|NO_PATH`, `baseline_relation: INTERIOR|BOUNDARY|OUTSIDE`, and `boundary_policy: FORBID|OBSERVE`. Optional `blocked_edge_ids` must be independently reviewed for this exact graph; optional `extra_model` contains bounded supported preference or OSM/CAZ rules. Never invent authoritative coordinates or edge identities. Mixed mandatory/preference application acceptance still uses the real application suites and operator end-to-end checks.

Allowed categories cover baseline intersection, alternative available, no compliant alternative, near outside, boundary touch, sparse crossing, overlapping/separated areas, junction/interchange, parallel/opposing roads, slip road, bridge/tunnel, close junctions, camera+OSM, camera+CAZ and supported preference. Add cases to the reviewed plan only after road/source/direction/edge review. A single empty or outside-only plan cannot prove acceptance.

Run **one** bounded area batch, inspect status/resources, then continue manually; do not launch concurrent loops:

```bash
.venv/bin/python scripts/accept-phase12c-graphhopper.py \
  --plan /tmp/phase12c-private-plan.json --approved-isolated-services \
  --mode compile --area-start 0 --area-count 8 > /tmp/phase12c-compile-000.json
```

Repeat manually with starts8,16,…,120 (16 batches, two instances,256 area attempts plus repeated metadata/negative controls). Review every output/exit code before each batch. Do not multiply retries on failure. Generic400/timeout does not count as NO_PATH. For genuine no-path, compilation is conservatively still unverified; review an independently accepted seed/reference or engine compiler evidence.

Then reviewed graph fixtures in batches of at most2 by default (maximum4):

```bash
.venv/bin/python scripts/accept-phase12c-graphhopper.py \
  --plan /tmp/phase12c-private-plan.json --approved-isolated-services \
  --mode fixtures --fixture-start 0 --fixture-count 2 > /tmp/phase12c-fixtures-00.json
```

Continue only across actual reviewed fixture indices. Reports contain fixed statuses, booleans, hashes, deltas and timing aggregates, not route bodies. They compare all returned paths/segments, polygon holes, boundary contacts and any exposed edges. `way_point_max_distance=0` avoids intentional simplification. The runner does not request unsupported edge path details by default; if edge IDs are absent, edge proof remains NOT_TESTED. Obtain approved native graph edge evidence separately; do not infer edge identity from coordinates alone. CPU/memory/startup/import evidence must come from existing isolated instrumentation. A request-accepted status is not compliance or deployment permission.

Negative controls are essential: unknown area, invalid expression and unsupported toll/sentinel must be rejected. Stop if ignored. For a malformed loaded area, use the existing offline parser validity test; testing service import failures needs a separately approved disposable installation, never a production file change.

## 3. Resource and acceptance review — NOT_TESTED

Use read-only resource statistics on the **verified isolated PID** (`ps -p "$ISOLATED_GH_PID" -o pid,etime,time,rss,vsz`) before/after a paced batch. No restart/import timing experiment is authorised on production. Capture engine/graph/profile/encoded-values/dataset identities, cold/warm status, sample counts, median, nearest-rank p95/max. Harness HTTP stage times include compilation+routing+transport; do not label them compiler-only or Contabo performance. Inspect graph-backed hard-zero, partial-edge, boundary, alternative/no-path, multi-stop, direction and topology results independently.

Keep raw private inputs/evidence local with restricted permissions. Share sanitized aggregate reports only. Review original backup/rollback **plan**, identities and future reload requirements without executing changes. Candidate acceptance is a separate review gate; any later production replacement needs explicit authorisation. Keep original and GraphHopper operation unchanged regardless of this audit's outcome.
