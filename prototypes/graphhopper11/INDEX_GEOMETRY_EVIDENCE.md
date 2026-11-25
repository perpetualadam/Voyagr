# Manifest-bound finite geometry probes

25 November 2026. Offline operator diagnostic only; navigation remains disabled.

## Implemented observation

`index_geometry_audit` loads a verified isolated manifest, sends a separate
`audit_index_geometry` native request, and rechecks the artifacts afterward. It
records graph/source/policy, configuration, engine and native-runner identities,
Java runtime, the auditor's source hash and a canonical evidence hash. These are
artifact bindings, not a signature or proof of construction history.

The native audit enumerates base-graph edges in stored order and selects each
geometry vertex and each adjacent pair's arithmetic midpoint. Duplicate points
are retained, preserving a deterministic selection order. Each selected point
uses a fixed one-metre radius and compares directed encoded-car-access candidates
from the independent full graph scan with candidates retrieved from the stored
index and filtered by the same distance kernel. Avoidance rules do not filter
these observations. The geometry selection is independent of index contents;
the distance kernel is shared, so this is not independent verification of that
kernel or of physical road association.

Output contains aggregate/sample counts and ordinal positions, not coordinates,
edge lists, local paths or device data. A complete comparison requires the full
scan and index query to finish within their existing limits. An incomplete
comparison retains null match/missing/unexpected verdicts. A completed mismatch
is retained even when selection was truncated. Completing all selected probes
is still finite point sampling, never proof of every edge segment, tile, radius,
latitude, projection, mode or query envelope.

The deliberately misleading test index from the inventory checkpoint still
contains all global edge IDs but returns no spatial candidates. Inventory matches;
these geometry probes detect missing directed traversals. Normal and duplicated
callbacks match the synthetic oracle. Exceptions, invalid IDs and flooded
callbacks/tiles remain unverified. No fallback lookup supplies an apparent pass.

## Limits and invocation

Example only; this work did not run on VPS2:

```sh
python -m prototypes.graphhopper11.index_geometry_audit \
  --manifest /path/to/isolated/manifest.json \
  --edge-limit 10000 --sample-limit 128
```

Edge limit: 1–10,000; sample limit: 1–128. Each spatial/full comparison inherits
the existing 250ms soft deadline, vertex/candidate/callback/tile limits and
unsupported polar/seam handling. Selection is capped at 100,000 geometry vertices;
the native operation has a soft 20-second deadline and the existing transport
retains its hard process timeout/output and heap limits. Selection order favours
earlier stored edges when truncated; it is not statistically representative.
The full scan repeats for each probe; real UK/US cost and scalability are unmeasured.
A small sample limit does not make a graph larger than the full-scan budget valid.

- Exit 0: all selected finite probes matched, with complete selection/comparison.
- Exit 2: valid mismatch or unverified/incomplete observation.
- Exit 1: input, artifact, transport or evidence-contract refusal.

Every result keeps index geometry coverage, construction lineage, physical road
and heading UNVERIFIED, route absence unproven, navigation false and migration
NO_GO. Audit requests cannot mix with routing/inventory requests, and HTTP clients
cannot enable the native audit. It imports no graph, starts no listener and changes
no graph/configuration or browser storage. The module is not added to the running
VPS package.

## Construction evidence still required

A manifest currently binds the supplied source hash to the supplied graph hash;
it does **not** prove the graph was constructed from that source. A reproducible
construction experiment must be a separately reviewed isolated action and record:

1. Empty output directory and version-pinned source/config/JAR/JVM identities
   before import; resolved built-in/custom models, encoded values, profile and
   acceleration settings, parser/import code and platform facts.
2. The exact import invocation, bounded resources, return status, start/end times
   and a sanitized log digest, with no source replacement during construction.
3. The resulting complete graph/index file manifest, pre/post input rechecks and
   the precise graph-loading configuration. Distinguish generated import config
   from runtime overrides; a changed path is not proof of equivalent inputs.
4. A second clean build under recorded conditions. Compare artifact hashes and
   explain nondeterminism rather than asserting byte-for-byte reproducibility.
5. Independent geometry-to-cell coverage checks on the versioned output, including
   long edges, intermediate segments, tile borders/corners, overlapping/parallel
   roads, high latitudes and supported global envelopes. These finite probes
   contribute negative controls, not exhaustive proof.
6. Measured real-artifact CPU/RAM/I/O/runtime and dense/sparse/concurrent query
   acceptance before considering a live locator or any authority change.

No construction experiment, real dataset import/download, VPS command, deployment,
production change or physical-phone test was performed here. All new graph data
is generated synthetic data. Milestone 3 and its four full UK journey acceptance
streams remain open; construction lineage and exhaustive spatial coverage remain
unverified.
