# GraphHopper 8.0 toll capability compatibility

Date: 2026-10-28. Baseline main `6c49f2ec` (duplicate-area fix PR #349 merged). No production HTTP requests, deployment, GraphHopper configuration changes, service restarts, graph rebuilds or camera-area file edits performed in this task.

## Confirmed root cause

Operator-supplied production evidence establishes that the installed graph does not make `toll` available: `/info` does not advertise it, and a controlled custom-model request fails with `Cannot compile expression: priority entry invalid condition "toll == true": 'toll' not available`. The application's combined request reports custom_model_error / invalid_argument with recognised toll/priority names. This is separate from the already-fixed duplicate inline hazard IDs.

The active costing builder unconditionally generated `toll == ALL || toll == HGV` for both **avoid_tolls** and **route_optimization=cheapest**. Although the operator's probe used a Boolean expression, either form fails before useful comparison when the encoded value is unavailable. Changing true to ALL cannot fix an absent attribute. Toll avoidance must not be removed globally or silently described as enforced.

No independent production probe was made here. The supplied compiler error proves the installed toll defect; other installed encoded values/profile/graph capabilities remain unknown until the app observes that provider's metadata. Mocks verify request construction and safety behavior, not actual graph-backed enforcement.

## Actual builder inventory

| Request component | Attribute dependence | Compatibility behavior |
|---|---|---|
| Explicit toll preference | toll | Emit only with verified Boolean or recognised enum domain; otherwise record toll limitation |
| Cheapest optimization | toll and road_class | Independently check toll and motorway preference, preserving whichever is supported |
| Motorway avoid | road_class / MOTORWAY | Check both field and enum value before emitting |
| Ferry avoid | road_environment / FERRY | Check field and enum value before emitting |
| Unpaved preference | road_class / TRACK, PATH | Preserve existing class-based heuristic only when advertised; it is not full surface enforcement |
| Scenic/quiet/eco priority preferences | road_class, MOTORWAY/LIVING_STREET | Check requested values individually; report withheld preference |
| Eco speed cap | constant condition / profile | Keep only when the configured profile is advertised; no added encoded attribute assumed |
| Camera sections | installed in_camera_area_N references | Retain unchanged; `/info` encoded_values is not an area registry |
| SCDB, OSM, incidents and CAZ inline zones | area predicates | Retain geometries, IDs, collision-safe composition, ordering and multipliers unchanged |
| Path details | max_speed, lanes, road_class | Request only advertised detail names; absent details cannot become legal speed/lane authority |

No other encoded values occur in the active custom-model builders. Legacy root `custom_model.json` has different tags-based rules but is not loaded by this request builder. Other diagnostic/live-service scripts are not the running request path and were not executed.

## Verified metadata contract

GraphHopper 8's [InfoResource](https://github.com/graphhopper/graphhopper/blob/1e224ae6bb1807ebc5037fb8de07c4f7cfaee749/web-bundle/src/main/java/com/graphhopper/resources/InfoResource.java) returns:

- `version`: version string.
- `profiles`: objects containing names (not a complete custom-weighting capability declaration).
- `encoded_values`: **map from name to allowed value strings**, not a list of names. Enum values are listed; Boolean values are `true`/`false`; numeric values use `>number`/`<number`.

The new reader requests `/info` on the same configured provider base URL as `/route`, from server configuration only. Client request fields cannot supply capabilities. It validates version/profile/map shape and bounds, retains only the five relevant attribute declarations, hashes the observation for change tracking and never logs the raw metadata, URL, bbox or exception. Unknown/list-style/invalid metadata does not grant capability. Public snapshots expose status, profile observation, timestamps/expiry and fingerprint, with **enforcement_verified=false**. Even successful advertisement is not proof of graph correctness, exclusion enforcement or a compliant returned route.

Missing advertisement is treated as **not verified**, rather than proof the graph stores no such attribute: GraphHopper can hide private encoded values. Here the independently reported compiler error additionally confirms toll is actually unavailable. A metadata-declared profile with no `car` is skipped so the caller can use another provider. An unavailable metadata service does not erase camera/OSM/CAZ geometry rules; those existing requests can still be attempted, with unknown attribute preferences withheld and explicitly limited.

### Toll types

| Fresh observed toll declaration | Generated expression |
|---|---|
| `["true","false"]` | `toll == true` |
| Recognised enum containing NO/ALL, optionally HGV | `toll == ALL`, plus `|| toll == HGV` when advertised |
| Absent, malformed, unknown domain, unavailable metadata or unadvertised profile | No toll expression; explicit toll limitation |

All existing numeric multipliers remain unchanged. No request-time graph/configuration editing or silent fallback from a failed protected custom model is introduced.

## Cache, freshness and invalidation

- Key: configured provider base URL **and profile**. Up to eight process-local entries; each worker observes independently.
- Successful validated observation: **300 seconds**. Negative/unavailable observation: **15 seconds**. Concurrent readers share one bounded lookup under a lock; returned snapshots are copied to prevent mutation.
- Expired positives are synchronously refreshed. Failure replaces the old positive with unavailable metadata; stale positives are not reused.
- HTTP **400/422** from any GraphHopper routing attempt invalidates that provider/profile observation. The next request rechecks `/info`; no model-free retry bypass is added for protected rules.
- Base URL/profile changes naturally use a different key. Version/import/graph metadata changes affect the fingerprint at the next observation. There is no immediate remote graph-change notification or atomic guarantee between `/info` and `/route`.
- GET only, no redirects/retries, streamed **64 KiB** maximum, connect/read idle limits **1/2 seconds**, with a **3-second elapsed stream check**. One-byte application chunks keep trickling bodies from postponing that check until a larger chunk fills. This is still cooperative requests timing, not a hard preemptive deadline for all headers/socket behavior. Metadata calls count against the existing request-local routing budget and HTTP-call diagnostics.
- No new background jobs, persisted metadata files, Redis settings, admin endpoints or production credentials. Route-cache copies retain historical observation timestamps/valid_until, not fresh capability authority. Construction always uses the current metadata cache; old UI snapshots cannot authorise encoded-value rules.

## Limitations, preference behavior and mandatory safety

Unsupported or unverified requested preferences produce per-route `provider_limitations` with static engine/category/reason/status fields. Remaining supported rules are composed normally. Missing toll support does not remove cameras, SCDB/OSM hard blocks, CAZ, supported road-class preferences, global toll settings or Valhalla `use_tolls=0`. Cost estimates such as toll_cost=0 are not proof a route is toll-free.

GraphHopper HTTP error logging remains bounded/sanitised. A failed custom model containing protected areas/hazard/hard-costing rules still refuses unfiltered GET or model-free POST fallback. Missing attributes are excluded before construction based on metadata, not removed in response to arbitrary error text. Genuine remaining engine errors retain diagnostics and existing provider fallback.

Per-route limitations survive GraphHopper route conversion, individual multi-stop legs, whole-journey assessment, alternative selection and navigation payload merging. The selected alternative's limitations replace the previous provider's data; a Valhalla alternative is not incorrectly labelled as missing GraphHopper toll support. Existing best-effort routes remain reviewable and show a plain-language limitation (for tolls: “Toll avoidance was not applied by this provider”). Alternative and primary metadata remain separate.

Metadata never sets an avoidance requirement to SATISFIED. Existing independent route-attribute/hazard coverage evaluation remains in force. **An unverified mandatory toll restriction cannot auto-select or auto-start navigation.** A genuinely independently verified compliant alternative may still pass, regardless of which engine requested the route. All multi-stop legs must pass existing geometry/compliance checks. Preference-mode routes may proceed with the existing warning semantics; requested preferences are not silently reset in client storage.

## Regression evidence

Tests reproduce the exact unsupported toll compiler-error form in the privacy diagnostic integration, then exercise Boolean, enum, absent, numeric/unknown and unavailable toll declarations in explicit avoidance and cheapest mode. A provider boundary rejects any toll expression when not advertised. Mixed requests use actual SCDB/OSM/CAZ builders, retaining three hard camera/OSM rules plus the CAZ rule, with toll either included or explicitly limited.

Additional checks cover missing road_class/environment, absent profile, per-provider cache keys, copied snapshots, TTL expiry, failed refresh without stale support, invalidation, concurrent readers, malformed/list metadata, redirect refusal and response-size caps. Integration tests cover preserved route-entry/multi-leg limitations, mandatory rejection, verified alternate ranking, and GraphHopper→Valhalla preference forwarding. Browser tests verify best-effort messaging, mandatory gates and switching alternatives without carrying a previous provider's limitation. Existing duplicate-area, fallback, diagnostics, GPS, authentication and dashcam regressions remain passing.

Final local validation:

- Backend CI selection: **798 passed +68 subtests**.
- Focused capability/composition/costing/fallback/privacy/hazard selection: **65 passed** (overlaps CI; not an independent total).
- Jest: **98 suites /1,921 tests passed**; test lint and all configured coverage thresholds passed.
- Isolated PostgreSQL session policy: **11 passed**, temporary server only; no production DSN.
- `git diff --check`: passed.

The full historical desktop/native/custom-router/live-service directory is not an offline web regression suite. In particular some GraphHopper API/format/integration scripts target hardcoded remote services and can execute requests at import; those were deliberately **not run**. No real-engine or live Contabo validation is claimed. Hosted required CI and PR state are verified at publication.

## Operator-run verification after separate approval

No automatic deployment is included. Use an already approved tools/app revision and existing authorised access. Do not rebuild graphs, change GraphHopper profiles/encoded values, restart services or install packages on production for this check.

1. Read the existing local `/info` through the reviewed metadata reader in a separate tools process. This does not invalidate a running app worker's process-local cache. Run from the reviewed tools checkout with an existing compatible Python environment; choose real paths rather than assuming an installation directory:

```bash
: "${REVIEW_TOOLS:?separate reviewed tools checkout}"
: "${REVIEW_PYTHON:?existing compatible Python executable}"
cd "$REVIEW_TOOLS"
"$REVIEW_PYTHON" - <<'PYCODE'
import json
from voyagr.services.routing.graphhopper_capabilities import get_graphhopper_capabilities, public_capabilities
caps=get_graphhopper_capabilities('http://127.0.0.1:8989','car')
out=public_capabilities(caps)
out['toll_advertised']='toll' in caps.get('encoded_values',{})
out['required_detail_names_advertised']=sorted(set(caps.get('encoded_values',{})) & {'max_speed','lanes','road_class'})
print(json.dumps(out,sort_keys=True))
PYCODE
```

Share only that summary, not the full `/info` response (which can contain bbox/other declarations), tokens or environment dumps. For the confirmed current graph, toll_advertised should be false. Other attribute names must come from the observation; do not infer them from Voyagr's UI options. A valid `car` observation does not itself prove custom weighting or native avoidance.

2. After a separately approved app deployment, wait up to the positive-cache TTL (300 s) for each worker to refresh, or use the normal bounded next-request invalidation following a genuine 400/422. Do not generate repeated invalid requests or restart services to clear caches. A temporary `/info` failure uses the short negative cache and must not resurrect old support.
3. While stationary, request one normal PWA route using camera/SCDB/OSM/CAZ avoidance plus toll preference; then repeat with cheapest optimization. Keep the same approved route inputs when comparing. Expect no unsupported toll expression, supported avoidance geometry/rules retained, and a toll limitation visible on GraphHopper alternatives. Do not capture/log/share full models, coordinates or authentication headers. If HTTP 400 persists, use the existing safe validation_error journal filter and investigate its category; do not disable avoidance to obtain a 200.
4. Set toll avoidance to mandatory for a controlled test. Without independent fresh toll-free route evidence, automatic selection/navigation must remain blocked. Check an independently verified compliant alternative separately. Do not replace mandatory settings with preference mode to make this case pass.
5. Verify normal provider fallback still forwards toll preference to Valhalla. Select different alternatives and confirm limitations follow the selected provider. Test multi-stop routes and ensure a limited leg cannot become a falsely verified whole journey. Do not infer toll-free routes from zero cost or mere HTTP success.
6. Toll-supported behavior is covered locally using verified-schema fixtures. Testing a toll-enabled engine requires an already approved separate graph/service advertising the attribute; **do not enable/rebuild the production graph for this task**. In that environment verify matching Boolean/enum expression, actual returned geometry/avoidance and no native-enforcement claim from metadata alone.

Record only build/version, observation fingerprint/time, category/status outcomes, bounded HTTP request counts and reviewed routing/compliance results. Actual installed-engine acceptance after this change remains required; the production root cause is confirmed by the operator's supplied evidence, not by a new Cloud production probe.
