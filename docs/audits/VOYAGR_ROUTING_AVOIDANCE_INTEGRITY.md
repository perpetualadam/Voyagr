# Phase 4 — routing avoidance integrity

Date: 2026-10-27. Source baseline: `ba844c072f3811566587b3bec3a447444bcc0892` (main after PR #339).

**Decision: PARTIALLY_VERIFIED. Overall production status: NO-GO.** The Flask/PWA now separates requested preferences from mandatory requirements and independently bounds compliance claims by available evidence. Deterministic tests establish software behavior; installed provider graphs, road accuracy and real devices have not been validated. No production deployment, data or configuration change was performed.

## Architecture and data flow

1. PWA route controls store `routePreferences` and `pref_*` toggles in localStorage. Existing labels say “prefer”; their default remains best effort. The new enforcement selector explicitly opts into mandatory handling. `routing-request.js` builds normal and reroute bodies. `avoidance-integrity.js` appends the canonical mode/optional category overrides and captures a shared request sequence plus preference snapshot before asynchronous work.
2. Calculate-route orchestration geocodes and POSTs `/api/route`; GPS orchestration POSTs deviation reroutes; traffic orchestration POSTs closure/congestion reroutes. Each rejects stale responses, including preference changes during requests. Delayed preview callbacks also check request identity.
3. A Flask before-request hook normalizes the canonical contract before existing validation/parser logic. Explicit categories map onto existing coarse provider flags; unsupported fine distinctions are evaluated independently. Explicit category overrides bypass coarse legacy cache keys. Existing mode/waypoint/preference cache isolation remains in place.
4. `voyagr_web.calculate_route` delegates optimized stops to `routing/multidrop.py`, otherwise checks memory and persistent SQLite caches. `hazard_prep.py` collects local cameras, existing TomTom incidents, explicit avoid points and bounded Overpass light/crossing overlays. Acquisition snapshots are request-local via Flask `g`; shared acquisition objects are copied before filtering. Scoring preferences cannot erase camera evidence used by the independent verifier.
5. GraphHopper can supply an early camera-avoidance candidate and Optimised option using custom models. Valhalla orchestrator builds primary/alternative requests with costing options and exclusion locations, may retry with fewer exclusions, then recover with baseline/minimal payloads. Discovery/enrichment add Quiet/Scenic/other options, score hazards, apply traffic/costs and preserve existing detour settings. Final fallback is OSRM.
6. One after-request hook evaluates every successful JSON navigation result from `/api/route` and `/api/multi-stop-route`, including early returns, reduced recovery, alternatives and cache hits. Every multidrop leg is checked and the worst result is aggregated. On cache hits old assessments are ignored; only current local camera acquisition is added, with no additional network/paid query. Missing overlay provenance remains unknown. Cache objects are deep-copied before annotation.
7. Frontend route normalization and selected-option merging preserve the selected route's assessment rather than inheriting primary compliance. Manual navigation start and offline resume pass through the lifecycle gate. Mandatory unresolved routes require explicit acceptance before starting; malformed geometry cannot be overridden. Automatic calculate/GPS/traffic map replacements use the common map gate, keep the current route on rejection and do not prompt while moving. A declined warning leaves preview start controls available.
8. `routing_engines.py` is a separate legacy manager. Its results now use the same evaluator and each fallback is evaluated once. `satnav.py` also contains direct provider/desktop paths that do not use this HTTP boundary; they retain legacy preference semantics. Full desktop lifecycle enforcement is NOT_VERIFIED, and desktop Kivy tests were not executed. Administrative parallel-provider diagnostic probes are not navigation responses and are outside the HTTP hook.

## Confirmed defects, causes and corrections

| Defect / evidence | Cause | Correction |
|---|---|---|
| Missing hazards became indistinguishable from checked-empty results | Acquisition returned plain empty lists on failure, skipped large bounding boxes or truncation | List-compatible provenance distinguishes UNKNOWN/PARTIAL/AVAILABLE, bounded query extent and acquisition time. No trustworthy camera ingestion coverage is invented. |
| Fallback/recovery/cache success did not prove selected exclusions | Provider options/penalties and old cached claims were treated separately from final selection | Common evidence-based assessment on every public navigation success branch; mandatory unresolved options are excluded from automatic selection; no-compliant result is explicit. Recovery warnings are preserved and extended. |
| Hazard late along a route was missed by score/display | Sampled route vertices; loop stopped after the first distant vertex | Geographic segment index checks full segments. Baseline replay of the original actual scorer returned `(0, 0)` for a mid-segment camera; patched actual scorer returned `(3000.0, 1)` on the same isolated fixture. |
| OSRM hazard scoring used the wrong polyline precision | Precision-5 encoded OSRM string reached helpers assuming precision 6 | Decode once at OSRM boundary and pass coordinates to real scorer/display functions. Regression asserts a nonzero actual hazard count. |
| Legacy manager Valhalla shape/units were incorrect; OSRM assumed GeoJSON | Encoded Valhalla strings treated like coordinates, km divided again; OSRM geometry type assumed | Decode/concatenate all Valhalla legs and retain km; request OSRM polyline6, also tolerate GeoJSON; expose precision. |
| Public fallback profile name could silently imply cycling/walking support | URL profile labels did not establish the installed OSRM graph/profile | Default configured fallback accepts driving only; unsupported modes return explicit failure. `OSRM_SUPPORTED_PROFILES` is an operator capability declaration, not discovery or proof; no environment variable was changed. |
| Stale route result could replace newer decisions | Independent request handlers lacked shared ordering and preference identity | Shared sequence/revision/snapshot checks across calculation, GPS and traffic, including delayed previews and errors. |
| Selected alternative could inherit primary assessment | Route normalization/merge discarded new metadata | Preserve selected assessment and preference snapshot; GPS previous-name selection cannot prefer an assessed noncompliant route. Central map/start gates provide final enforcement. |
| Camera scoring filters could erase verification evidence | Provider ranking filters mutate camera buckets | Capture unfiltered camera evidence separately; provider ranking behavior remains intact. |

## Canonical contract and evidence policy

`avoidance_mode` is `preference` by default or explicitly `mandatory`. Optional `avoidance_requirements` overrides individual categories with `{category, enabled, mode, scope:"route"}`. Unknown/duplicate categories, non-boolean flags and invalid modes/scopes receive 400 rather than silent downgrade. The server computes a stable request fingerprint. Client coverage, hazard lists and compliance claims never establish evidence.

Categories: speed cameras (including average-speed points), red-light cameras, other cameras, traffic lights, railway crossings, other existing road hazards, explicit avoid points, tolls, CAZ, congestion charging, motorways, ferries and unpaved roads. Coarse legacy flags remain accepted. The legacy master hazard switch conservatively enables generic hazard evaluation; database scoring preferences remain a separate best-effort ranking mechanism. Category-specific UI controls are not newly invented; the API supports per-category mandatory/preference overrides.

Each route has `avoidance_assessment`: version, request fingerprint, checked time, geometry validity, category requirements/results, data coverage/source, engine capability, conflict/uncertain counts, `automatic_selection_allowed`, `requires_acceptance` and bounded claim. Enabled results are SATISFIED, VIOLATED, UNVERIFIED or UNSUPPORTED. No automatically eligible route yields top-level `NO_COMPLIANT_ROUTE`; alternatives remain available for explicit review. Disabled categories have SATISFIED/disabled meaning only that no constraint was requested. Invalid geometry always prevents selection, including when avoidance is disabled.

Mandatory selection requires every enabled mandatory category SATISFIED. Preference-only conflicts preserve existing ranking/ordinary navigation and receive limitations; a mixed contract does not turn a preference into a mandatory block. A manual override never rewrites a conflict to SATISFIED. The UI describes “verified against available data only”, “best effort”, “unverified”, “unsupported” and “known conflict”; it never claims hazard-free travel. Assessment freshness and checked acquisition freshness are limited to 600 seconds, with future timestamps rejected. Offline mandatory continuation requires explicit acceptance because fresh evidence cannot be established.

Coverage requires every relevant bucket to have explicit successful, untruncated acquisition bounds containing the entire route and a fresh timestamp. Queries outside scope, truncation, errors, stale data, missing bounds and partial evidence cannot establish SATISFIED. Successful empty Overpass results mean checked available OSM data, not complete real-world coverage. Cached Overpass responses conservatively subtract the full 300-second acquisition-cache TTL from freshness; missing-coordinate records mark coverage PARTIAL. Acquisition time does not establish the age of the real-world OSM feature. Camera SQLite rows lack trustworthy ingestion coverage, way identity and directional provenance; local empty data therefore remains UNKNOWN. CAZ/congestion cost polygons are point-sampled estimates without verified completeness: the new evaluator leaves these requirements UNVERIFIED (OSRM UNSUPPORTED), never promotes cost estimates to compliance. No new polygon/zone enforcement guarantee is made.

Native toll/road-class hints alone do not prove compliance. Trusted segment attributes must cover every segment and carry fresh verification time to establish a negative; known prohibited attributes establish a conflict. Current adapters do not supply this complete trusted attribute evidence. Provider option acceptance is never proof.

## Engine capability matrix

These are **configured source integrations**, not tested installed capabilities. No Valhalla/GraphHopper graph is running in this environment; no live routing or paid API calls were introduced for this investigation.

| Provider/path | Exclusions / penalties requested by Voyagr | Alternatives / vehicle support requested | Mandatory enforcement evidence | Failure/incomplete behavior |
|---|---|---|---|---|
| Valhalla Flask integration | `exclude_locations` snapped point requests (capped/reduced on retries); toll/highway/ferry/surface costing preferences; CAZ sampled exclusions. No direct excluded-way-ID/polygon guarantee | Alternates, preference-derived routes, auto/pedestrian/bicycle; restrictions depend on graph/profile | Native hard enforcement NOT VERIFIED. Common verifier can establish only fresh, scoped available-data results | Existing reduced/baseline/minimal recovery and OSRM fallback retained; final assessment cannot inherit success from accepted options; invalid geometry/unproven constraints cannot auto-satisfy mandatory mode |
| GraphHopper Flask integration | Flexible custom-model areas with zero/low priority, road-class/surface/costing rules, camera/light/crossing/incident areas; CH disabled where required. No trusted segment-ID exclusion proof | Alternative/preference candidates; configured vehicle profiles require actual installation validation | Polygon/custom-model requests tested offline, installed encoded values and road restrictions NOT VERIFIED; common verifier independent | Existing refusal of unfiltered fallback for hard custom rules retained; errors continue to Valhalla/other candidate paths; malformed/missing geometry is not eligible |
| OSRM configured public fallback | No wired camera/zone polygons, point exclusions or custom penalties. Profile-dependent exclude support not assumed | Alternatives requested where existing path supports them; driving only by default | Native avoidance unsupported. Independent assessment can verify a scoped fixture dataset, never infer enforcement from provider name | Failed requests use existing error behavior; unknown hazards stay UNVERIFIED, unsupported native categories UNSUPPORTED; no-compliant route cannot auto-replace current route |
| Haversine multi-stop estimate | No exclusions or road routing; ordering/time approximation only | Straight-line distance estimate, no valid navigation geometry | Cannot establish route compliance | Missing-geometry leg prevents automatic navigation even when another leg has geometry |
| Legacy `routing_engines.py` adapters | Basic requests; no new native exclusion guarantee | Single route per engine, existing mode mapping; OSRM auto only | Shared evaluator accepts explicit contract/hazard evidence, default remains avoidance disabled | Preferred engine attempted once, then each fallback; malformed results skipped; unresolved result marked NO_COMPLIANT_ROUTE |
| Legacy `satnav.py` direct requests / custom-router references | Separate desktop heuristic/preference implementations | Desktop/Kivy/custom-router dependent | NOT_VERIFIED; no claim new PWA gate covers these paths | Source inspected; desktop runtime/graphs unavailable, no fabricated pass |

## Hazard matching and ranking limits

Compliance uses segment proximity plus trusted road identity, direction and level where available. A same-road/direction match is a conflict; a reliably different road/level or opposite travel direction can distinguish adjacent carriageways, slip roads and bridges. Missing road/direction association near the route remains uncertain. Railway crossings and explicit geographic avoid points cover both directions. Duplicate bucket/identity/location/road/bearing records are deduplicated. Expired records and invalid/excessive positional uncertainty do not produce clean claims. Geographic avoid points are explicit point constraints with the current conservative 50 m matching radius; no polygon/geofence API is invented.

This is not a map-matching engine. The local projected distance approximation and grid are appropriate to the synthetic UK fixtures, not proof for polar/dateline/global long segments. Average-speed sections, roundabout approach associations, complex junction connectivity, tunnel levels without source evidence, moving hazards and road restrictions require better source data. A proximity score used for ranking or marker display is explicitly separate from matched-road compliance.

Existing enrichment sorts hazard penalty then duration, and existing variety/optimization logic applies user `max_detour`; its lexicographic quality is not newly claimed optimal. Preference ranking is unchanged by the evaluator. Only mandatory-eligible alternatives move ahead. Each alternative reports duration detour versus the **fastest returned alternative**, maneuver count and whether mandatory ranking was applied. This is not an independently queried unrestricted fastest baseline; no extra paid/provider call or arbitrary new detour limit was added. Road suitability and comparative real journey quality remain unverified.

## Deterministic validation

Synthetic Doncaster-area coordinates/road identifiers are test data, not surveyed ground truth. Actual matcher, scorers, Flask response hook, legacy adapters, selection and navigation orchestration run; external providers/browser device APIs are mocked where required.

| Fixture | Expected / selected behavior | Assessment |
|---|---|---|
| Camera on main road; adjacent alternative with distinct road ID | Adjacent route selected over primary; 40% returned-baseline detour reported | Main VIOLATED, adjacent SATISFIED against fixture evidence |
| Camera on adjacent/slip road, opposite traffic, or different level | No invented encounter on the tested main route | SATISFIED with trusted fresh fixture coverage/association |
| Light at matched junction; crossing on actual road | Reject automatic selection | VIOLATED |
| Crossing on parallel road | Keep route with independent road evidence | SATISFIED against fixture evidence |
| Unknown road/direction, expired hazard, bad positional uncertainty | No automatic mandatory selection | UNVERIFIED |
| Missing/partial/stale/out-of-bounds coverage | No verified-empty assumption | UNVERIFIED / NO_COMPLIANT_ROUTE |
| Native provider option with no road evidence | Do not claim native enforcement | UNVERIFIED or UNSUPPORTED |
| All providers unavailable or malformed geometry | Existing error response or reject invalid candidate; no fabricated compliance | Failure / UNVERIFIED |
| Failover candidate avoids the fixture camera | Manager/HTTP boundary selects independently verified candidate | SATISFIED against fixture evidence |
| Old cache assessment/current mandatory request | Real Flask cache path recomputes; does not reuse SATISFIED | UNVERIFIED / NO_COMPLIANT_ROUTE |
| Later multidrop leg conflicts | First clear leg cannot mask later conflict | Aggregate VIOLATED / NO_COMPLIANT_ROUTE |
| GPS deviation returns unknown mandatory route | Actual GPS orchestration retains current route, resets in-progress flag, no confirmation while moving | UNVERIFIED |
| Selected alternative conflicts | Actual navigation lifecycle refuses start if acceptance declined; no map mutation; start controls remain available | VIOLATED preserved |
| Out-of-order geocoding/network results or preference change in flight | Actual calculate orchestration discards stale result/status; shared ordering covers reroute handlers | No replacement |
| Avoidance disabled / preference only / mixed modes | Ordinary navigation remains available; satisfied mandatory constraints do not turn unknown preferences into hard blocks | Disabled / best effort |

Final selected runs: **594 Python tests + 68 subtests passed (5.96 s)**, **1,821 Jest tests / 89 suites passed**, and **11 isolated PostgreSQL session-policy tests passed (0.657 s)**. No final selected failures or skips. New regression files contain 56 Python cases and 21 Jest cases; they are included in those totals, not additional totals. Test lint passed; configured Jest coverage thresholds passed (82.71% statements, 75.47% branches, 80.99% functions, 84.56% lines). Commands: CI Python file list with `.venv/bin/python -m pytest -q`; `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`; `/tmp/voyagr-sql-tools/bin/python scripts/test-dashcam-session-sql.py` against isolated PostgreSQL. Baseline before Phase 4 edits was 538 Python + 68 subtests and 1,800 Jest / 88 suites passed. Desktop/Kivy/custom-router/live-server suites were unrun, not skipped successes. The Python CI file list includes the new routing file. Existing route/costing/lane/speed/cache/dashcam tests remain intact. An intermediate full run exposed recovery warning text being overwritten; the implementation was corrected to append limitations and preserve the existing warning. A new GPS test initially had an incorrect runtime fixture binding; the fixture was corrected without weakening assertions.

## Performance measurements

Run: `.venv/bin/python scripts/benchmark-avoidance-integrity.py`. Raw reproducible results: [VOYAGR_ROUTING_AVOIDANCE_PERFORMANCE.json](VOYAGR_ROUTING_AVOIDANCE_PERFORMANCE.json). Five repeats, synthetic UK route with 1,000 segments, three alternatives, one enabled category:

| Hazard records | Median added evaluator CPU | Maximum | Peak traced allocation |
|---|---:|---:|---:|
| 100 | 7.197 ms | 8.244 ms | 0.142 MiB |
| 1,000 | 16.188 ms | 18.157 ms | 0.287 MiB |
| 10,000 | 111.211 ms | 139.372 ms | 2.839 MiB |

For the same 1,000-hazard/1,000-segment proximity classification, indexed median was 1.644 ms versus full-scan 660.138 ms; exact booleans are asserted equal before timing. This sparse synthetic workload justifies the grid, not a general speedup or full request latency claim. Wide segments use bounded-storage fallback; very large/dense data still needs operational budgets. Traced allocation is not process RSS. Cache verification adds one current local SQL camera acquisition when relevant, zero new network calls; live request paths reuse collected snapshots. Explicit fine-category requests intentionally bypass coarse cache reuse, so hit rate can decrease. No measured mobile frame time, battery, VPS end-to-end provider latency, network cancellation benefit or production cache hit rate is claimed.

## Remaining risks and deployment acceptance

- Obtain version/build/profile/encoded-value manifests and replay representative graph-backed fixtures on actual Valhalla/GraphHopper/OSRM installations. Accepted JSON options do not establish restrictions. No installed capability discovery is claimed.
- Establish trustworthy camera ingestion bounds/age/revision, directional way associations and average-speed section coverage; acquire authoritative road/zone attributes. Until then many mandatory requests honestly remain unresolved. CAZ/congestion compliance is still unverified.
- The existing optimized `/api/route` multidrop summary geometry contains only the first leg. This change checks every leg for compliance but does not fix full-journey geometry stitching; it remains a separate navigation acceptance issue.
- Complete desktop/Kivy/direct-provider parity and end-to-end offline/PWA update acceptance. Old already-running clients cannot receive new enforcement until updated. Network-first versioned assets reduce ordinary stale reuse but do not prove offline clients have a complete new shell.
- Request supersession discards stale decisions; underlying provider/network work is not canceled. Establish overall retry deadlines and provider quota/latency budgets separately.
- Run real-device GPS loss/deviation/suspension, offline resume, multiple alternatives and confirmation UX tests, then controlled UK road validation. Deterministic test passes are not proven real-world avoidance accuracy.
- Retain separate lane provenance, inferred legal speed-limit, dashcam deployment/session/proxy acceptance, dependency and field-validation gates. Public production remains NO-GO. No migrations are required by this patch; no live DB/config changes were made.

## Changed-file inventory

- Contract/evidence: `voyagr/services/routing/integrity.py`, `integrity_api.py`, `voyagr/utils/hazard_matching.py`.
- Acquisition/provider boundaries: `voyagr/services/hazards.py`, `routing/hazard_prep.py`, `routing/multidrop.py`, `routing/osrm_fallback.py`, `voyagr_web.py`, `routing_engines.py`.
- PWA: `static/js/modules/navigation/avoidance-integrity.js`, `route-selection.js`, `reroute-decision.js`; `static/js/app/calculate-route-orchestration.js`, `gps-orchestration.js`, `traffic-orchestration.js`, `reroute-map-orchestration.js`, `navigation-lifecycle-orchestration.js`, `route-comparison-orchestration.js`, `route-preview-orchestration.js`; `templates/index.html`.
- Validation: `tests/test_routing_avoidance_integrity.py`, `static/js/__tests__/avoidance-integrity.test.js`, `.github/workflows/ci.yml`, `scripts/benchmark-avoidance-integrity.py`.
- Reports: this report, performance JSON, remediation plan and final technical report.

GitHub workflow: dedicated feature branch from the recorded main baseline; normal non-draft PR targeting main. Repository `allow_auto_merge` is false, so auto-merge is not enabled and no repository merge settings/protections are changed. Hosted results and PR URL are reported in the task completion message; local passes above are not a claim of hosted CI success.
