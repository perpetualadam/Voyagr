# Indexed origin-candidate lookup prototype

24 November 2026. Operator-selected offline diagnostic only. No navigation authority.

## Implementation

`diagnose_origin.lookup` now accepts `full_scan` (the existing default) or `index`.
Indexed mode calls GH11.1's `LocationIndex.query(BBox, Visitor)`, not `findClosest`.
It retrieves stored original edge IDs without a routing/avoidance/heading filter,
then reads each edge from the same loaded base graph. Both lookup modes use the
same segment-distance function and encoded `car_access` directions. Duplicate
callbacks are deduplicated before geometry work; exclusions cannot hide the road
on which a vehicle might be located. Indexed mode does not fall back to a full scan.

The query envelope intentionally over-collects using the native spherical bounding
box for `2 * radius_m + 0.05` metres. The final geometry check still uses the original
radius; this padding is not permission to relocate the vehicle. Polar centres above
80 degrees absolute latitude, or envelopes crossing the antimeridian, return an
unverified observation without querying. Broader envelope/global-geometry coverage
is not established by the regional synthetic tests.

Limits remain 10,000 unique processed edges, 100,000 geometry vertices, 256 recorded
candidates and a soft 250 ms deadline. Indexed mode additionally stops after
10,000 visited tiles or 50,000 edge callbacks. Exceptions, invalid edge IDs and
budget exhaustion return unverified diagnostics, not an alternative lookup. Deadline
checks are callback/geometry cooperative; native file access and internal index
processing are still subject to the outer subprocess/memory/output limits, not a
hard real-time guarantee.

## Completion is not coverage

`index_query_complete` means the bounded stored-index query returned normally.
It does **not** mean every appropriate graph edge was indexed or placed in the
correct tile. Indexed observations therefore always retain:

- `scan_complete: false` and `classification: UNVERIFIED`;
- `index_coverage_verification: UNVERIFIED`;
- unverified physical road and heading, disabled navigation and no proof of route absence.

Counts and keys remain observations scoped to the loaded graph. They do not become
physical approach, access/legal, hazard, heading or navigation capability evidence.
The existing full scan remains a small-graph comparison oracle, not an automatic
runtime fallback or general physical-road oracle. This diagnostic is not promoted
into HTTP responses, saved references or guidance decisions. HTTP clients still
cannot enable it or provide its options.

## Evidence and negative controls

Actual GH11.1 generated-graph tests compare indexed and complete full-scan key sets
for 68 point/radius combinations: parallel roads, long edge interiors with vertices
outside the small query envelope, a confirmed index-tile border and nearby offsets,
diagonal geometry, one-way and junction neighbourhoods, and empty neighbourhoods.
The same synthetic geometry is also imported after translation to latitude 53,
longitude -1 and latitude 40, longitude -105. These are generated fixtures at those
latitudes, not real UK/US road datasets. At least one fixture query processes fewer
edges than the full scan; no real-graph capacity, import or latency benchmark is claimed.

A test-only native index wrapper supplies duplicate callbacks, a silently empty
index, exceptions, invalid IDs, callback floods and tile-budget floods. Duplicates
preserve the observed set. The empty index completes with zero candidates while
the independent full scan sees four: the indexed result must remain unverified.
Other failures and limits cannot claim a unique approach or trigger a full-scan
fallback. Invalid point types and unsupported lookup options refuse. A normal
operator-fixture invocation also exercises the existing anchor-index delegation
and retains excluded-road candidates.

## Official interfaces inspected

- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LocationIndex.java
- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LocationIndexTree.java
- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LineIntIndex.java
- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/GraphHopper.java
- https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/util/DistanceCalcEarth.java

The interface explicitly describes stored edges, with possible extras outside the
box. Default index preparation uses all edges, but its construction helper catches
and logs exceptions; the loaded index checksum is based on node/edge counts rather
than a full geometric coverage proof. Inspection of official code and successful
small-graph comparisons therefore do not justify a universal completeness claim.

## Remaining gate

Before live use, establish index-construction provenance and geometry/tile coverage
on real version-pinned graphs, global envelope behaviour where supported, and
measured bounds under dense/sparse/concurrent workloads. Independent live GPS
uncertainty, road and heading provenance, candidate-to-request-graph linkage,
turn/leg semantics and full settings/cache/selection/restore acceptance remain
necessary. No new GPS inputs, location history, persistent storage, production
wiring, graph downloads or VPS changes are included. A future reviewed package and
manifest would be required before any separate deployment. Milestone 3 stays open;
production migration remains NO-GO and navigation stays disabled.

A subsequent checkpoint adds a separate manifest-bound edge-ID inventory audit;
see INDEX_INVENTORY_EVIDENCE.md. It detects structural omissions, but a matched
inventory deliberately does not verify spatial placement or upgrade indexed
observations. No live lookup or navigation gate is enabled by the audit.
