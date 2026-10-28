# Phase12F-B — Root cause and call-path review

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** Base: merged Phase12F PR357 `8a01e63d98a15f56395bae5fae506cad0fb9cdf2`. GraphHopper remains preferred first eligible Optimised; Valhalla alternatives and honest OSRM fallback remain gated. No server access, deployment, dataset replacement, graph rebuild or restart. Live lab/device acceptance is NOT_TESTED.

## Confirmed and reproduced

Three focused regressions failed against merged12F: an empty MultiPolygon could return OUTSIDE, a malformed hole could be skipped when its outer shell was outside, and CAZ conversion silently deleted an invalid vertex. Two other malformed-shape cases already passed. Corrections retain UNKNOWN evidence instead of reshaping/clearing a mandatory exclusion. No new tolerance or safe-exit exception was introduced.

The old `_relation` rescanned/revalidated the entire local geometry separately for each new endpoint. Actual baseline code was loaded from the merged commit for before/after profiling. New `prepare_areas` validates every ring structurally once and creates immutable polygon envelopes; `relation_from_prepared` filters conservatively with the existing1e-8degree boundary band and evaluates candidate shells/holes with the original point-in-ring method. Preparation is request-local; no cross-request acceptance/result cache exists. This is structural validation, **not an arbitrary topology/provenance validator**. Source member validity remains supported by prior12B evidence, not inferred from an envelope.

## Actual call-path inventory

|Path|Requested position|Returned position|Eligibility and preserved evidence|
|---|---|---|---|
|Browser initial request|calculate-route orchestration → avoidance-integrity.augment|No substituted origin|Only fresh matching raw-fix accuracy accompanies request; latest-response ticket remains|
|GPS recalculation|gps-orchestration accepted raw fix → buildRouteRequest → augment|Marker/map snap is separate|Accuracy cannot widen2m; changed fresh actual position blocks reuse|
|Flask ingress|integrity_api.normalize_avoidance_contract saves original start/end/accuracy|Provider cannot overwrite saved request|Shared30s budget and canonical mandatory contract|
|GraphHopper|engines.route_with_graphhopper sends requested endpoints|Native snapped_waypoints + route points|Preserved through route_entries conversion and multidrop legs, p5/p6 declared|
|Valhalla/OSRM|Existing provider request builders|Normalized actual geometry endpoints|Same origin assessors; absent native metadata is explicit geometry-only evidence|
|HTTP cache memory/persistent|Current original request survives cache lookup|Cached geometry/native metadata|after_request always calls assess_response; old origin claims recomputed|
|Single/alternative route|assess_response → assess_origin|Actual geometry + native consistency|Independent mandatory assessment plus origin quarantine before ranking|
|Multi-stop|Current start/ordered visits/end|Every leg endpoint|Cached from/to cannot certify themselves; complete geometry/order/binding checks retained|
|Ranking|Original requirements unchanged|Each route's own assessment|Eligible GH first; unsafe GH cannot override eligible alternatives|
|Browser start/select/reroute/resume|Current request metadata + fresh actual fix where available|Selected route's own assessment|Shipped JS decision/gate refuses unresolved/missing/stale/offline origins without confirmation override|
|GPS/road matching/voice|Actual GPS evidence remains separate|Existing road/progress matching|Uncertain progress/voice pausing retained; no straight-line connector|

Replay invokes these production functions, actual Flask cache ingress with deterministic offline backends, and Node execution of the shipped JS gate. Mock cache backends do not establish deployed cache behaviour or physical-device safety. Existing source freshness, capability-aware toll, collision-safe areas, deadlines, cancellation and independent mandatory navigation gates remain intact.
