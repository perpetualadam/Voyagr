# Phase 11A — Contabo diagnostics for the operator

All infrastructure steps below are **NOT_TESTED / operator-run only**. This task performed no SSH, production query, restart, deployment, resource/configuration change, cache clear or graph/data modification. Production remains NO-GO. Run only read-only commands on the already authorized host, within a known incident window. Never paste raw service configurations, process arguments, environments, full query bodies, private bboxes, auth headers or route coordinates into GitHub/chat.

## 1. Establish deployed revision and request identity

Read `git -C /opt/voyagr rev-parse HEAD` locally and verify Phase10 commit12def1c4 is an ancestor. Check the actually deployed application/asset revision, not just GitHub main. Phase11A diagnostics are available only after a separately authorized deployment; none is performed here.

For new application logs, record the browser response's `X-Voyagr-Request-ID`, status, Content-Type and Server-Timing. For an application-controlled deadline also record `X-Voyagr-Error-Origin: application` and ROUTING_DEADLINE_EXCEEDED. Do not copy request bodies/headers or HAR files. Note that an HTML gateway response may not contain the application ID at all.

Join `overpass_audit` request_started, query_started, attempt_started/http_response/query_finished and response_ready by request_id and operation. Include PID/thread and monotonic elapsed_ms. A slot number maps to that client's configured endpoint list; the operator must identify local/public mapping from approved configuration without publishing the URL or credentials. Trace separate requests independently, even on one worker. A task_started/task_finished after response_ready is evidence of continuing executor work for that ID; query duration alone does not prove Gunicorn request-thread occupancy.

Read a bounded existing journal window, substituting the actual application unit and UTC incident timestamps. The example is local-only inspection, not a command executed by Codex:

```sh
journalctl -u voyagr --since '2026-10-28 01:00:00 UTC' --until '2026-10-28 01:05:00 UTC' --no-pager -n 1000 -o short-iso | rg 'overpass_audit|RoutingDeadlineExceeded|provider_timeout|worker timeout'
```

Replace the window with the real incident. Do not infer one request from neighbouring legacy lines: old `[ROUTE] request_completed` is logged before after-request assessment/serialization, and old Overpass lines lack IDs. Browser cancellation/stale rejection is independent of server cancellation. If logs are unavailable, classify correlation NOT_TESTED rather than guessing.

## 2. Establish endpoint/proxy/service topology without changing it

```sh
ss -ltnp '( sport = :8080 )'
systemctl show overpass --property=ActiveState,SubState,MainPID,MemoryCurrent,MemoryPeak,MemoryMax,TasksCurrent,TasksMax
systemctl show voyagr --property=ActiveState,SubState,MainPID,MemoryCurrent,MemoryPeak,MemoryMax,TasksCurrent,TasksMax
ps -eo pid,ppid,comm,nlwp,rss,etimes --sort=-rss | head -n 20
```

Unit names are examples; use installed names discovered through approved operator knowledge. A listener on8080 may be a reverse proxy/container mapping rather than Overpass itself. Inspect only relevant timeout/upstream/dispatcher settings locally; never dump full `systemctl cat`, `/proc/*/environ`, `docker inspect`, nginx config or secrets to public output. If containerized, use `docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.PIDs}}' APPROVED_CONTAINER_NAME`; do not restart it or enumerate sensitive env bindings. These snapshots alone do not prove resource exhaustion.

Read current status metadata only, with no interpreter query:

```sh
curl --silent --show-error --noproxy localhost,127.0.0.1 --max-time 3 --max-filesize 65536 http://localhost:8080/api/status
```

404/HTML may mean the proxy does not expose this resource. Do not switch to public servers or guessed backend ports automatically. Inspect the output locally for dispatcher slots, active query count and replication timestamp if present; no status page is assumed to expose all these fields. Read existing import/replication metadata for dataset bounds/freshness. No extract rebuild or update is requested.

## 3. Optional single controlled response-envelope probe

