# Independent stored index membership diagnostic

26 November 2026. Offline and synthetic-tested only. No navigation or coverage grant.

## Implemented scope

`stored_index_membership` decodes the actual `location_index` bytes independently
of GraphHopper's query API, tile visitor and global edge deduplication. It compares
those stored `(cell x, cell y, undirected edge ID)` memberships with necessary
strict-interior intersections calculated from exported base-graph geometry by a
separate exact-rational rectangle-clipping implementation. It does not use the
producer's `PixelGridTraversal` or the previous finite-probe selector.

The small read-only `MembershipInputExport.java` supplies loaded graph bounds,
branching layout, resolution/checksum metadata, actual edge IDs and decoded geometry
as decimal strings. It uses the pinned JAR, MMAP, `setAllowWrites(false)` and
`load()` without import fallback. It does not call routing or index-query methods.
The layout metadata still comes from GH11.1's grid-sizing helper, so this is **not**
an independent proof of the grid metadata, importer or every part of the engine.

The Python wrapper uses the existing manifest verifier before/after work, checks
the bytes against the manifest's `location_index` hash, and binds the graph/source/
config/policy/engine/verifier identities, export digest, auditor/exporter/transport
source hashes and Java launcher hash. The raw geometry is captured under the
existing clean-environment bounded process runner and never emitted in the CLI
summary. No app factory, listener, GPS, account, route, cache or saved-journey
integration is added. The existing observed-import audit chain is unchanged;
this is a separate explicit operator diagnostic, not automatic promotion of those
construction receipts or their boundary-only fixture.

## Pinned binary grammar

Supported input is GH11.1's version-5 location index in the observed MMAP file
layout, protected by the existing exact engine JAR checksum. Unknown formats refuse.
The decoder checks:

- Modified-UTF `GH` marker, big-endian declared length/segment size and 20 integer
  headers, the 100-byte data offset, reserved fields and exact version/checksum/
  resolution agreement. Payload tree integers are little-endian.
- Positive forward child pointers, bounded reachable tree ranges and depth/layout,
  non-overlapping ownership of table/leaf words, and no pointer aliases/cycles.
- Negative singleton encoding `-edge_id-1`; multi-ID leaf arrays use an exclusive
  end pointer. Empty/noncanonical arrays, duplicates and unknown edge IDs refuse.
- Morton child coordinates decoded by bit extraction, preserving per-cell IDs
  instead of the public query API's global ID deduplication.

Official source consulted at tag `11.1`:
[AbstractDataAccess](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/AbstractDataAccess.java),
[MMapDataAccess](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/MMapDataAccess.java),
[LineIntIndex](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/storage/index/LineIntIndex.java),
[SpatialKeyAlgo](https://github.com/graphhopper/graphhopper/blob/11.1/core/src/main/java/com/graphhopper/geohash/SpatialKeyAlgo.java).
The pinned JAR's `Constants.VERSION_LOCATION_IDX` is 5. Actual generated MMAP
files were used to check the mixed-endian/offset interpretation. RAM_STORE's
length convention is not silently accepted as equivalent to this MMAP contract.

This parses the reachable tree; unused allocation/padding is not an exhaustive
canonical-format proof. File hashes still bind all bytes. Future index versions,
branching schemes or serialization changes require a new reviewed decoder.

## Geometric model and boundary uncertainty

Each exported decimal token is interpreted as an exact rational number. This is
a declared decimal planar model, not proof of Java binary rounding, geodesic
geometry or physical road/heading association. Every potentially intersected cell
in a segment's bounded rectangle is independently clipped against the segment.
A required membership exists only when the segment intersects the cell's strict
interior after excluding a fixed `1/1000000000` degree band at each cell boundary.
The band is an explicit unverified exclusion domain, not a proved numeric-error
bound, positional accuracy or GPS tolerance. It cannot be changed through the CLI.

Corner touches, grid-aligned segments and other contacts that intersect a closed
cell but fail the shrunken-interior test are reported as boundary/near-boundary
pairs that remain unverified. If another segment of the same edge requires that
cell's interior, the pair is required once. Extra stored pairs remain unassessed;
they are not certified correct. Undirected storage IDs do not prove directional
camera association, access legality, turn correctness or mandatory hazard policy.

The diagnostic can observe missing required memberships even if the same edge ID
is present elsewhere and a global inventory still matches. It does not rely on a
neighbouring-cell query that can mask a missing entry. A boundary-only graph with
zero interior requirements reports unknown; it never passes vacuously.

## Limits and result interpretation

Defensive limits are 8MiB for the index, 1,000 exported edges, 10,000 vertices,
256 modeled parts per axis, 10,000 parsed leaves and 100,000 claimed words/stored
pairs/geometric candidate checks. The exporter has a 512MB JVM heap, one active
processor setting, 60-second process timeout and 2MiB capture cap. The Python
oracle has operation/input caps, not a new hard CPU/RAM/disk sandbox. Artifact
hashing/loading costs are additional and no real-graph performance is claimed.
Coordinates above 80 degrees, frames wider than 180 degrees, unsupported decimal
encodings or tiny grid cells refuse. No dateline/global support is inferred.

Example only, not a VPS command executed here:

```sh
python -m prototypes.graphhopper11.stored_index_membership \
  --manifest /path/to/reviewed/isolated/manifest.json
```

- Exit 0: `INTERIOR_REQUIREMENTS_MATCHED_BOUNDARIES_UNVERIFIED` — nonempty required
  strict-interior pairs matched. The unassessed domain remains unverified.
- Exit 2: `MISSING_REQUIRED_INTERIOR_MEMBERSHIPS` or
  `NO_INTERIOR_REQUIREMENTS_UNVERIFIED` — missing requirements or no non-vacuous
  interior comparison. Neither establishes route absence.
- Exit 1: `STORED_MEMBERSHIP_REFUSED` — contract, format, budget, execution or
  artifact/code integrity refusal. No partial success result is produced.

Every summary retains boundary/index coverage UNVERIFIED, navigation false,
route absence unproven and migration NO_GO. Counts and membership digests omit
coordinates, edge lists, cell addresses, absolute paths and raw export contents.
Evidence hashes are content identities, not signatures. Pre/post checks do not
freeze the filesystem or attest the OS/JVM/import history. The Java launcher hash
does not attest every runtime library. External model provenance still needs the
separate observed-construction chain; this diagnostic adds no legal-policy proof.

## Verification and remaining gates

Hand-built binary fixtures use explicit Morton tables, separately from the
reader's bit extraction, and exercise single/multi-ID and multilevel leaves.
Controls delete a membership or substitute a wrong edge in a cell while retaining
all global IDs; both are detected. Tests reject truncated/unknown headers, aliases,
back/out-of-range pointers, bad/duplicate IDs, malformed numeric metadata, failed
exports and exhausted budgets. Exact geometry cases cover reversed/corner/zero-
length and boundary/near-boundary contacts. Actual synthetic GH11.1 files match
required interiors; manifest, graph and code changes refuse, and CLI output is
redacted. The test file is included in the existing Java 17 CI job.

No real UK/US graph, device history or physical phone was used. Independent layout
metadata, complete boundary/numeric/geodesic semantics, observed-construction
integration with an interior-rich fixture, real-artifact support/scale and the four
full UK journey acceptance streams remain open. Nothing is merged or deployed;
VPS2 and production are unchanged.
