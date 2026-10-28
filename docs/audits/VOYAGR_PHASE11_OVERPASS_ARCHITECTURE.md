# Phase 11A — Overpass architecture

Status: audit completed against Phase 10 main `12def1c46a4e9fc5cf7666c2fedbc3ae12b911ee`; production root cause only partially verified. Production remains NO-GO. No SSH, production query, restart, deployment, configuration or data change was performed. Findings below refer to source and deterministic fixtures unless explicitly labelled operator-reported.

## Caller inventory

A repository-wide Python search for `overpass`, `interpreter`, `query_overpass` and query-builder references, plus browser call-chain inspection, found these callers. Imported names alone are not proof of execution. Desktop/Kivy callers are distinguished from the active Flask/PWA path.

|Caller / entry point|Query / output|Endpoint / transport|Budget and concurrency|
|---|---|---|---|
|`routing/hazard_prep.prepare_route_hazards` → `services/hazards.fetch_traffic_lights_osm_bbox`|Traffic signal and signal-crossing nodes, bbox; QL15s, `out body`|Shared helper POST|Route30s Flask-local budget reaches transport; synchronous; preparation catches deadline exceptions|
|Same preparation → `fetch_railway_crossings_osm_bbox`|Railway level crossings, bbox; QL20s, `out body`|Shared helper POST|Same route budget, sequential after signals; preparation also catches exceptions|
|`GET /api/traffic-lights/area`, `/api/railway-crossings/area`|Same bbox builders, map viewport|Shared helper inside `_run_osm_area_fetch`|Two-thread executor per process; caller waits12s; task has no Flask context/budget and is not cancelled|
|`POST /api/traffic-lights` (`api/hazards.get_traffic_lights`)|Route-shape bounding rectangle plus0.001-degree buffer, not a road corridor; signals QL15s|Shared helper; ImportError-only direct configured POST fallback with QL/HTTP30s|Separate HTTP request, not under `/api/route` budget; no35km/0.35-degree guard in this route path|
|`api/search.search_parking`|Nodes + ways `amenity=parking`; QL25s, `out center tags` limit1–20|Shared helper; import-failure direct configured POST10s, one429 retry after2s|No routing budget; radius comes from request, default800m; result cap is not a query-work cap|
|`api/search.search_poi`|Amenity/shop nodes around point; QL10s, `out body`|TomTom-first, then shared helper, then Nominatim as applicable; import-failure direct POST15s|Separate HTTP request; default radius2000m, no shared route deadline|
|`GET /api/speed-limit` / `speed_limit_detector._query_overpass_posted_limit`|Ways `[highway]` around location, `out geom tags`; QL/HTTP8s; default30m radius, clamp in `overpass_speed_around_meters`|Direct GET; reads env endpoint at call time; default **HTTP** public overpass-api.de|Bypasses shared cache/retry/budget. Optional TomTom cross-check can add a query. Rate-limit wait uses wall clock and raw sleep|
|`GET /api/lane-guidance` → `api/navigation._fetch_osm_lane_data`|Major highway ways around30m, QL/HTTP5s, `out tags`|Direct GET to **hard-coded HTTP public** overpass-api.de|Ignores configured local endpoint and request budget; rounded location cache300s, including negative successful lookups|
|`lane_guidance.LaneGuidance`|Legacy OSM lane tags, HTTP5s|Direct GET hard-coded public HTTP|Used by `satnav.py`, not imported as the PWA lane implementation; outside active web path|
|`hazard_parser.HazardParser`|Camera, toll and hazard node/way acquisition, POST10s|Hard-coded HTTPS public overpass-api.de|Standalone/legacy desktop use; not active SCDB/PWA camera ingestion. `satnav.py` imports other parser functions; no Flask caller found|
|`scripts/export-phase8-road-evidence.py`|Explicit approved offline graph-evidence export: highways, turn restrictions, signals/cameras/crossings; XML QL10s with maxsize|Operator-only literal-loopback endpoint, HTTP connect/read2/15s, streaming byte cap, no redirects/retries|Not invoked by web requests; do not run during this audit|

`voyagr_web.py` imports shared helper/builders for compatibility but no additional query invocation was found. `build_corridor_traffic_signals_query` creates QL60s around-polyline queries but has no repository caller. Its comment that self-hosted Overpass can handle60s is not installed-capacity evidence. PWA road-match/road-context consume existing road evidence; no additional Overpass query was found there. GraphHopper geographic areas and CAZ polygons are composed from existing sources, not an Overpass query inside GraphHopper itself. SCDB camera ingestion is distinct from legacy `hazard_parser` OSM camera acquisition.

## Configuration and selection

`overpass_helper.py` reads `OVERPASS_API_URL` **at import** without stripping whitespace and prepends it to four default HTTPS public URLs (overpass-api.de, lz4, z, kumi). If it equals an existing public entry, it is not moved to the front. `OverpassClient(endpoints=...)` overrides this list when truthy; an empty list falls back to defaults. The lazy singleton and global cache are per-process. Runtime env edits do not refresh them. No local-only/public-fallback opt-out exists in this helper.

Selection is not strict configured-order failover: `_get_next_endpoint` sorts by persistent in-process failure counts. A local connection failure adds1 plus10 at endpoint-loop completion; a public success resets that public count. The **next** unrelated query may start publicly. Failures do not decay, so local recovery is not automatically probed first. Endpoint-loop iterations do not maintain a visited set; a heavily penalized public mirror can remain untried while the same local endpoint is selected again. DNS/backend independence of public aliases is not verified.

