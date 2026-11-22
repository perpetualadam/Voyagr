# Real application → strict GH11 connection audit

Date: 2026-11-22. Decision: **REMEDIATION_REQUIRED; production migration NO-GO**.
This audit changes documentation only. No VPS, running app, service, configuration,
location history, saved-device data or authentication was accessed or changed.

## Evidence baseline

- Fetched main: `2fcc9a10d253ca976cc635a09e0e0f09a4d5896a`.
- Inspected prototype head: `8b76bb20e1a8f768e75b5f49d17759b3565e63f7`.
- Source paths/line numbers below refer to that prototype head. The settings,
  storage, journey-mode, lifecycle, preview, reroute and Python routing paths cited
  are unchanged against the fetched main. The opt-in changes in
  `avoidance-integrity.js`, `navigation-safety-ux.js` and
  `route-comparison-orchestration.js` belong to PR #540 and are not main behaviour.
- Current code is Flask (`voyagr_web.py:1028`, `isolated_app.py:316`), not FastAPI.
  Historical routing-engine comments are not evidence of the active call chain.
- Production remains uninspected in this audit. The documented VPS2 milestone-2
  acceptance is historical selected-case evidence, not deployment of this head.

## Main findings

1. **A strict-context propagation gap is confirmed.** The real selected-route
   whitelist merge omits `routing_context` and `navigation_allowed`. It can keep
   those fields from the previous base object or omit the new route's fields.
   This must be fixed and tested before connecting GH11 strict responses. A
   metadata-only probe demonstrates the mismatch; no navigation bypass is claimed.
2. **Explicit Start is intentionally advisory in default mode.** It differs from
   the fresh-GPS recalculation action. Existing inspection/resume markers do not
   imply that every explicit Start universally requires a new GPS calculation.
   PR #540's opt-in shared guards cover the manual candidate path; main does not
   enable those guards. Do not silently change UK behaviour while migrating.
3. **The real app and prototype still have different contracts.** The real app
   expects route IDs, maneuvers, assessments, journey/endpoint context and request
   ownership. The prototype exports GeoJSON, edge intervals and basic instruction
   metadata, has no general settings/coverage compiler, and never grants navigation.
4. **Real cache and saved-device protections already exist.** Preserve them. The
   registered-reference preview feature is not production saved-route integration,
   and a frozen graph/source manifest is not proof of current hazard coverage.

## Trace and implementation evidence

