# Actual request-graph traversal evidence

23 November 2026. Isolated registered-case preview only. Navigation remains disabled.

## Implemented path

The GH11.1 `PathDetailsBuilderFactory` receives each calculated `Path` and the
request `Graph` during normal response construction. The isolated runner adds one
path-detail builder, requiring that graph to be a `QueryGraph` and identical to
`path.getGraph()`. It observes the edges actually visited by `Path.forEveryEdge`;
it does not run a second location-index lookup or substitute a Dijkstra route.
The other requested path details remain delegated to the normal GH11 factory.

For every actual directed edge it records the query edge key, original directed
edge key, base/adjacent query node IDs, node coordinates and whether the edge is
virtual. Native shape indices delimit each interval. Full path data requests
require these details, and the Python bridge refuses missing evidence.

The Python bridge independently requires complete, ordered shape coverage; matching
original-edge intervals; matching endpoint coordinates (within 1e-7 degrees for
numeric representation); consistent nonvirtual keys; and connected query node IDs
across intervals and legs. Equal coordinates cannot excuse different node IDs.
Missing or corrupt evidence on any alternative refuses the entire response.
Both fixture and private-cache hits traverse the same checks, without fallback.
The existing registered-coordinate, exclusions, profile-turn and navigation gates
remain in place.

`query_graph_intervals` travels in each candidate and its `gh11_evidence` preview.
`query_graph_scope: current_request_only` refers to the producing engine request:
query edge/node IDs cannot be reused as stable IDs across requests or graph
rebuilds. Cache revalidation checks the stored calculation evidence; it does not
construct a fresh QueryGraph or establish a current vehicle position. Existing graph/source/
policy/request bindings remain required. Saved references still omit geometry and
verdicts, and browser storage is not migrated or cleared. A fresh reviewed package
and manifest would be required before any separate VPS update.

## Focused evidence

Generated public synthetic fixtures cover interior-edge endpoints, reverse travel,
a via point splitting an original edge into two different virtual query edges,
and an independent parallel road about 0.22 metres away. The parallel fixture uses
source OSM way checks in addition to coordinate tolerance; its original graph edge
is distinct despite proximity within the configured one-metre bound. The tests
compare original keys across the same graph, not virtual IDs across requests.
Normal primary, alternative, via and reroute checks also traverse the new validator.

A negative control explicitly confirms eligible-edge re-snapping: when both main
roads are blocked and the known source-road guard is removed from a test-only
request, GH11 selects the independent parallel road within the one-metre bound.
The actual registered refusal case retains its known source-way guard and refuses.
This strengthens that fixture contract; it does not solve general live-origin
road association or prove global route absence. The unguarded control must remain
visible rather than being hidden by moving the parallel road outside tolerance.

Transport regressions cover missing third-candidate evidence, disconnected nodes
with unchanged coordinates, incorrect original keys, shape gaps/incompleteness,
coordinate corruption and malformed flags/keys. Cache regressions require refusal
when evidence disappears from stored reports. These are bounded synthetic checks,
not nationwide, physical-phone or general map-association acceptance.

## What remains unverified

This establishes the directed segment(s) selected by the calculated route and its
request graph. It does not establish which road or direction a real vehicle occupies,
why the snap was selected among ambiguous candidates, initial/final heading
constraints, live GPS provenance, legal road access completeness, conditional or
via-way restriction coverage, or complete stop/pass-through timing and turn semantics.
Unsupported approach-heading fields continue to refuse. The existing profile-turn
checks are not promoted into general legal authority by this additional trace.
No guidance, automatic selection, production binding or deployment is enabled.

## Authoritative GH11.1 interfaces inspected

- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/util/details/PathDetailsBuilderFactory.java
- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/util/details/PathDetailsFromEdges.java
- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/routing/Router.java

The pinned local 11.1 JAR was also inspected by Java reflection, and the hook is
executed against that real JAR in generated-graph tests. CH/LM are not proved by
this flexible-mode implementation. Milestone 3 remains open; migration is NO-GO.
