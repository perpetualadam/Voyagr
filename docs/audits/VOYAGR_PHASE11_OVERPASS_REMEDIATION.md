# Phase 11B — Overpass remediation

Status: **PHASE11B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: merged Phase11A PR #352, `d0482d3eb00ba883b74b362692f67a69eb873372`; Phase10 `12def1c46a4e9fc5cf7666c2fedbc3ae12b911ee` is preserved. All infrastructure/Contabo acceptance below is NOT_TESTED. No SSH, production query, deployment, restart, configuration/data/graph change, paid provider or new infrastructure dependency was used. Phase11A reports remain unchanged as historical evidence.

## Root causes and before/after behavior

|Defect reproduced in11A|Before|Phase11B correction|
|---|---|---|
|Invalid-empty coverage|Missing elements/remark JSON accepted and cached; loader could report AVAILABLE|Byte-bounded streamed reads, JSON/OSM element validation, explicit response classification; errors never cached as successful data|
|Endpoint instability|Permanent failure-count sorting; repeated endpoint visits; local recovery not probed first|Ordered endpoints with monotonic cooldown expiry, one traversal, bounded per-endpoint attempts; expired local cooldown permits recovery in original configured order|
|Duplicate concurrent misses|Equivalent caller labels split cache; identical misses issued separate HTTP calls|Canonical QL/source/category/schema/revision identity and bounded process-local single-flight; labels cannot override semantic identity|
|Viewport abandonment|Two active threads but unbounded pending executor queue;12s caller wait left unbudgeted work|Admission semaphore caps owned futures at2; independent WorkBudget; timeout cancellation signal; queued-future cancellation and late-result rejection; slots retained until completion|
|Deadline misclassification|Deadline subclass caught as provider Timeout; preparation caught it and entered next acquisition|Explicit propagation before generic catches; budget check even on cached results; local acquisition-cap exhaustion distinct from parent routing deadline|

Six new regressions failed on baseline before corrections. The original11A scenario tests remain, with assertions changed to corrected behavior; the reports preserve old findings. Speed-specific tests now mock the acquisition boundary while retaining all prior speed/evidence assertions. One coverage fixture explicitly declares VERIFIED source evidence rather than implicitly trusting empty success. Real client output never fabricates VERIFIED dataset coverage.

## Response and evidence contract

`response_state` distinguishes VALID_WITH_DATA, VALID_EMPTY, PARTIAL, INVALID_RESPONSE and UNAVAILABLE. STALE maps to existing hazard coverage status and expired cache evidence (`previous_evidence_state=STALE` on failed refresh). Valid empty requires an object with an elements list and no remark/error. OSM element types, integer IDs, tags, coordinate/geometry/way-node structures are checked. Explicit runtime remarks, malformed/truncated JSON, HTML, wrong content type and size/element overflow are rejected; runtime partial/error output is not offered as complete hazard evidence or cached.

Transport reads decoded chunks up to2MiB, checks deadlines between chunks and closes responses, including late streaming responses rejected by the shared transport. JSON parsing operates on the bounded buffer;20,000elements and64KiB query limits bound further processing. Server maxsize directives are added to active builders; they do not replace client caps. This is cooperative CPU/socket checking, not a hard-preemptive JSON parser or socket guarantee.

Evidence retains original retrieved_at, response classification, endpoint class/slot, source revision (unknown unless supplied) and OSM dataset timestamp if provided. Cache hits do not reset acquisition time. Failed refreshes never overwrite valid evidence. Cache expiration uses monotonic TTL with a wall-clock freshness sanity check; expired/backward-clock evidence is discarded, not relabelled AVAILABLE. Cache envelopes are copied, not shared mutable lists. Cache limits:128entries and16MiB serialized equivalent; Python heap usage can be larger.