`api/search.py` snapshots a stripped configured endpoint for its direct import-failure paths; speed detection reads its env endpoint dynamically; lane acquisition ignores the env. Speed rate-limit mode is chosen at detector construction by hostname substring (including a fixed legacy IP), not provider-health evidence. Local detection disables rate limiting; public mode defaults2req/s. It is not a cross-process admission controller.

## Retry and deadline lifecycle

Default helper settings:20s scalar requests timeout,3 attempts per selected endpoint,4 public endpoints or5 with a distinct local URL. HTTP429 and5xx wait1,2,4 seconds, **including after the last attempt**. Timeout does the same; connection error and malformed JSON break to endpoint selection. Other4xx return immediately. Loops are finite, not unlimited; without a route budget,15 attempted reads ×20s plus35s sleeps is335s of nominal configured exposure for local+four publics. This is not a hard wall-clock bound: connect/read limits are separate, response trickles and DNS/processing can extend occupancy. Client retries can multiply this externally.

The shared transport consults Flask `g.routing_budget`, clamps connect/read limits to remaining time and checks before/after I/O; retry sleeps refuse insufficient remaining budget. A cache hit returns before that helper budget check. `RoutingDeadlineExceeded` subclasses requests Timeout, so the helper logs it as a provider timeout before a second budget-aware wait raises it. Hazard preparation catches it and can enter the next acquisition path. Phase10's outer hazards-stage final check and pre-provider checks reject expired work; no actual GraphHopper HTTP call after expiry was reproduced. A log mentioning provider entry/attempt is insufficient proof of transport I/O, especially without request IDs or deployed revision.

Single `/api/route` signal/crossing acquisitions are sequential; no executor was found in that call chain. A single user interaction can concurrently issue **separate** route, map viewport, post-route signal overlay, speed and lane requests. Overlay orchestration calls `/api/traffic-lights`, while map overlay toggles call the area endpoints. The Gunicorn service example uses4workers ×4threads, but installed settings are unverified. Same PID/second therefore cannot establish same request. The existing calculate_route finally `request_completed` event also precedes Flask after-request assessment/serialization and is not proof of HTTP delivery.

The viewport executor has2 active workers per process but an unbounded pending queue. `future.result(timeout=12)` bounds only the HTTP wait. Running and queued work is neither stopped nor cancelled after timeout; browser AbortController does not signal Flask or Overpass. Executor work lacks the request-local budget; it can continue public retries after its initiating response. Across multiple Gunicorn processes, cache, failure history and pool limits are separate. Identical simultaneous cache misses have no single-flight lock, and global cache growth has no size cap/automatic sweep on insertion (expired entries are removed on access or explicit cleanup).

## Response, size and hazard coverage

The helper buffers the complete response and calls `.json()` without a content-type, payload-size, Overpass `remark`, schema or elements-type check.200 HTML, empty body and truncated JSON trigger JSON errors and fallback;502 HTML triggers server retries before parsing. A valid `elements:[]` is a legitimate empty result. However `{}` or `{"remark":"runtime error..."}` is also treated as an empty success and cached300s; non-list elements are accepted. A runtime-error remark with partial elements is likewise not rejected. This is an application completeness-validation defect, not proof that production's0-element result was false.

Service bbox helpers skip spans over0.35 degrees and slice to120signals/100crossings (viewport200), marking truncation PARTIAL. These are post-download limits, not server/network/memory bounds. An error-only JSON result can become empty AVAILABLE coverage. Existing road-association and mandatory gates remain unchanged; AVAILABLE alone is not trustworthy graph-backed applicability. Query server timeout directives15/20/25/60 are not process-memory limits. Most active queries have no explicit maxsize. Large5295-element output is neither inherently invalid nor evidence of overload; actual bytes/query area/duration/load are needed.

## Diagnostic additions and limits

New `overpass_audit` INFO events contain server-generated request IDs, random operation IDs, PID/thread, monotonic elapsed/duration, fixed query-kind categories, endpoint **list slot**, attempt number, HTTP status and budget presence/remaining milliseconds. No query text/hash, cache key, URL, body, coordinates, headers or exception message is added. A success/cache/failure/deadline outcome is recorded. Slot meaning is relative to each client's configured list, not a stable global provider identity.

Every `/api/` response receives `X-Voyagr-Request-ID`; untrusted client IDs are ignored. `response_ready` means Flask prepared a response, not delivered it or freed a worker. Diagnostic identity alone propagates into existing viewport tasks; Flask context/budget is deliberately not copied. Submission/start/wait-timeout/finish events reveal abandoned queued/running work. Direct lane/speed requests get the enclosing request boundary but no helper attempt events. This is not full distributed tracing, cancellation or admission control. Existing legacy log lines can include endpoint strings, exception text and parking coordinates; do not publish raw logs. Sanitizing those legacy paths is a Phase11B privacy follow-up.

See ROOT_CAUSES for reproducible evidence and CONTABO_DIAGNOSTICS for bounded operator steps. No routing behavior, retry, endpoint selection, coverage policy or infrastructure was changed in Phase11A.

## Complete changed-file inventory

9 files:

- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_PHASE11_CONTABO_DIAGNOSTICS.md`
- `docs/audits/VOYAGR_PHASE11_OVERPASS_ARCHITECTURE.md`
- `docs/audits/VOYAGR_PHASE11_OVERPASS_ROOT_CAUSES.md`
- `overpass_helper.py`
- `tests/test_phase11_overpass_audit.py`
- `voyagr/api/hazards.py`
- `voyagr/utils/overpass_audit.py`
- `voyagr_web.py`
