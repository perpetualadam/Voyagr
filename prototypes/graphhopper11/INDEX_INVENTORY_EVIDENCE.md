# Manifest-bound index edge inventory audit

24 November 2026. Explicit offline audit only. No spatial-coverage or guidance grant.

## What this checks

The new `index_inventory_audit` operator module loads an existing isolated manifest
through the current verifier, runs a separate audit-only native command, then
rechecks the manifest artifacts and source before returning a report. It records
graph/source/policy identities, config/JAR/native-runner hashes, Java runtime and
its own auditor-code hash. The evidence identity is a canonical content hash,
not a signature, trusted import attestation or navigation capability.

The Java auditor loads the existing graph with writes disabled and no import
fallback. It enumerates actual base-graph edge IDs, visits all stored location-index
IDs without routing filters, and reconciles two BitSets. Completed reconciliation
reports matched or mismatched edge-ID inventory, missing/unexpected counts and
canonical bitmap SHA-256 digests. It does not return coordinates, paths, edge-ID
lists or device/history information. Incomplete work reports UNVERIFIED and leaves
match/difference/digest verdicts explicitly null; unknown values are not zero.

A dedicated simple-JSON writer preserves these nulls. GraphHopper's normal routing
writer omits null entries, which initially caused the negative tests to lose the
explicit unknown fields. Routing serialization remains unchanged.

## Invocation and exit status

From a reviewed checkout with the required Python dependencies, Java 17 or newer,
the pinned GH11.1 JAR and an existing prepared manifest:

```sh
python -m prototypes.graphhopper11.index_inventory_audit \
  --manifest /path/to/isolated/manifest.json \
  --edge-limit 10000
```

This is an example, not a VPS command executed in this work. The tool does not
install software, rebuild/import graphs, start listeners, migrate storage or
change configuration. It writes only its temporary request file and JSON stdout.
A future VPS run or package update requires a separately reviewed action/approval.

- Exit 0: the narrow edge-ID inventory matched; geometry coverage remains UNVERIFIED.
- Exit 2: a valid mismatch or incomplete/unverified observation was recorded.
- Exit 1: input, artifact binding, execution or evidence contract was refused.

The default budget is 10,000 graph/index IDs. Explicit limits may reach 50 million
IDs; that ceiling is not a capacity claim. Graph ID space is bounded to 50 million
before bitmap allocation. The native walk has a soft 20-second deadline and derived
callback/tile limits; the existing transport timeout, output cap and heap choices
(512/1024/2048/4096 MB) remain in force. Global GH11 index traversal internally also
allocates a deduplication set: its real-graph memory/I/O costs are unmeasured and
can cause refusal. Hashing artifacts and loading mapped files have their own costs;
these limits are not a hard end-to-end latency guarantee or benchmark result.

## Why matching is insufficient

A global list can contain every correct edge ID while storing them in the wrong
spatial cells. The test-only `spatial_empty` index view returns all IDs for the
global query and none for a bounding-box query. Its inventory matches, while the
full-scan oracle sees four nearby directed candidates and indexed lookup sees zero.
The audit therefore always retains unverified index geometry, physical road and
heading, disabled navigation and no proof of route absence. Nothing feeds a matched
inventory into HTTP responses, saved plans, rule compilation or guidance.

Pre/post manifest checks bind the observation to files as checked, not to a frozen
filesystem or authenticated construction history. They cannot prove that a graph
was actually imported from its declared source or that an index builder placed
all geometry correctly. A read-only isolated snapshot strengthens operational
reproducibility; further construction and coverage evidence is still required.

## Verification scope

Generated GH11 graphs cover matched and missing inventories, duplicate callbacks,
exceptions, invalid IDs, budget exhaustion and the matched-but-spatially-wrong
control. Python checks reject contradictory counts/hashes, partial verdicts,
authority claims, stale manifests, changed artifacts/auditor code, invalid budgets
and routing reports mislabeled as audits. The CLI checks structured output, narrow
exit status and omission of local paths. Audits do not perform routing queries;
normal HTTP inputs cannot enable or mix audit mode with registered routing.

The new Java mode permits zero cases only for the exact audit-only envelope. It
uses the existing pinned-JAR bounded transport and read-only loader; normal case
validation and routing paths remain separate. The Python tool is not imported by
the normal app factory or added to the running VPS image.

All new graph data is synthetic. No existing VPS index, import log, UK/US dataset,
private location history or physical phone was accessed. No nationwide sizing or
real-index coverage result is claimed.

## Remaining evidence

A release still needs reproducible import lineage (source/config/engine/runtime),
independent geometry-to-cell coverage validation on real version-pinned artifacts,
regional/global envelope acceptance and measured dense/sparse/concurrent resource
bounds. Live GPS uncertainty/heading and road association, candidate-to-request
graph linkage, full turn/leg/settings/cache/restore acceptance and physical-phone
checks remain open. This audit supplies one artifact-bound structural observation;
it does not close those gates. Milestone 3 remains in progress, migration is NO-GO,
and navigation stays disabled. Nothing is merged or deployed by this work.

The subsequent INDEX_GEOMETRY_EVIDENCE.md checkpoint adds manifest-bound finite
geometry probes. It detects the matched-inventory/spatially-empty control, but
neither a matching inventory nor matching finite probes establishes construction
lineage, exhaustive coverage or live-origin authority.