A healthy endpoint is **not** complete UK coverage. Actual client responses carry dataset_coverage=UNVERIFIED and coverage_status=PARTIAL even for VALID_EMPTY. Bbox hazard loaders preserve that limitation, original timestamp, stable `osm_node_ID`, source and observation time. Unknown/failed evidence stays UNKNOWN; stale evidence stays STALE; output slicing/missing coordinates stays PARTIAL. The existing independent assessor refuses automatic mandatory selection for these states. Preference navigation remains best effort, without claiming zero hazards proves absence. No coverage manifest or native road association was invented.

## Endpoint and resource policy

OVERPASS_API_URL remains the configured self-hosted preference; no localhost endpoint is silently invented when absent. Default public allowlist remains the existing four HTTPS mirrors. OVERPASS_PUBLIC_ENDPOINTS optionally selects an explicit subset; an empty value intentionally disables public fallback, invalid public entries fail configuration validation. No production env was changed. The configuration is read at import; restart/reload policy is outside this task. Constructor endpoints are explicit, validated and limited to5; credentials, query strings, fragments and redirects are rejected. LOCAL means configured self-hosted/private endpoint; PUBLIC identifies the built-in allowlisted mirrors, not an assertion about ownership or coverage.

For each uncached query, one configured-order traversal, at most3attempts per local endpoint and2public endpoints with one attempt each. The normal one-local configuration allows at most5HTTP calls and12s cooperative acquisition time, capped by any parent budget. Connection/read inactivity timeouts are clamped to remaining time. Normal defaults use1s/2s local backoff; no final unnecessary wait. Invalid/schema/partial data breaks to fallback. Failures cool down endpoints for2s;429 respects bounded numeric or HTTP-date Retry-After (max60s). No sleep/retry cascade on429: the endpoint is cooled, sequential fallback may proceed. If no later endpoint exists and retry delay cannot fit, insufficient-budget propagates. Cooldown expiry probes local again rather than permanently demoting it. Health operations are locked; selection and admission are process-local. No independent capacity of public aliases is assumed.

Active shared-client limits:2transports and32in-flight identities per process, admission rejection rather than network queues. Local-first refers to configured ordering; explicit custom constructor order is authoritative. Cold start probes a configured category; only validated responses demonstrate query support, never full extract completeness. State is bounded and health entries expire logically on selection. There is no distributed admission controller.

Traffic/rail bbox extent remains at most0.35degrees per axis, now also enforced by builders and the post-route traffic-light overlay. POI/parking radius must be1–5000m; POI category clauses <=32. The unused corridor builder is bounded to250points/500m radius. Oversized requests fail or return explicit partial/unavailable metadata rather than silently making a whole-country scan. Post-download hazard caps120/100/200 remain, with partial coverage. Exact equivalent snapshots reuse the shared cache within and across requests; differing bounds/QL/resource limits do not silently alias.

## In-flight identity and cancellation

Canonicalization tokenizes whitespace outside quoted values while preserving numbers, clause order, string contents and operators; queries containing comments conservatively keep exact bytes. This intentionally does not claim algebraic equivalence for all Overpass QL. The private cache digest includes endpoint source set, category, schema version and dataset revision. It is never logged. Distinct query semantics/versions cannot share a flight. Endpoint provenance follows the actual result.

The owner runs synchronously in its calling worker; no coalescing background executor is introduced. Waiters share a copied completed result but retain independent parent/cancellation budgets, polling at most50ms. One cancelled/expired waiter cannot cancel another caller. Owner failure/cancellation/deadline wakes waiters with unavailable evidence and a categorical original reason; a waiter is not granted unverified success. Flights are removed on success/failure, and bounded waiter deadlines prevent indefinite waits. A physically blocked owner retains its slot until the socket returns; no hard thread cancellation or safe eviction of still-running owners is claimed. Process-local coalescing prevents same-process duplication; distinct Gunicorn workers can still duplicate queries. Redis was not introduced.

