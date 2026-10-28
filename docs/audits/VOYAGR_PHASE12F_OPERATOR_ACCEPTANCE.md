# Phase12F — Operator acceptance (NOT_TESTED here)

**PHASE12F_PARTIALLY_VERIFIED; repaired dataset production NO-GO.** No server access, deployment, restart or dataset/graph/config modification was performed. GraphHopper remains preferred eligible primary. These procedures concern the isolated lab `vmi3072171`, not production `vmi2887070`. Do not run routing experiments on production.

## Identity and input review

Operator verifies the already running isolated instance and existing import receipts read-only. Record application commit, GH8 build, GB December2025 extract hash/date, profile/custom weighting, encoded values, imported graph revision, original/candidate area SHA and resource limits. Use existing12C procedure for paired provenance and negative controls. Native `/info` cannot generally attest the area file actually imported; file identity alone is insufficient. Do not rebuild/restart to manufacture evidence.

```bash
# In the isolated lab checkout only:
git rev-parse HEAD
git status --short
sha256sum camera_areas.geojson artifacts/camera-areas/phase12b/camera_areas_candidate.geojson
```

Expected hashes: original `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`; candidate `6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7`. Do not replace either file. Keep private fixture/capture files under `umask 077`, outside the repository. Obtain all five actual12E request/response fixtures and their import/road evidence from the operator; this chat supplied magnitudes only.

Each reviewed fixture needs: actual requested origin/destination; native snapped waypoints; full unsimplified route geometry; whether origin/destination lies inside/on/outside the exclusion; directed road/edge/access/turn evidence; unrestricted and restricted connection requests; expected result and boundary policy. Retain source identity/time. A nearby road, same-road name, short Euclidean distance or zero-length connection cannot replace this review.

## Bounded lab capture

One request at a time; no concurrent loop or automatic public fallback. Review CPU/RSS and output status before the next fixture. Use the approved disposable loopback high-port endpoint; stop if the endpoint could be production. Existing CLI `isolated_origin` deliberately refuses ordinary8989 and remote origins. A high port alone does not prove isolation; the operator must verify the service identity.

Prepare `/tmp/phase12f-approved-request.json` from an actual reviewed12E native GH request. Keep all128 exclusions and capability-aware preferences as required. Set `points_encoded:false`, `instructions:true`, `ch.disable:true`; `way_point_max_distance=0` is also applied by the bounded transport. Do not disable avoidance. Record approval and provenance privately. The following performs **one** limited metadata GET and **one** native request, no retry or redirect, using the existing48-call/60s cooperative transport cap,2/5s connect/read and2MiB response limit:

```bash
# Only after operator approval of this exact isolated endpoint and fixture:
ISOLATED_GH_URL=http://127.0.0.1:18989 .venv/bin/python - <<'PY'
import json,os
from pathlib import Path
from voyagr.utils.graphhopper_acceptance import isolated_origin,read_json,Transport,classify
origin=isolated_origin(os.environ['ISOLATED_GH_URL'])
_,payload=read_json('/tmp/phase12f-approved-request.json',65536)
if payload.get('profile')!='car' or payload.get('points_encoded') is not False or payload.get('ch.disable') is not True:
    raise SystemExit('STOP_UNREVIEWED_FLAGS')
if not payload.get('custom_model'):raise SystemExit('STOP_MISSING_RESTRICTIONS')
io=Transport(seconds=30,max_calls=2)
status,info=io.call(origin,'/info',None,'metadata')
if status!=200 or info.get('version')!='8.0':raise SystemExit('STOP_ENGINE_IDENTITY')
status,body=io.call(origin,'/route',payload,'operator_fixture')
Path('/tmp/phase12f-private-response.json').write_text(json.dumps(body))
print(json.dumps({'http_status':status,'category':classify(status,body),'calls':io.calls}))
PY
```

This is an operator command, **not executed here**. Read/review complete fresh metadata and common original/candidate import receipts privately before routing; the snippet's version check alone is not provenance acceptance. For a timeout or invalid/HTML response, retain only fixed failure categories; do not print raw body/exception. A failed route is NOT proof of compliance. NO_PATH requires the specific recognized ConnectionNotFoundException, not generic400, timeout or502/504. Capture metadata/duration/resource evidence separately; do not mistake end-to-end HTTP time for compiler-only time.

## Offline origin evaluation using actual application function

The captured native response must be paired with the exact request and matching candidate/original geometry. The following makes no HTTP call and reports only allowlisted diagnostic fields. Example uses the candidate file; evaluate original captures against original as well.

