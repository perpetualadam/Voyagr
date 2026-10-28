# Phase 11B — Contabo acceptance

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
