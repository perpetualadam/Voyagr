# Finite segment-and-tile probes

25 November 2026. Synthetic/offline diagnostic improvement; navigation remains disabled.

## What changed

The optional geometry audit now identifies its selection strategy as
`segment_tile_intersections_v1`. It derives a uniform leaf-grid model from the
loaded GH11.1 `LocationIndexTree` resolution and base-graph bounds using
`IndexStructureInfo`. It selects, in deterministic stored-edge/segment order:

1. Both segment endpoints and the original arithmetic midpoint.
2. Every interior horizontal/vertical grid crossing on that segment.
3. The midpoint of each parameter interval between crossings/endpoints.

Selection comes from graph geometry and the grid model, independently of which
edge IDs a stored index query returns. Long segments spanning multiple cells
therefore receive interior probes that vertices/midpoints alone can miss. Exactly
equal crossing parameters are deduplicated, including an exact corner. Distinct
near-corner parameters are retained; tiny intervals may consume the budget rather
than being silently discarded. Zero-length and grid-aligned segments retain
finite probes. Duplicate coordinates across probe kinds or segments are retained.

Each selected point still compares the existing bounded full-scan oracle with
stored-index candidates using the same distance kernel and fixed one-metre radius.
No avoidance filter, route search, account service or device GPS is involved.
Ordinary routing output is unchanged; this executes only in the explicit offline
audit mode. The observed-import read-only audit chain automatically receives the
stronger strategy through the same geometry auditor and manifest binding.

## Why not infer coverage from tile callbacks?

The upstream GH11.1 implementation is the evidence for the grid/query assumptions:

- [LineIntIndex.java, lines 166–185](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LineIntIndex.java#L166)
  uses a query-wide `IntHashSet` to deduplicate edge IDs. A global edge list cannot
  establish every edge's leaf-cell membership.
- [LineIntIndex.java, lines 222–228](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LineIntIndex.java#L222)
  reports tile information before applying that tile's query acceptance test.
  Callback counts therefore do not certify accepted or geometrically covered cells.
- [LocationIndexTree.java, lines 185–216](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LocationIndexTree.java#L185)
  inserts every adjacent pair of pillar/tower geometry points into the construction
  index. Import completion alone is not independent spatial validation.
- [IndexStructureInfo.java](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/IndexStructureInfo.java#L29)
  derives grid parts from graph bounds and resolution; its delta accessors are at
  lines 118–124. These are index cells, not regional routing graphs or country/state
  partitions.

The selector uses this same grid-sizing helper; it does not independently prove
that helper correct or parse/validate the binary index format. Its axis-crossing
math is separate from the importer's line-grid traversal, with manual synthetic
corner/reverse/alignment tests. The full-scan/index comparison still shares the
geometry-distance kernel, so it cannot expose a common error in that kernel.

## Negative control and verification scope

A test-only index view keeps all global IDs and answers the old main-road vertices
and adjacent-vertex midpoint queries correctly. It returns no spatial candidates
near the main-road interval in the first modeled cell, positioned from the actual
loaded grid metadata.
The inventory matches and all former probes match; the new strategy records
`MISMATCH_OBSERVED` with missing directed traversals. This is an injected query-view
defect, not a claim that production or GH11.1's normal stored index has this defect.
The control's location is derived from metadata rather than guessed grid spacing.

Normal and duplicate-callback indexes match. Grid resolution zero remains unknown
without spatial queries. Synthetic UK/US translated graphs match; fault/budget
controls retain uncertainty. Crossing math checks exact corners, reversed segments,
grid-aligned segments, near-corner distinct cuts and zero-length segments. Metadata
checks reject unsupported strategy labels, promoted coverage and inconsistent
probe counts. These are generated synthetic tests, not real UK/US or phone results.

## Evidence, limits and honest interpretation

The observation adds strategy, loaded resolution, modeled parts per axis, visited
segment count and endpoint/original-midpoint/crossing/cell-interval probe counts.
Counts must sum to selected probes. For complete selection, endpoints are twice
visited segments, original midpoints equal segments, and cell intervals equal
crossings plus segments. Partial selection keeps partial counts and cannot claim
complete comparison. Invalid/unsupported grid metadata remains unknown or refuses.

All existing edge/sample/vertex/time/transport/heap limits remain. Selection caps
are 10,000 edges, 100,000 geometry vertices and 128 probes; cut accumulation is also
bounded before potentially walking a huge grid. Grid resolution is restricted to
1–1,000,000 metres and modeled parts to at most 1,048,576 per axis. Polar centres
above 80 degrees and antimeridian-spanning segments are unsupported. These limits
are defensive diagnostic bounds, not measured capacity claims.

More probes mean a previously complete small-budget audit can now be incomplete;
that is reported honestly, never upgraded. Existing strategy records are not
rewritten or silently reinterpreted: fresh runner/auditor hashes and the explicit
strategy/count contract distinguish current evidence. Existing operator commands
are unchanged; see INDEX_GEOMETRY_EVIDENCE.md and OBSERVED_GRAPH_AUDITS.md.

Even visiting all selected segment/grid intervals does not establish all points,
query radii, tile memberships or envelopes. The query box spans neighbouring cells,
so neighbouring valid entries can mask a missing entry in one cell. Boundary-only
touches, floating-point effects and tiny near-corner intervals are not exhaustive
coverage proof. Interval midpoints and crossing probes remain finite samples. Arithmetic
latitude/longitude interpolation and the shared distance kernel are not validated
for every long/geodesic segment; matching empty candidate sets prove no absence.
The report always retains index geometry coverage, physical road/heading and
construction-lineage verification as UNVERIFIED, route absence unproven, navigation
false and migration NO_GO. No global absence or uniqueness verdict is added.

## Remaining work

An independent segment-to-cell membership validator still needs a reviewed binary
index/leaf-membership strategy, treatment of boundary touches/tolerances and a
complete support envelope. It must be checked against adversarial synthetic
indexes, then separately approved real artifacts and measured resource limits.
General real UK/US construction, mandatory legal/hazard proof, the four full UK
journey acceptance streams, physical-phone behaviour and deployment remain open.
No VPS2 or production service/configuration/data was accessed or changed here.

The subsequent STORED_INDEX_MEMBERSHIP.md checkpoint adds an independent bounded
MMAP leaf decoder and a strict-interior rational oracle. It can detect missing cell
membership masked by global IDs, but leaves layout metadata, boundary/numeric
semantics, complete coverage and construction integration unverified.
