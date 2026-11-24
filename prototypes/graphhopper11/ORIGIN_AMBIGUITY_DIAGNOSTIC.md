# Imported-graph origin ambiguity diagnostic

24 November 2026. Operator-selected offline diagnostic only. No guidance authority.

## Investigation

Accepted-fix/request-coordinate equality does not identify a physical road or
approach direction. The existing independent road oracle uses explicit source
endpoints/topology and does not provide a ready-made live-GPS association guarantee.
It is not imported into the isolated service or treated as GH11 origin authority.
The earlier parallel-road control also demonstrates that exclusion-filtered
snapping can relocate a route onto a nearby independent road.

The native runner now accepts an operator fixture's `diagnose_origin` object with
`radius_m` and optional `edge_limit`. It examines original graph-edge geometry near
the registered start and records directed keys with encoded `car_access`. It does
not filter the observation by hazard blocks, request custom-model preferences,
selected route direction or the route's chosen snap. Removing an avoided road from
this observation would hide uncertainty about where the vehicle actually is.

This is a deliberately bounded full scan, not a new unproved spatial-index query.
Limits are 10,000 examined edges, 100,000 geometry vertices, 256 recorded directed
candidates and a soft 250 ms scan deadline. The existing subprocess/output/memory
limits remain in force. A large geometry fetch or file access is not a hard real-time
guarantee; no capacity or latency benchmark is claimed. Missing/invalid geometry,
limit exhaustion or timeout leaves the observation UNVERIFIED. Larger graphs will
generally exhaust this graph-wide budget: this is not a scalable UK/US live locator.

## Interpretation

With a completed imported-graph scan, the classification is one of:

- `NO_OBSERVED_TRAVERSAL`: no encoded car traversal found under this metric/radius.
- `ONE_OBSERVED_TRAVERSAL`: one directed graph key observed, not a unique physical approach.
- `MULTIPLE_OBSERVED_TRAVERSALS`: multiple directed keys observed; no road grouping or
  equivalence inference is performed.

An incomplete scan is always `UNVERIFIED`, regardless of its recorded count.
Counts describe encoded directed graph edges, not necessarily different physical
roads/directions: collinear split edges can yield multiple keys. Both legal encoded
directions are retained on a bidirectional edge. Keys are scoped to the loaded graph
and must never be carried across a graph rebuild as stable road identity.

Every result explicitly retains `heading_verification: UNVERIFIED`,
`physical_road_verification: UNVERIFIED`, `navigation_allowed: false` and
`route_absence_proven: false`. Even a completed one-candidate observation cannot
prove source completeness/freshness, live access restrictions, true GPS error
containment, grade/layer, stopping semantics or the vehicle's heading. The distance
metric is GraphHopper's spherical segment projection; it is not a certified GPS
confidence envelope. The operator radius is not taken from phone data or used as
permission to move a vehicle to another road. No heading-based candidate pruning
is implemented; unsupported diagnostic options refuse.

## Scope and regression evidence

The diagnostic is opt-in in the existing Java fixture runner. Normal registered
requests do not run the scan; diagnostic output is not promoted into the isolated
HTTP response, saved references, capability compiler or navigation decision.
HTTP callers cannot enable it through a route envelope or complete app request.
No new device location input, history access, persistent cache or product UI is added.

Generated-graph regressions verify:

- Nearby parallel bidirectional roads retain four directed traversals, including
  keys selected for exclusion; reversing the route request does not prune the set.
- A one-way fixture yields one encoded traversal while retaining every refusal flag.
- A junction retains multiple approaches and the independent nearby road.
- An empty observation does not prove route absence; a truncated scan cannot become
  a unique-approach claim.
- Invalid radii, edge budgets, boolean coercions and unsupported heading controls
  refuse. Client diagnostic injection is rejected before Java work.

The one-way tag is added to the synthetic branch used for this diagnostic; existing
forward/reverse/via/U-turn, selected-exclusion, cache and browser regressions still
need to pass. No real UK/US graph, phone GPS or production system is exercised by
these new diagnostic tests.

## Next acceptance gate

A production-capable origin assessor still needs a demonstrably complete bounded
candidate lookup on real graphs, source/version/freshness binding, explicit GPS
uncertainty and heading provenance, candidate-to-QueryGraph linkage and policy for
intersections, parallel roads, grade separation and ambiguous/missing observations.
Those inputs must then bind to Start, alternatives, leg seams, reroutes and cache
reuse without inferred connectors or avoidance-based relocation. The four full UK
Milestone 3 acceptance streams remain open. Migration stays NO-GO; no deployment is
included. A future reviewed package/manifest would be required for any VPS update.