WorkBudget uses ContextVar isolation and propagates metrics to the parent routing budget. Cancellation/cache publication share a lock through child budgets, defining publication before-or-after cancellation. Cancelled/late work cannot publish newer cache state. Own12s acquisition-cap exhaustion returns UNAVAILABLE if route time remains; the real shared deadline and explicit cancellation propagate. Viewport tasks have their own budget and diagnostic trace, without copying unsafe Flask context. Browser aborts do not automatically reach Flask; existing client generation/cancellation guards still reject stale UI responses.

## Active caller migration and navigation integrity

PWA lane and speed-limit OSM acquisition now use the same helper, validated responses, configured endpoints and budgets. Their conservative posted-speed/lane applicability rules are unchanged. The existing speed-query public throttle remains, using monotonic, budget-aware waits; helper429 cooldowns apply to fallback endpoints. Lane cache timestamps use original acquisition time and do not negative-cache acquisition errors. Search and route-signal handlers no longer have unvalidated ImportError direct-request fallbacks. Legacy desktop `lane_guidance.py`, `hazard_parser.py`, and the explicitly operator-approved Phase8 XML exporter remain outside this active PWA remediation.

Phase10 GraphHopper-first ranking is unchanged: valid eligible Optimised first, even with more nearby markers; mandatory-ineligible alternatives remain blocked. GraphHopper8 collision-safe camera/OSM/CAZ models and capability-aware toll behavior are untouched. Valhalla distinct alternatives and OSRM honest fallback, geometry/checksum binding, multi-stop gates, GPS/offline/dashcam authentication remain covered by existing suites. New tests specifically combine unavailable OSM evidence with mandatory/preference ranking and every multi-stop leg.

## Privacy-safe observability

Existing opaque request/operation IDs, PID/thread and monotonic durations remain. New events add LOCAL/PUBLIC class, attempts, bounded status/retry categories, response and coverage states, cache/shared outcome, admission rejection and cancellation outcome. No exact coordinates, query text/digest, endpoint URL, auth data, full body/model or exception message is logged by the new helper. Overpass parking-coordinate/endpoint logs were removed, and active lane/speed acquisition logs use categorical errors. Internal hazard IDs and diagnostic values are ASCII machine identifiers; user-facing route labels remain unchanged. General TomTom/Nominatim/legacy logging is not comprehensively redesigned here.

## Remaining risks

The installed502/invalid-JSON generator, memory pressure, dispatcher/proxy topology, dataset coverage/freshness and historical504 attribution remain unproven. Complete source provenance and real graph-backed avoidance/physical-device acceptance are outstanding. Strict validation/copies have measured CPU/memory cost; retain bounded load testing on an isolated clone before choosing production limits. No automated test result grants production GO.

## Complete changed-file inventory

24 files:

- `.env.example`
- `.github/workflows/ci.yml`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
- `docs/audits/VOYAGR_PHASE11B_OVERPASS_PERFORMANCE.json`
- `docs/audits/VOYAGR_PHASE11_CONTABO_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE11_OVERPASS_PERFORMANCE.md`
- `docs/audits/VOYAGR_PHASE11_OVERPASS_REMEDIATION.md`
- `docs/audits/VOYAGR_PHASE11_RETRY_AND_DEADLINE_TESTS.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `overpass_helper.py`
- `scripts/benchmark-phase11b-overpass.py`
- `speed_limit_detector.py`
- `tests/test_phase11_overpass_audit.py`
- `tests/test_phase11b_overpass.py`
- `tests/test_routing_avoidance_integrity.py`
- `tests/test_routing_request_budget.py`
- `tests/test_speed_limit_detector.py`
- `tests/test_speed_limit_fixes.py`
- `voyagr/api/hazards.py`
- `voyagr/api/navigation.py`
- `voyagr/api/search.py`
- `voyagr/services/hazards.py`
- `voyagr/services/routing/hazard_prep.py`
- `voyagr/utils/request_budget.py`
