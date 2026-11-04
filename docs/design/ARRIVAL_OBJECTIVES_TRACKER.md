# Original eight objectives: arrival and navigation

Updated 4 November 2026. This is the master completion checklist. No objective is
complete merely because a related PR merged or a synthetic test passed.

| # | Original objective | Current evidence/status | Remaining completion evidence |
|---|---|---|---|
| 1 | Establish the remaining blockers | Partial. A structured selected unnamed-parking assessment is now captured; endpoint refusal and preference limitations are separated below. | Obtain complete geometry/profile/source-version evidence and independent entrance/road-access data; assess other alternatives and fresh-GPS behavior. Do not generalize this one route to all journeys. Original transient geocoding 500 exception remains uncaptured. |
| 2 | Resolve vehicle arrival points | Partial. Explicit arrival selection, original destination retention and source-based labels implemented and operator-tested. Versioned planning intent is implemented; roadside/entrance modes remain preview-only. | Implement and accept roadside/entrance intent policy with genuine evidence; resolve ambiguous/missing entrances without silently relocating the vehicle. |
| 3 | Validate driven connections | Not complete. Coordinate correspondence is not connector validation. | Real directed connection geometry, barriers/levels/turn/access checks, mandatory restriction evaluation and negative cases. |
| 4 | Implement live GPS road matching | Not complete. Existing fresh-fix checks remain; no new match authority granted. | Reviewed road-source coverage, trace-based ambiguity/freshness/heading tests, versioned acceptance policy and transactional integration. |
| 5 | Complete provider/search integration | Partial. Destination-scoped parking retrieval, ranking and bounded provenance implemented. | Confirm deployed provider entrance/edge/matching support; intermediate-stop metadata capture; source age/revision and failure coverage. |
| 6 | Correct/simplify interface | Partial. Arrival labels, scope/radius, access warnings and qualified preference headings implemented; latest layout visual acceptance pending. | Show requested/arrival/road endpoints distinctly, explain selected intent and exact blockers, simplify repeated warnings and complete accessibility/mobile checks. |
| 7 | Test complete journey | Partial. Web regression suites and recorded stationary planning checks exist. | Arrival-intent negative cases, provider integration, device/GPS/road acceptance, offline/deviation/saved/multi-stop coverage. |
| 8 | Release and verify | Partial. User deployment logs show completed increments through fc551769. | Verify latest deployed version/assets and UI, then accept each completed capability with rollback/monitoring evidence. Overall system acceptance is outstanding. |

## Current bounded objective

The selected unnamed-parking assessment now establishes the immediate numerical
endpoint blocker. The version-1 planning declaration now distinguishes place, roadside and vehicle-entrance intent. Next obtain provider road/entrance/profile and access evidence before implementing any positive live acceptance. Entrance, connector and GPS authority
must not be implemented by guessing from the screenshots or widening the existing
two-metre numerical consistency tolerance.

### Evidence needed from the current route

After calculating the same journey, inspect the selected alternative, not only the
primary response: provider, geometry binding, journey context (original destination,
explicit arrival choice and endpoint provenance), endpoint_resolution and
avoidance_assessment. Include checked/expiry times, provider limitations, enabled
mandatory requirements and their individual statuses. Record deployed commit and
executing asset versions. Do not include cookies, credentials or unrelated logs.
Keep coordinates only for the journey intentionally supplied for investigation.

Read-only browser-console capture (run after selecting the intended alternative):

```javascript
(() => {
  const comparison = window.VoyagrRouteComparisonOrchestration;
  const index = comparison?.getSelectedRouteIndex?.() ?? 0;
  const options = comparison?.getRouteOptions?.() || [];
  const route = options[index] || window.lastCalculatedRoute;
  if (!route) return console.log("NO_SELECTED_ROUTE");
  console.log(JSON.stringify({
    selected_index: index,
    source: route.source,
    journey_context: route.journey_context,
    endpoint_resolution: route.endpoint_resolution,
    avoidance_assessment: route.avoidance_assessment,
    provider_limitations: route.provider_limitations,
    navigation_outcome: route.navigation_outcome
  }, null, 2));
})();
```

This reads the selected browser state and prints JSON; it sends nothing, starts no
GPS request and changes no route. Missing fields must be recorded as missing,
not filled from an unrelated response or interpreted as successful checks.

Known observations: a Civic Quarter preview showed about 24 m start / 43 m arrival
separation; a later unnamed-parking recording showed about 24 m / 14 m and no
entrance reference. These are different captured previews, not one combined route
fixture. No screenshot proves which side road is a legal entrance. The original
legacy route fixture must not be relabelled as the new parking journey.

## Arrival-intent acceptance table — proposed, not implemented

