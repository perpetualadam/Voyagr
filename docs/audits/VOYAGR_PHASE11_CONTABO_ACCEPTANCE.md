# Phase 11C — Contabo acceptance

Decision: **PHASE11_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Acceptance date:2026-10-28 UTC. Tested application baseline: `a0d004a1a85a34714b535456d733d47b202caf9e` (Phase11B PR353), with Phase11A PR352 `d0482d3eb00ba883b74b362692f67a69eb873372` and Phase10 preserved. Both prerequisite PRs are MERGED; their main CI runs [40620379597](https://github.com/perpetualadam/Voyagr/actions/runs/40620379597) and [40616521365](https://github.com/perpetualadam/Voyagr/actions/runs/40616521365) completed successfully. **Deployed Contabo revision is UNKNOWN.** Merge/CI do not establish deployment.

This phase changes only acceptance documentation, offline audit tools/tests and their CI selection. No production access, query, SSH, service restart, dataset repair, graph rebuild, config change, deployment or physical-device execution occurred. No approved graph-backed fixture or live routing service was available here. Repository hazard files remain byte-identical.

PASS below means the stated local check passed, not production acceptance. FAIL means a measured check failed. PARTIALLY_VERIFIED combines local checks with missing deployment/source/device evidence. NOT_TESTED means no qualifying execution occurred; it is not PASS.

## Workstream1 — Overpass acceptance matrix

|Acceptance area|Executed local evidence|Local result|Contabo result|
|---|---|---|---|
|Self-hosted reachability|No local-service approval/provisioned Contabo access; workspace listener inspection only|NOT_TESTED|NOT_TESTED|
|Signals/rail/roads/hazard query support|Actual query builders/schema logic and fixture responses tested; no real interpreter queried|PARTIALLY_VERIFIED|NOT_TESTED|
|Dataset coverage/provenance|Client retains UNVERIFIED/PARTIAL rather than inventing full coverage|PARTIALLY_VERIFIED|NOT_TESTED|
|JSON/error/empty handling|Runtime/malformed/truncated/HTML/size/valid-empty regressions|PASS|NOT_TESTED|
|502/503/504|Bounded actual-helper fault fixtures|PASS|NOT_TESTED|
|Query timeout / retry budgets|Entry, backoff, streamed/late responses and parent-vs-acquisition caps tested|PASS|NOT_TESTED|
|Public fallback / recovery|Sequential allowlist, cooldown/Retry-After and local recovery fixtures|PASS|NOT_TESTED|
|Bounded acquisition|Two owned viewport tasks, transport/flight limits and rejected third task|PASS|NOT_TESTED|
|Coalescing / caller isolation|Four identical fixture callers make one HTTP call; independent waiters|PASS|NOT_TESTED|
|Cancellation / late publication|Actual task/transport paths reject cancelled/late results; no hard preemption claim|PASS|NOT_TESTED|

## Workstream2 — Hazard integrity acceptance matrix

|Acceptance area|Evidence|Result|Installed/real-road acceptance|
|---|---|---|---|
|128 areas versus137logged sections|Repository128grid areas;8301component/point correspondence; actual installed/file/env not read|PARTIALLY_VERIFIED|NOT_TESTED|
|MultiPolygon validity|JTS102 invalid areas, all102 have positive-area component overlap;1911 overlap pairs|FAIL (repository topology)|NOT_TESTED|
|Duplicate/contradictory records|106 duplicate positions/components;7 references span multiple positions; no contradictory type candidates found|PARTIALLY_VERIFIED|NOT_TESTED|
|Independent camera provenance/time|No source/acquisition metadata in the point export; file hashes alone not provenance|NOT_TESTED|NOT_TESTED|
|Opposite direction / adjacent carriageways|Existing independent-assessment synthetic road/direction tests pass; export lacks required evidence|PARTIALLY_VERIFIED|NOT_TESTED|
|Average-speed sections|Converter labels all points speed_camera; no section endpoints/direction/length identity|NOT_TESTED|NOT_TESTED|
|Traffic-light / railway association|Conservative synthetic route association tests; no independently matched live snapshot|PARTIALLY_VERIFIED|NOT_TESTED|
|Stale / partial OSM coverage|Timestamp/uncertainty/fail-closed application fixtures pass|PASS (application semantics)|NOT_TESTED|

## Workstream3 — Routing acceptance matrix

|Acceptance area|Executed evidence|Local result|Real-engine result|
|---|---|---|---|
|GraphHopper eligible primary|Phase10/11B actual assessor/ranking regressions, including higher marker counts and failed acquisition|PASS|NOT_TESTED|
|Valhalla alternatives / manual eligibility|Existing generation/selection regressions|PASS|NOT_TESTED|
|Mandatory ineligibility / unknown not SATISFIED|Independent assessment and navigation gates tested|PASS|NOT_TESTED|
|Failure never silently removes hard rules|GraphHopper fail-closed/capability/area composition and fallback fixtures|PASS|NOT_TESTED|
|Selected limitations / geometry binding|Per-alternative metadata/checksum and selected-route regressions|PASS|NOT_TESTED|
|Multi-stop complete geometry|All-leg assessment, stitching, visit ordering and missing-leg rejection|PASS|NOT_TESTED|
|Cache reassessment|Cached provider claims reassessed against current available evidence|PASS|NOT_TESTED|
|Cooperative request termination|Deterministic30 s parent/12 s acquisition budgets; late result checks|PARTIALLY_VERIFIED (not hard preemption)|NOT_TESTED|
|Graph-backed exclusion enforcement|Replay invoked without approval;0 routing requests, no reviewed oracle|NOT_TESTED|NOT_TESTED|

## Workstream4 — PWA acceptance matrix

|Acceptance area|Executed evidence|Local result|Physical device result|
|---|---|---|---|
|Preview source / limitations|Jest orchestration/card/selected evidence regressions|PASS|NOT_TESTED|
|Selectable alternatives|Selection/manual switching and state binding regressions|PASS|NOT_TESTED|
|Non-definitive warnings|Nearby marker/evidence distinction and uncertain mandatory gates|PASS|NOT_TESTED|
|Offline / stale recovery|Offline and request-generation/navigation tests|PASS|NOT_TESTED|
|Privacy-safe504|Actual HTTP response handler fixture never logs/consumes HTML error body|PASS|NOT_TESTED|
|Repeated route requests / acquisition ownership|Jest cancellation/supersession plus backend bounded coalescing fixtures|PARTIALLY_VERIFIED|NOT_TESTED|
|MapLibre rendering recovery|Mock/orchestration recovery regressions pass; no real browser/GPU exercised|PARTIALLY_VERIFIED|NOT_TESTED|

## Exact bounded operator procedures — all production steps NOT_TESTED

These procedures are for an authorised operator on the known host, not instructions for Codex to connect. Obtain separate approval for any deployment; none is part of acceptance. Use an already approved checkout of the audit tools and a Python web environment. No service configuration or data edit is needed.

### Deployed identity and local reachability

```sh
git -C /opt/voyagr rev-parse HEAD
ss -ltnp '( sport = :8080 or sport = :8989 or sport = :8002 )'
curl --silent --show-error --noproxy localhost,127.0.0.1 --max-time 3 --max-filesize 65536 http://localhost:8080/api/status
```

Record whether deployed code contains11B; an older deployed revision cannot pass application remediation acceptance. Listener/status metadata do not prove UK coverage. Inspect output locally; do not paste raw status/config/journals into public reports. No network checks against Contabo were executed in this workspace. No usual routing/Overpass listener was seen in the workspace; that observation says nothing about Contabo.

### Four small query-support probes, only after explicit operator approval

The following fixed public-location bbox is about0.001degree per axis. It is not a private route, coverage oracle or licence assertion. Approve that exact area and four serial queries first. If status shows saturation, stop. The default shell placeholder prevents accidental execution. Each server query has2s/maxsize64KiB; curl has4s,64KiB andzero retries. Do not increase extents or limits to force success. Even4s curl timing is not a hard Overpass server cancellation guarantee.

```sh
: "${PHASE11C_APPROVED_SMALL_QUERIES:?Set only after operator approves the four small local queries}"
umask 077
PHASE11C_EVIDENCE_DIR=$(mktemp -d /tmp/voyagr-phase11c.XXXXXX)
for category in traffic_signals railway_crossings road_attributes hazards; do
  case "$category" in
    traffic_signals) selector='node["highway"="traffic_signals"]' ;;
    railway_crossings) selector='node["railway"="level_crossing"]' ;;
    road_attributes) selector='way["highway"]' ;;
    hazards) selector='node["hazard"]' ;;
  esac
  curl --silent --show-error --noproxy localhost,127.0.0.1 \
    --max-time 4 --max-filesize 65536 --fail-with-body --retry 0 \
    --header 'Accept: application/json' \
    --data-urlencode "data=[out:json][timeout:2][maxsize:65536];${selector}(51.500,-0.130,51.501,-0.129);out count;" \
    --output "$PHASE11C_EVIDENCE_DIR/$category.body" \
    --write-out "$category status=%{http_code} bytes=%{size_download} elapsed_s=%{time_total}\n" \
    http://127.0.0.1:8080/api/interpreter || break
done
export PHASE11C_EVIDENCE_DIR
python3 - <<'PYCODE'
import json, os
from pathlib import Path
for path in sorted(Path(os.environ['PHASE11C_EVIDENCE_DIR']).glob('*.body')):
    with path.open('rb') as source: raw=source.read(65537)
    summary={'category':path.stem,'bytes_retained':len(raw),'over_cap':len(raw)>65536}
    if len(raw)<=65536:
        try:
            data=json.loads(raw)
            summary.update(json_object=isinstance(data,dict),
                elements_list=isinstance(data.get('elements'),list) if isinstance(data,dict) else False,
                runtime_error_present=any(k in data for k in ('remark','error')) if isinstance(data,dict) else False)
        except (ValueError,UnicodeError): summary['valid_json']=False
    print(json.dumps(summary))
PYCODE
```

Use curl8.4or later, which enforces max-filesize for streamed responses; otherwise use the bounded Python reader from the11A diagnostics and do not run these curl probes. HTTP errors stop the loop.

Count-query output proves only syntax/envelope support for that local query. A count element is not an encountered hazard; zero does not prove absent hazards or full UK data. Preserve status alongside envelope classification:502/503/504 must never be relabelled valid-empty. A single probe gives n=1 per category, not p95 evidence. Retain files privately; report only counts/categories and timing. No automatic retry/public fallback is performed by these probe commands.

### Data identity, provenance and topology — read-only

Set paths only to approved existing input files; do not export or modify a production database. The audit tool caps input16MiB/100,000features and prints no coordinates. Run from the approved audit checkout; the operator supplies the interpreter and pre-provisioned parser classpath, never installs dependencies into a running service.

```sh
: "${VOYAGR_AUDIT_PYTHON:?Approved audit Python interpreter}"
: "${OP_CAMERA_AREAS:?Actual installed camera-area file path}"
: "${OP_CAMERA_POINTS:?Approved existing camera-point export path}"
sha256sum "$OP_CAMERA_AREAS" "$OP_CAMERA_POINTS"
"$VOYAGR_AUDIT_PYTHON" scripts/audit-phase11-hazards.py "$OP_CAMERA_AREAS"
"$VOYAGR_AUDIT_PYTHON" scripts/audit-phase11-hazards.py "$OP_CAMERA_POINTS"
"$VOYAGR_AUDIT_PYTHON" scripts/audit-phase11-hazards.py "$OP_CAMERA_AREAS" --compare-points "$OP_CAMERA_POINTS"
: "${GH8_PARSER_CLASSPATH:?Pre-provisioned approved GH8/Jackson/JTS classpath}"
java --class-path "$GH8_PARSER_CLASSPATH" scripts/AuditCameraAreas.java "$OP_CAMERA_AREAS"
```

Verify parser jar SHA256 against `VOYAGR_GRAPHHOPPER8_PARSER_EVIDENCE.json` before using them. The new topology tool exits2 for invalid geometry (expected for the repository snapshot),1 for parse/structure failure,0 only for valid parsed topology. This is offline topology, not installed-engine routing. Record installed-file hash, SCDB export/import dates, source/licence, area generator revision/grid/radius, actual loaded file and graph import revision. Do not use file mtime as acquisition provenance.137 cannot be reconciled by making counts match. Do not replace, deduplicate, union or buffer production polygons in acceptance.

### Fault handling, retry, cancellation and public fallback

Execute fault injection only on an isolated clone/fixture server. Do not stop/reconfigure production Overpass or intentionally induce its502. From the reviewed checkout:

```sh
"$VOYAGR_AUDIT_PYTHON" -m pytest -q tests/test_phase11b_overpass.py tests/test_phase11_overpass_audit.py tests/test_routing_request_budget.py tests/test_phase10_routing.py
"$VOYAGR_AUDIT_PYTHON" scripts/benchmark-phase11b-overpass.py --mock-http
```

Tests inject valid-empty/malformed/runtime/HTML/truncated/oversized data,502/503/504/429, slow sockets, deadlines, public recovery, coalescing and late cancellation into actual application code. Do not describe their fixture results as Contabo behavior. On real incidents, read bounded existing logs using the Phase11A diagnostics window; join request/operation/PID/thread and monotonic timings, not same-second adjacency. Record queue/admission, cache and coverage outcomes; no raw queries, routes, headers or exception bodies. Capture actual upstream timing/status and kernel/cgroup evidence before claiming OOM or proxy causality. Avoid dumping environments, process arguments or full nginx/docker configurations.

### Engine, geometry and browser acceptance

Read-only GraphHopper metadata may be inspected locally:

```sh
curl --silent --show-error --noproxy localhost,127.0.0.1 --max-time 3 --max-filesize 65536 http://localhost:8989/info
curl --silent --show-error --noproxy localhost,127.0.0.1 --max-time 3 --max-filesize 65536 http://localhost:8002/status
```

Do not publish raw metadata; record only version/profile/encoded-value/graph-revision summaries. Metadata HTTP200 cannot verify hard-block enforcement. Use only an explicitly approved isolated engine clone and a reviewed graph-backed request/oracle manifest:

```sh
: "${APPROVED_REPLAY_MANIFEST:?Reviewed graph-backed manifest for isolated engines}"
"$VOYAGR_AUDIT_PYTHON" scripts/replay-routing-engines.py --manifest "$APPROVED_REPLAY_MANIFEST" --approved-local-services
```

Never use that flag with an unreviewed synthetic oracle or point it at production. The bundled manifest intentionally lacks reviewed provider fixtures and cannot certify enforcement. Check every returned alternative and leg against forbidden graph areas, road IDs/direction and ordered visits. Keep private geometry locally. Obtain independently sourced, timestamped evidence for adjacent/opposite carriageways, average-speed section endpoints/length, signal/rail association and conflicting sources; do not infer these from circles/squares near the route.

On a physical stationary/passenger-operated device, record deployed app SHA, browser/OS/device and timestamps. Check eligible GraphHopper Optimised first, selectable distinct Valhalla alternatives, blocked mandatory-ineligible navigation, correct selected engine/limitations/checksum, offline stale restrictions, cancellation/supersession, privacy-safe HTML504 and stable MapLibre alternative/camera/traffic layers after recovery. Use `scripts/fixtures/phase8/pwa-device-results-template.json` and `scripts/validate-phase8-device-results.py` (see --help) without inventing execution attestations. No physical-device row is PASS in this report.

## Remaining release gates / Phase12 entry

Contabo deployed SHA; actual query support/source bounds/freshness; installed128 versus logged137 identity; reviewed correction proposal for invalid/duplicate/ambiguous data; independent road/direction/average-section truth; installed graph exclusion/manoeuvre/visit verification; multiworker latency/memory/proxy evidence; physical-device PWA/GPS/offline/auth checks all remain outstanding. Phase12 should collect these concrete records and review any proposed data remediation separately. No speculative resource tuning, automatic data repair or production GO follows from these local results.

---

## Retained Phase11B plan (historical, still unexecuted on Contabo)

### Historical Phase11B acceptance

Status: **PHASE11B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: merged Phase11A PR #352, `d0482d3eb00ba883b74b362692f67a69eb873372`; Phase10 `12def1c46a4e9fc5cf7666c2fedbc3ae12b911ee` is preserved. All infrastructure/Contabo acceptance below is NOT_TESTED. No SSH, production query, deployment, restart, configuration/data/graph change, paid provider or new infrastructure dependency was used. Phase11A reports remain unchanged as historical evidence.

## Operator prerequisites — all NOT_TESTED

Use the bounded read-only [Phase11A diagnostics](VOYAGR_PHASE11_CONTABO_DIAGNOSTICS.md) for deployed SHA, listener/service topology, status metadata, narrowly scoped journals and categorical memory/proxy evidence. Those commands were not executed by Codex. No automatic deployment is authorized; diagnostics require a separately approved deployment of this change. Do not SSH/restart/change configuration, clear caches, rebuild graphs/extracts or run a country-wide query as part of acceptance.

After that separately approved deployment, record deployed SHA, X-Voyagr-Request-ID, fixed query kind, endpoint LOCAL/PUBLIC and slot, attempt/status/reason, monotonic duration, response classification, coverage/cache/cancellation outcome. Keep queries, exact routes, tokens, request bodies and raw logs private. A response-ready event is not proof of delivery or a free Gunicorn thread.

## Bounded reachability and JSON envelope

Read dispatcher status only, once, after operator approval:

```sh
curl --silent --show-error --noproxy localhost,127.0.0.1 --max-time 3 --max-filesize 65536 http://localhost:8080/api/status
```

The11A operator report contains a single fixed-object `node(id:1);out count;` controlled interpreter probe with timeout2s/maxsize1MiB, bounded reader and no redirects/retries. It must be explicitly approved by the operator and only run when status shows capacity. It is not a UK coverage test. Classify a valid empty response separately from error/remark/schema failure; do not publish bodies. An HTML status page/404 may just mean the proxy lacks that endpoint. Do not guess backend ports or switch to public URLs automatically.

## Acceptance matrix

|Requirement|Controlled verification|Expected result / retained limit|Execution|
|---|---|---|---|
|Local reachability|Read-only status and approved tiny local envelope probe|Identify actual listener/proxy, bounded response; HTTP200 alone insufficient|NOT_TESTED|
|Valid JSON/empty classification|Approved tiny fixed-object query through acquisition on an isolated clone|VALID_WITH_DATA or VALID_EMPTY with original acquisition time; no AVAILABLE UK claim|NOT_TESTED|
|Query support/coverage|Compare exact installed extract source/version/bounds, replication timestamp and intended query categories|Unknown coverage remains UNVERIFIED/PARTIAL; missing/error evidence cannot mean verified absence|NOT_TESTED|
|502/503/504|Inject categorical failures in isolated mock/replica; correlate existing real logs read-only|Bounded sequential fallback, original reason categories; identify actual proxy/dispatcher generator with evidence|NOT_TESTED|
|Local recovery|On isolated clone simulate failure then recovery, advance cooldown|Local returns to configured priority after cooldown; no permanent failure demotion or duplicate traversal|NOT_TESTED|
|Public fallback|Isolated clone, operator-approved endpoints/fixture transports; never deliberately take production local service down|Allowlisted, <=2public attempts, no simultaneous duplicate public query, explicit provenance|NOT_TESTED|
|Retry timing|Isolated failure/backoff/Retry-After fixture, capture attempt timestamps and parent remaining budget|No final pointless sleep; retries/read/connect clamps fit remaining budget; no new call after expiry|NOT_TESTED|
|Viewport cancellation/load|Isolated replica, two slow approved fixtures then a third request|Third rejected, no growing queue; own budget/timeout cancellation; late work cannot cache; sockets not hard-killed|NOT_TESTED|
|GraphHopper-first|Approved private small route in PWA with failed/partial OSM acquisition|Eligible GraphHopper Optimised first in preference mode; ineligible mandatory alternatives never auto-selected|NOT_TESTED|
|Hazard status/multi-stop|Private trusted graph-backed fixtures with every requested stop and road/direction evidence|UNKNOWN/PARTIAL/STALE never SATISFIED solely from empty/error; independent assessment for all alternatives/legs|NOT_TESTED|
|Browser response handling|Physical browser route switching, cancellation, recovery and HTML504 fixture|Latest response/selected geometry binding remains authoritative; engine/limitations/status stay attached; no HTML body logging|NOT_TESTED|

Fault injection/configuration for the matrix belongs on an isolated clone. No production service failure, config edit, public query fan-out, cache clear or expensive bbox replay is requested. If a real incident recurs, correlate the bounded window and request identity before assigning cause; headers alone cannot identify the504 generator.

## Acceptance record and Phase11C

No production matrix row has been executed. Record sample count, median/p95/max, bytes/elements, active/queued work, memory/cgroup limits, source freshness and worker/proxy topology without private journey data. The current controls are process-local; establish real multiworker capacity before considering any shared coordinator. Source completeness, graph-backed exclusion enforcement, physical-device navigation and the true local502/invalid-response/504 origins remain unresolved. Investigate them with operator evidence; do not declare production GO from CI or synthetic results.