```bash
.venv/bin/python - <<'PY'
import json
from voyagr.utils.graphhopper_acceptance import read_json,classify,sha
from voyagr.services.routing.origin_integrity import assess_origin,coordinate
_,request=read_json('/tmp/phase12f-approved-request.json',65536)
_,response=read_json('/tmp/phase12f-private-response.json',2*1024*1024)
raw,areas=read_json('artifacts/camera-areas/phase12b/camera_areas_candidate.geojson')
if sha(raw)!='6a397b69a10d9284dfa3c2cc6a05ac070e81e3850c33b75b4827ddced9fe38d7':raise SystemExit('STOP_DATASET_IDENTITY')
# Only evaluate captures independently confirmed as HTTP200 ROUTE above.
if classify(200,response)!='ROUTE':raise SystemExit('NOT_A_VALID_ROUTE_CAPTURE')
points=request.get('points',[])
if not 2<=len(points)<=10:raise SystemExit('STOP_POINTS')
start=coordinate(tuple(reversed(points[0])));end=coordinate(tuple(reversed(points[-1])))
if not start or not end:raise SystemExit('STOP_COORDINATES')
context={'start':start,'end':end,'areas':areas,'camera_mandatory':True,'accuracy_m':None,'relations':{}}
for i,path in enumerate(response['paths']):
    route={'geometry':path['points'],'geometry_precision':5}
    if 'snapped_waypoints' in path:route['provider_snapped_waypoints']=path['snapped_waypoints']
    evidence=assess_origin(route,context)
    fields=('status','reason','navigation_allowed','origin_displacement_m','destination_displacement_m','requested_area_relation','destination_area_relation','transition_verified','snap_evidence')
    print(json.dumps({'path_index':i,**{k:evidence.get(k) for k in fields}}))
PY
```

Exact displacements are restricted operator diagnostics, not production telemetry. Keep private captures local. Native GeoJSON from `points_encoded:false` is handled directly; encoded native snapped points use GH default precision5. Mismatched/unknown encoding must remain unverified, never guessed into success. Whole-segment polygon intersection/edge checks still require the Phase12C paired harness and reviewed graph evidence; origin continuity does not replace them.

## Required matrix

|Case|Expected application result|Actual lab/device result here|
|---|---|---|
|All five12E displaced origins|Quarantine; no confirmation override|NOT_TESTED|
|Restricted zero-length connection|Not evidence of reachability|NOT_TESTED|
|Inside/boundary mandatory origin or destination|UNRESOLVED|NOT_TESTED|
|Immediately outside, numerically continuous|Eligibility still requires independent mandatory compliance|NOT_TESTED|
|Sparse crossing / boundary touch / no compliant alternative|Separate segment and directed-edge evidence|NOT_TESTED|
|Parallel/opposing/one-way/slip/bridge/disconnected roads|No invented connector or same-road-name shortcut|NOT_TESTED|
|Eligible GH plus eligible Valhalla alternatives|GH first; manual eligible alternatives preserved|NOT_TESTED|
|Unsafe GH, eligible fallback|Fallback eligible only after same gates|NOT_TESTED|
|All alternatives unsafe/unknown|Current navigation retained; unresolved preview only|NOT_TESTED|
|Cache hit, resume, offline, stale response|Reassess online; reject stale/missing origin metadata|NOT_TESTED|
|GPS reroute while inside exclusion|Actual raw origin preserved; no silent safe exit|NOT_TESTED|
|Multi-stop/intermediate waypoint relocation|Complete journey quarantined|NOT_TESTED|
|Budget expiry / cancelled browser request|Structured application deadline / retain current state|NOT_TESTED|

Run the real Flask/PWA paths against the lab only after an isolated application is available and separately approved. Check preview labels, selected route, Start Navigation refusal, manual confirmation refusal, automatic map replacement refusal, stale responses, GPS progress/voice pausing and current-position changes. Do not deploy the change to production merely to run acceptance. No physical-device or legal-road acceptance has been obtained in this task.

## Evidence and rollout review

Correlate `X-Voyagr-Request-ID`, `origin_integrity` bucket/status/evidence/quarantine/stage duration and prior provider logs. Never share private request/capture bodies or coordinates in production logs. Measure25+ paced samples per representative case where approved, report n/median/p95/max and resource/graph provenance; distinguish cold/warm and original/candidate. Collect directed-edge evidence and explain any boundary/partial-edge discrepancy. Review a coordinated source rollback/client refresh plan without executing it. Candidate replacement remains separately unauthorised and production NO-GO until all required acceptance gates pass.