| Stage | Source and function | Implemented behaviour / migration implication |
| --- | --- | --- |
| UI preference storage | `static/js/modules/navigation/route-prefs.js:29`, `:75`, `:122`, `:131` | Camera/CAZ/signal/crossing flags, separate road-leg flags and `routePreferences` have distinct keys/defaults. Do not flatten these into a single camera or motorway switch. |
| Request assembly | `static/js/modules/navigation/routing-request.js:45` (shared body), `:135` (common flags), `:287` (`buildAutomaticRerouteRequestPlan`) | Carries hazard master, category flags, tolls, motorways, ferries, scenic/quiet/unpaved, optimization and detour settings. Automatic reroute uses the same common flags plus departure/avoid-point inputs. |
| Request ownership | `static/js/app/calculate-route-orchestration.js:640`; `static/js/modules/navigation/avoidance-integrity.js:7`, `:28`, `:44` | Preference snapshot and intent tickets fence old responses. `augment` adds explicit requirements/mode and fresh matching GPS accuracy, preserves outstanding visits and disables reroute reoptimization. Strict revision ownership is an additional branch-only gate. |
| Server canonical policy | `voyagr/services/routing/integrity.py:15`, `:39` (`normalize_requirements`); `integrity_api.py:20` | Category-specific mandatory/preference requirements are validated. Explicit requests update provider flags and bypass coarse cache reuse. These categories are broader than the prototype's association IDs. |
| Primary HTTP route | `voyagr_web.py:1028` (`calculate_route`), `:1140`, `:1156` | Private cache lookup precedes provider hazard preparation, but hits still traverse the after-request assessment hook. No strict GH11 transport/manifest context is wired into this handler. |
| Fallback capability | `voyagr_web.py:1738`; `voyagr/services/routing/selected_settings.py:23`; `multidrop.py:587` | Settings-constrained requests prevent an unsupported OSRM fallback. This does not turn legacy GraphHopper custom-model requests into exact directed-edge exclusions. A future strict transport must refuse instead of switching to an unproven provider. |
| Cache identity | `voyagr/services/routing/private_route_cache.py:44`, `:66`, `:135`, `:147`; `route_cache_key.py:95` | Private capability, complete resolved request, cost and process epoch bind bounded serialized values. Reroute/force-refresh/avoid-point requests bypass reuse. GH11 graph/source/policy identities must become explicit inputs; existing keys alone do not establish them. |
| Response assessment | `voyagr/services/routing/integrity_api.py:45`–`:109`; `integrity.py:290`–`:323` | Every route is assessed, including cached responses; verification errors replace claims with unverified evidence. Existing assessments must not be replaced by a hard-coded success flag from a prototype fixture. |
| Saved collection | `static/js/app/route-saving-orchestration.js:30`, `:62`, `:67`; `route-sharing.js:320`, `:434` | Owner-scoped local store reads/writes, active-journey refusal and restored inspection context. Saved records retain geometry/visits, not a complete GH11 authority context. Preserve records and ownership; do not require deletion/migration to test GH11. |
| Durable/offline restore | `static/js/modules/navigation/route-selection.js:2574`; `static/js/app/offline-navigation-orchestration.js:329` | Restored payloads validate geometry and mark assessments unverified with fresh-GPS-required state; lifecycle refusal can fall back to inspection. This does not authorize strict offline navigation. |
| Preview isolation | `static/js/app/route-preview-orchestration.js:206` (`showRestoredRoutePreview`) | Refuses active replacement, replaces the preview context and clears the unrelated API envelope. Later explicit manual Start is a separate path and must be considered independently. |
| Explicit manual Start | `static/js/app/journey-modes.js:70`, `:316`, `:323`; `navigation-lifecycle-orchestration.js:537`–`:568` | Explicit Start prepares a guidance candidate and authorizes a manual lifecycle transaction. Default manual guidance bypasses the automatic gate; the UI can treat unresolved evidence as advisory (`navigation-safety-ux.js:30`). PR #540's opt-in candidate/UX gates refuse this in strict mode. |
| Fresh-GPS Start | `static/js/app/journey-modes.js:393`–`:448` (`navigateFromGPS`) | Requires online reassessment, fresh accepted GPS, retained stops, a forced-refresh request and a second position check. It calls `/api/route`; it has not been redirected to GH11. |
| Alternative selection | `static/js/modules/navigation/route-selection.js:2479` (`mergeNavigationRouteFromSelected`); `:2536` (`mergeLastCalculatedRouteFromSelection`); `route-comparison-orchestration.js:742` | The first function explicitly whitelists selected fields and omits strict context/permission. The second spreads route objects but must still be tested for atomic identity propagation. Branch-only Select/Use guards do not themselves repair the merge contract. |
| Automatic replacement | `static/js/app/reroute-map-orchestration.js:260`, `:285` | Requires shared gate and prepared candidate before committing; failures retain the current route. Durable commit/start is rechecked in lifecycle `:612`. Do not bypass these transactions with a new map update function. |
| Strict development contract | `static/js/modules/navigation/strict-route-policy.js:19`; `prototypes/graphhopper11/isolated_app.py:103`–`:117` | Strict navigation needs trusted context plus matching per-route version/binding/time/requirements evidence. Prototype references only select registered cases; they are not navigation capabilities. The production bootstrap does not load/enable this module. |
| Prototype instruction export | `prototypes/graphhopper11/ReadOnlyRouteRegression.java:387`–`:400` | GeoJSON, directed-edge intervals, and instruction name/sign/distance/time are exported. They are not the real app's complete maneuver/shape-range contract or a verified turn-by-turn adapter. |

## Reproduced selection-contract gap

Run from the repository; all values are synthetic metadata, with no coordinates,
listener, engine request, account, saved record or navigation attempt:

```sh
node - <<'JS'
const selection = require('./static/js/modules/navigation/route-selection.js');
const next = {id:'NEW', routing_context:{request_binding:'new-context'}, navigation_allowed:false};
const base = {id:'OLD', routing_context:{request_binding:'old-context'}, navigation_allowed:true};
const merged = selection.mergeNavigationRouteFromSelected(base, [next], 0);
const fresh = selection.mergeNavigationRouteFromSelected({id:'OLD'}, [next], 0);
console.log({id:merged.id, context:merged.routing_context,
  navigation_allowed:merged.navigation_allowed, missing_new_context:!fresh.routing_context});
JS
```

Observed: ID `NEW`, context `old-context`, permission flag `true`, and a missing
context in the fresh-base case. This proves field propagation behaviour only.
The branch strict/legacy gates and journey ownership still independently decide
navigation. Do not describe this probe as a successful exploit or phone failure.

## Settings and evidence that still need compilation