| Case | Planning result | Live result / missing evidence |
|---|---|---|
| Place/parking centre routed to nearby road | Retain original place and returned endpoint; explain the gap and unresolved property access. | No automatic authorization from distance or place kind alone. |
| Explicit roadside arrival on an ordinary road | Retain intended place plus selected stopping/arrival point. | Require evidence of suitable/legal approach and stopping, vehicle compatibility and mandatory compliance; GPS start is separate. |
| Motorway/shoulder, wrong carriageway, prohibited stopping or unresolved road level | Inspectable cautionary plan if geometry is valid. | Do not accept roadside arrival through proximity or confirmation. |
| Vehicle-entrance intent with identified entrance | Preserve centre, entrance and route anchor separately. | Require verified directed approach and any actual driven connector, restrictions/profile/time context and source binding. |
| Missing or competing entrances, private/conditional access, unknown customer eligibility | Review required; no invented entrance or connector. | Unresolved until relevant evidence and applicable eligibility/rules are established; confirmation cannot override prohibition. |
| Connector conflicts with mandatory restriction | Show the specific conflict. | Refuse; choosing another intent cannot erase a required driven segment. |
| Stale/mismatched route, changed endpoint/vehicle/time/source | Retain active journey; request reassessment. | Old evidence cannot authorize replacement. |

Before runtime acceptance changes, the table needs source-field mappings, a
versioned decision contract and positive/negative regression fixtures. In
particular, explicitly ending driving on a road must not claim the property is
reachable or silently bypass stopping/access restrictions.

## Work discipline

Each PR names the objective numbers, observable acceptance criteria and exclusions.
Record facts, assumptions and unknowns separately. Label synthetic, captured and
live/device evidence distinctly. Review source capabilities before using them.
Track discovered non-blocking issues here instead of expanding the current PR.
Implementation, tests, CI, merge, deployment and live acceptance are distinct
milestones. Production deployments remain user-managed.

## Captured selected assessment: unnamed parking

Source: user-supplied structured browser state, preserved in
[assessment capture](../../static/js/__tests__/fixtures/sheffield-unnamed-parking-assessment-20261104.json).
This is not a complete engine response or a geometry replay fixture. It contains
no route geometry, maneuvers, selected-index, deployed-commit or asset-version
snapshot. It must not be combined with the legacy route geometry or relabelled as
Chappell Drive/Civic Quarter. Inspection of policy code confirms the captured
reason matches the current endpoint continuity gate; no permission is inferred.

| Question | Captured evidence | Meaning / limitation |
|---|---|---|
| Original goal | Saved Doncaster point 53.5227681, -1.1335312 | Retained separately from the parking arrival. |
| Driving target | Overpass way:1462440103 at 53.5237353, -1.1307239 | Parking mapped point, not an identified vehicle entrance. |
| Origin | Saved Sheffield point 53.3806626, -1.4702278 | No accepted physical GPS position established; accuracy is null. |
| Road anchors | Origin 53.3808, -1.4705; arrival 53.52366, -1.13056 | Native GraphHopper snaps equal the reported geometry-derived anchors. |
| Gaps | 23.651 m origin; 13.693 m arrival | The captured refusal is material_endpoint_relocation under the current numerical gate. |
| Geometry | geometry_valid=true, binding f4fb9b32 | Server-reported validity/binding; omitted geometry cannot be independently replayed. |
| Arrival access | NO_REFERENCE, candidates=[], vehicle_access=UNKNOWN, connector=NOT_EVALUATED | No entrance/access/connector validation exists in this capture. |
| Requirements | All 13 rows mode=preference; enabled rows UNVERIFIED, conflicts=0, coverage=UNKNOWN | No mandatory requirement blocker established; zero conflicts does not prove hazard absence. Disabled SATISFIED rows are not successful avoidance checks. |
| Provider limitation | Tolls: attribute_not_verified | Toll avoidance is unverified, not evidence that it was definitely ignored. |
| Engine installation | verified_installation=false | Installation capabilities have not been independently verified; this does not prove an engine fault. |
| Scope | purpose=planning; navigation_allowed=false; transition_verified=false | Preview evidence grants no live/navigation authority. |

### Objective 2 field mapping and implementation boundary

The current record provides requested endpoints, explicit arrival choice, native
anchor correspondence, measured offsets, route binding and request provenance.
It does not provide arrival intent (roadside versus entrance), suitable/legal
stopping evidence, directed entrance/edge identity, connector geometry, evaluated
access conditions, accepted GPS match, or verified source revision/profile binding.

Next define an additive versioned arrival-intent contract and its lifecycle across
planning, saved journeys, GPS recalculation and rerouting. A planning declaration
must remain request metadata. A live acceptance rule needs the missing provider/
road evidence and negative fixtures; source availability must be established before
coding success paths. Keep the two-metre numerical check unchanged until a reviewed
replacement policy has adequate evidence and acceptance tests. Objective 1 and the
other seven objectives remain partial/open as recorded above.
