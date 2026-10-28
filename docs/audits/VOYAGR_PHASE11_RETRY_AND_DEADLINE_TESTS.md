# Phase 11B — Retry and deadline tests

Status: **PHASE11B_PARTIALLY_VERIFIED**. Production remains **NO-GO**.

Baseline: merged Phase11A PR #352, `d0482d3eb00ba883b74b362692f67a69eb873372`; Phase10 `12def1c46a4e9fc5cf7666c2fedbc3ae12b911ee` is preserved. All infrastructure/Contabo acceptance below is NOT_TESTED. No SSH, production query, deployment, restart, configuration/data/graph change, paid provider or new infrastructure dependency was used. Phase11A reports remain unchanged as historical evidence.

## Baseline and before-fix evidence

Before code changes, configured backend selection passed839tests +68subtests; baseline Jest/coverage, lint and isolated SQL passed. PR352 merged status and Phase10/11A ancestry were checked. Six new failing tests are recorded in the development RED run: invalid/missing/remark envelopes (3), expired cache hit, equivalent-query label split, concurrent duplicate misses. These now pass. Historical11A tests were migrated to assert corrected behavior, not removed or weakened to conceal a failure.

## Final executed validation

|Selection|Result|
|---|---|
|Exact configured backend file list in `.github/workflows/ci.yml`|882passed,68subtests passed|
|New `tests/test_phase11b_overpass.py`|43tests included in backend|
|Jest `npm run test:ci -- --maxWorkers=2`|99suites,1,924tests passed; coverage thresholds preserved|
|`npm run lint:tests`|Passed|
|`scripts/test-dashcam-session-sql.py`|11passed on disposable local PostgreSQL, no production DSN|
|Python compilation / diff whitespace check|Passed|

The final hosted Backend, Frontend and SQL checks remain the existing required checks; the PR records their status. Desktop/Kivy/custom-router/live-service suites outside configured selections were not executed. No real Overpass/Contabo/GraphHopper request was executed. Loopback benchmark HTTP is a disposable fixture, not a routing engine.

## Scenario coverage

Actual helper/transport/Flask paths cover valid data/empty, malformed/HTML/truncated/wrong-schema data, runtime remarks with empty/partial elements, body/element limits, HTTP502/503/504,429 numeric/date Retry-After, cooldown expiry/local recovery, public fallback/exhaustion, duplicate equivalent queries, multiple waiters, one cancelled/short-deadline waiter, owner failure, bounded flight/transport admission, cache source/version identity, failed refresh and original timestamps, stale evidence and bounded cache eviction.

Deadline tests cover entry/cache-hit checks, slow initial transport, response close on late streaming rejection, expiry between chunks, insufficient/during backoff, per-acquisition versus parent deadline and no additional provider I/O. Request-budget exception assertions remain strict. Traffic-light preparation now raises immediately and never enters railway acquisition after a deadline; lane/speed paths also propagate expired budgets without transport.

Viewport tests call actual `_run_osm_area_fetch`, with short test-only clocks/waits and synchronization events: two admitted tasks, third rejected, timeout signals cancellation, late futures are joined and cannot cache results. These are cooperative-control fixtures, not proof that a running socket can be killed. Simulated browser disappearance is distinguished from explicit server cancellation; real disconnect behavior remains NOT_TESTED.

Actual independent assessment verifies unavailable/partial OSM evidence cannot satisfy mandatory restrictions; preference routes remain eligible best effort with GraphHopper first. Multi-stop assessment checks every leg. Existing graph custom-model compatibility, unsupported toll, provider fallback, source-conflict/road-association, manual alternative selection, UI cancellation/stale-response, style recovery, GPS/offline and dashcam SQL/auth checks remain in configured selections.

## Limits and cleanup

No uncontrolled test sleeps or live service probes are used in regressions: concurrency uses bounded Event/Barrier/Future waits. Completed/failed flights and admitted tasks release ownership; a stuck physical socket retains bounded ownership rather than creating replacement background tasks indefinitely. Per-process controls do not certify multi-process capacity or hard deadlines. Browser AbortSignal is not a Flask cancellation transport. Operator acceptance remains mandatory; see CONTABO_ACCEPTANCE.