| Real input | Current prototype coverage | Required strict handling |
| --- | --- | --- |
| Speed/red-light/other cameras | Selected public association/direction fixtures only | Preserve categories and directions; require provenance, graph-bound association and coverage/freshness. Unknown mandatory evidence refuses. |
| Ordinary signals/crossings | Selected crossing fixtures; no general signal compiler | Keep ordinary signals distinct from cameras; validate road/grade association and every leg. |
| Motorways | Selected `no_motorways` real-engine checks | Map the exact user requirement into the custom model and independent edge validation for every candidate. |
| Tolls, ferries, unpaved, CAZ/congestion | Imported values or existing UK adapters do not establish strict GH11 parity | Prove each supported rule; otherwise return UNSUPPORTED for enabled mandatory rules. CAZ needs area/vehicle/time policy, not a toll flag. |
| Scenic/quiet, optimization, detour limits | Not a general prototype feature | Keep preference versus mandatory intent explicit; do not translate all preferences into prohibitions or silently discard them. |
| Multi-stop/round-trip/arrival/departure/traffic | Selected continuous-via fixtures only | Preserve ordered visits, stop/pass-through semantics and current origin. Traffic and time-sensitive restrictions need independent capability evidence. |
| Walking/cycling/vehicle profiles | Prototype profile is `car` only | Reject unsupported profiles; do not silently substitute car routing. |
| Legal restrictions | Selected synthetic turn fixture and actual graph checks | Legal restrictions are not optional hazard preferences. General turn/conditional/access correctness remains unverified. |

## Ordered remediation and acceptance gates

1. **Selected-response ownership first.** In a separate reviewed change, explicitly
   transfer strict route metadata from the selected candidate (including absence)
   instead of retaining old fields. Test old-valid/new-refused and the reverse,
   missing metadata, different bindings/versions, and a positive coherent selection
   through actual merge + strict gate + Start. Keep default UK behaviour unchanged.
2. **Define a complete adapter contract before connecting `/api/route`.** Export
   real instructions with shape ranges and stable candidate identity; preserve
   directed trace, geometry precision, journey context and per-leg boundaries.
   Validate GH11 sign conversion against actual instructions, not road-name-only
   display. Keep preview-only authority until all prerequisite evidence exists.
3. **Compile current app settings with an explicit capability table.** Normalize
   the real request, preserve mandatory/preference distinctions and issue refusal
   for unsupported mandatory combinations. Server-derived policy binds profile,
   ordered visits, current origin, graph/source/hazard-policy versions and lifetime.
   Client flags, saved verdicts or empty hazard lists cannot grant authority.
4. **Integrate existing private cache without weakening isolation.** Supply the
   complete versioned request; preserve reroute/force-refresh bypass and response
   reassessment. Test source/graph/policy changes, changed stops/origin, no private
   capability, malformed cached evidence and concurrent private scopes. Do not
   replace this with the public-fixture process cache.
5. **Connect owner-scoped saved collections non-destructively.** Legacy records
   remain inspectable. A fresh strict calculation uses current accepted GPS and
   explicitly selected settings/visits; missing old authority cannot be invented.
   Test local-store owner changes, persisted/offline restore, abandoned journeys,
   saved/current-setting differences and retained active guidance on failure.
6. **Then prepare an isolated VPS2 update and rollback proposal.** Require current
   Flask/browser contract tests, legal/hazard coverage checks and bounded resource
   tests first. Obtain explicit approval before service/configuration changes.
   Phone acceptance, GPS/map recovery and real driving remain separate evidence.

The next implementation should address item 1 only, with focused synthetic tests.
It must not enable strict mode in the UK page, grant the prototype navigation
permission or contact VPS2. This audit is not permission to deploy or merge.

## Evidence classification and validation

- **PASS within scope:** existing request ownership/private cache protections;
  synthetic probe reproduces the merge gap; current default UK and opt-in test
  suites are green at the audited source.
- **MIGRATION GAP:** selected-context merge, full response adapter, canonical
  settings/coverage authority, real cache/version wiring and saved-store integration.
- **UNVERIFIED:** deployment of branch-only code, physical phone behaviour, real
  route compliance outside selected fixtures, general legal/turn semantics,
  live hazard freshness, traffic/profile parity, resource capacity and rollback.

Re-run on the audited code: `npm run lint:tests`; `npm run test:ci -- --maxWorkers=2`
passed 200 suites / 3,864 tests. The backend file selection from the “Run Python
behaviour tests” workflow step passed 2,548 tests, one skip and 94 subtests. These
are automated local results, not production or phone checks. No new tests were
added for this documentation-only audit. The preceding exact-head GH11 CI also
passed; this documentation commit has its own subsequent checks.