Only if the operator explicitly approves a trivial local query and current status shows capacity. This selects a single fixed object ID and outputs counts, not a journey or geographic scan. It is not a load test or coverage test. Run once; no retries/public fallback. The Python reader caps retained response bytes and read inactivity; like requests, it is not a hard-preemptive guarantee.

```sh
python3 - <<'PY'
import json, time, urllib.request, urllib.error, urllib.parse
query = '[out:json][timeout:2][maxsize:1048576];node(id:1);out count;'
req = urllib.request.Request('http://localhost:8080/api/interpreter',
    data=urllib.parse.urlencode({'data':query}).encode(),
    headers={'User-Agent':'Voyagr-operator-envelope-check/1'})
# Literal local service only; redirects must not send the probe elsewhere.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
started = time.monotonic()
try:
    with opener.open(req, timeout=3) as r:
        raw = r.read(65537)
        summary = {'status':r.status, 'content_type':r.headers.get('Content-Type','')[:80],
                   'bytes_retained':len(raw), 'over_cap':len(raw)>65536}
        if len(raw)<=65536:
            try:
                data=json.loads(raw)
                summary.update(json_object=isinstance(data,dict),
                    elements_list=isinstance(data.get('elements'),list) if isinstance(data,dict) else False,
                    remark_present='remark' in data if isinstance(data,dict) else False)
            except (ValueError,UnicodeError): summary['valid_json']=False
except urllib.error.HTTPError as e:
    summary={'status':e.code, 'error_type':'HTTPError'}  # Never print body/exception text.
except Exception as e:
    summary={'error_type':type(e).__name__}
summary['elapsed_ms']=round((time.monotonic()-started)*1000,3)
print(json.dumps(summary))
PY
```

A healthy trivial probe cannot certify expensive bbox queries, camera coverage or real concurrency. If runtime errors/502 occur, stop rather than increasing query limits.

## 4. Attribute 502/invalid JSON and resource pressure

For the same bounded window, inspect the actual Overpass/front-proxy logs locally (at most1000lines) and kernel OOM evidence (at most100lines):

```sh
journalctl -u overpass --since '2026-10-28 01:00:00 UTC' --until '2026-10-28 01:05:00 UTC' --no-pager -n 1000 -o short-iso
journalctl -k --since '2026-10-28 01:00:00 UTC' --until '2026-10-28 01:05:00 UTC' --no-pager -n 100 | rg -i 'oom|out of memory|killed process|memory cgroup'
```

Raw service logs may contain query coordinates; retain privately. Record only categorical summaries, counts, UTC windows and resource numbers. Do not assume absence from the last100lines proves absence of OOM. Correlate actual proxy status, upstream_status, request_time and upstream_response_time when those fields already exist. Do not change access-log format/configuration as part of this audit. Distinguish proxy connect refusal/reset/upstream timeout from Overpass dispatcher admission/runtime memory errors. Identify content type/byte count and presence of remark/schema errors; never log full bodies.

For browser504, correlate Cloudflare trace/Server headers and existing Nginx/Gunicorn/Flask timing records. Server/CF-Ray headers alone do not identify the generator. If no shared request ID exists across layers, retain that limitation and use a controlled isolated reproduction. Do not raise timeouts to hide a saturated query path.

## 5. Evidence to return for Phase11B

Provide a sanitized table: deployed SHA; request ID (if available); endpoint slot/local-versus-public; fixed query kind; started/finished/response-ready offsets; budget presence/remaining; attempts/status categories; bytes/elements and remark presence; active/queued tasks if already measurable; installed worker/dispatcher limits; time-window memory/OOM/proxy categories; extract freshness. Mark missing values UNKNOWN. Existing diagnostics do not measure queue depth, bytes, dispatcher load or direct-call operation IDs; do not invent these from thread counts.

Do not replay the user's private route or run large `out body`/`out geom` scans against production for this audit. Query-complexity and sustained-concurrency profiling belong on an isolated clone with bounded fixtures and separately approved resource limits. No real infrastructure command above was executed during Phase11A.
