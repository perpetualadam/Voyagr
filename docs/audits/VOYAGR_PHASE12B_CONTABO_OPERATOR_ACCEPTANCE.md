# Phase 12B — Contabo Operator Acceptance

Decision: **PHASE12B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: latest main with Phase11C PR354 `00c4caa147e7347f483cd2bc86e27c7081ab20fd`; ancestry and merged status verified. User/operator evidence in this request independently attests that `/opt/voyagr/camera_areas.geojson` and `/opt/graphhopper/custom_areas/camera_areas.geojson` both have SHA256 `65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f`,128 MultiPolygons and8301 components. This supersedes the prior lack of installed-file identity evidence **by operator attestation**, not a new Contabo probe. Installed GraphHopper8/car/custom weighting and one successful `in_camera_area_0` request are also operator-reported; all128 loaded expressions and actual enforcement remain unverified.

No SSH, production query, installation, graph rebuild, restart, config change, dataset replacement or automatic deployment occurred. The original area and point exports remain unchanged. The candidate is opt-in offline output; routing never loads it automatically. No approved graph/engine or reviewed road oracle was available in this workspace. Offline geometry/parser results do not establish routing enforcement, camera accuracy or production GO.

## Read-only identity checks — not executed here

The supplied operator hash match is recorded; the following can reconfirm it without changing services. Run only on an already authorized host, do not ask Codex to SSH:

```sh
git -C /opt/voyagr rev-parse HEAD
sha256sum /opt/voyagr/camera_areas.geojson /opt/graphhopper/custom_areas/camera_areas.geojson
curl --silent --show-error --noproxy localhost,127.0.0.1 --max-time 3 --max-filesize 65536 http://localhost:8989/info
```

Record version8.0, car/custom profile, relevant encoded-value summaries, graph/import revision and the dataset used when the graph was imported. Do not publish raw metadata, env files, process arguments, credentials, full models or private routes. The existing installed-file hash does not prove that an already imported graph used that revision. Do not print/edit the production environment to force128; inspect the deployed count-setting source privately and report only categorical/count evidence. Compare log request identity and actual loaded inventory before attributing137to the reproduced precedence bug.

In a separate approved audit checkout with approved Python/JARs, read-only inspection of an existing supplied file is available:

```sh
: "${VOYAGR_AUDIT_PYTHON:?Approved offline audit interpreter}"
: "${OP_CAMERA_AREAS:?Approved actual installed-file path}"
"$VOYAGR_AUDIT_PYTHON" scripts/audit-phase11-hazards.py "$OP_CAMERA_AREAS"
: "${GH8_PARSER_CLASSPATH:?Pre-provisioned verified GH8/Jackson/JTS classpath}"
java --class-path "$GH8_PARSER_CLASSPATH" scripts/AuditCameraAreas.java "$OP_CAMERA_AREAS"
```

Expected original topology exit2is a measured failure, not an instruction to repair the installed file. Candidate inspection/generation belongs only in the isolated review workspace. Do not run the legacy generator in place.

## Isolated engine/graph acceptance — NOT_TESTED

Separately approve an isolated GH8engine and graph copy, profile/encoded values, source extract and reviewed road-network oracle. Do not edit Contabo configuration, replace a file, rebuild/import production graphs or restart a service. Determine whether area values were encoded at graph import; a file swap alone may not change an existing graph. Original/candidate graph clones must be tied to the same reviewed road source/profile and documented import parameters. Any future production deployment/replacement and rollback plan requires **separate explicit approval**.

Before accepting enforcement, execute bounded reviewed fixtures on that isolated setup: unrestricted baseline, original invalid areas and candidate, normal alternative, no compliant path, interior crossing between sparse vertices, boundary touch/near-boundary, adjacent/opposing roads, every required stop and mixed SCDB/OSM/CAZ. Check all returned paths, complete segments and selected manoeuvre/geometry bindings. Source direction/road/section identity must come from the oracle, not nearby marker distance. Generic HTTP4xx/5xx is not proof of no-route; use recognized engine no-route semantics.

All128area expressions can be put in a **single** hard-block condition by the reviewed fixture generator, with profilecar, ch.disable=true and multiply_by:0. This checks compiler availability only if the installed graph actually declares all128identifiers; one successful in_camera_area_0request is insufficient. Do not add a toll expression unless fresh metadata confirms support. Do not send a candidate inline model with names colliding with installed areas to production.

The existing replay command is bounded and loopback-only, but run it only with a genuinely reviewed graph-backed manifest against the approved isolated engine:

```sh
: "${APPROVED_REPLAY_MANIFEST:?Reviewed original/candidate isolated graph manifest}"
"$VOYAGR_AUDIT_PYTHON" scripts/replay-routing-engines.py --manifest "$APPROVED_REPLAY_MANIFEST" --approved-local-services
```

Run distinct manifests for original and candidate copies and retain graph/profile/source identifiers. The bundled manifest is intentionally unverified; do not flip its reviewed flags to fabricate an oracle. Replay supports <=36 provider/case attempts and <=2MiB replies. Its simple-ring forbidden-area helper cannot represent holes: for hole-bearing fixtures, use a reviewed GEOS full-Polygon/MultiPolygon segment oracle in addition, never discard holes for convenience. Keep private request/response files local. A safe postcheck of points_encoded=false GraphHopper JSON can use the approved offline geometry environment:

```sh
: "${PRIVATE_ROUTE_RESPONSE:?Approved private GraphHopper GeoJSON response file}"
export PRIVATE_ROUTE_RESPONSE
"$VOYAGR_AUDIT_PYTHON" - <<'PYCODE'
import json,os
from pathlib import Path
from shapely.geometry import shape
with open(os.environ['PRIVATE_ROUTE_RESPONSE'],'rb') as f:raw=f.read(2*1024*1024+1)
if len(raw)>2*1024*1024:raise SystemExit('response_size_limit')
body=json.loads(raw)
areas=json.loads(Path('artifacts/camera-areas/phase12b/camera_areas_candidate.geojson').read_text())
polygons=[shape(f['geometry']) for f in areas['features']]
results=[]
for index,path in enumerate(body.get('paths',[])):
    line=shape(path['points'])
    if line.geom_type!='LineString' or line.is_empty or not line.is_valid:raise SystemExit('invalid_route_geometry')
    results.append({'alternative':index,'interior_intersections':sum(line.relate_pattern(p,'T********') for p in polygons),
                    'any_boundary_or_interior_intersections':sum(line.intersects(p) for p in polygons)})
print(json.dumps({'scope':'complete_segments_not_vertices','alternatives':results}))
PYCODE
```

This check is geometry evidence only, not automatic compliance: verify expected fixture path/no-route outcome, actual graph-edge area classification, boundaries, waypoints and mandatory gates. No returned path/empty paths is not a successful enforcement test. If original invalid data behaves differently, document the difference; do not assume the repaired candidate is superior solely because it is valid or returns200.

## Remaining release gates

NOT_TESTED: installed all128encoded-area/expression availability, actual hard-block execution/original-candidate equivalence, graph boundary/import behavior, real no-route fixtures, updated deployed count reporting, independent camera-source truth, real route latency and physical-device PWA/GPS/offline acceptance. Preserve GraphHopper-first eligible ranking, Valhalla diversity, OSRM honest limits and mandatory acceptance restrictions. Phase12C should obtain those concrete records and review source-data corrections separately. No production GO is authorized.
