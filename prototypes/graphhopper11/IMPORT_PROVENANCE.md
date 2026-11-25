# Observed synthetic import provenance

25 November 2026. Operator-only experiment; no UK/US input or production change.

## Implemented harness

`import_provenance` accepts the previously downloaded checksum-pinned GH11.1 JAR
and an existing scratch parent. It creates a new mode-0700 child, then separate
new `build-a` and `build-b` directories. It never accepts an OSM path, supplied
configuration, arbitrary JVM flags or existing graph directory. The only OSM data
is an embedded three-node synthetic fixture containing one OSM way. Existing files
in the parent are retained untouched.

Each build writes the same fixed relative-path import config and fixture. The
pinned JAR's `com/graphhopper/custom_models/car.json` bytes are extracted and
recorded under `observed-car.json`; the name differs because GH11 refuses a local
file named `car.json` that collides with its built-in model. Its hash is included
with the pre/post source and config hashes. Encoded values, MMAP storage, car
profile/turn costs, ignored highway classes and disabled CH/LM are explicit in
the recorded config. No external custom areas, elevation or map downloads are
configured. Parser/import code and built-in resources are bound by the whole
pinned JAR hash; this is not independent validation of those parsers.

The harness observes the actual `java -jar … import config.yml` invocation in
each new working directory, return code, UTC start/end and elapsed wall time,
bounded log digest/size and complete graph-file hashes. It retains `receipt.json`
per completed attempt, bounded local `import.log`, and a final `evidence.json` only
when final integrity checks permit. Failed imports retain false observation
flags and null graph verdicts; a failed first import does not run a second one.
Input replacement during import is recorded as failure and refuses the final
summary. Both prior and later artifacts/logs and retained receipts are rechecked before final evidence.

It records observer-code and Java-launcher hashes, sanitized Java version, the
JDK release-file hash when available, a version-output digest and basic platform
facts. Java version output and release metadata are rechecked. This does not hash
every JDK shared library, attest the operating system or freeze the filesystem.
Pre/post checks cannot detect all transient replacement, malicious observer code
or a compromised JVM/kernel. Evidence/receipt hashes provide content identities,
not signatures or independent trusted attestations.

## Resource and privacy boundaries

Commands have a fixed environment (PATH, locale, timezone, scratch HOME/TMPDIR),
without inherited Java options or credentials. JVM temporary/home properties
point at the new working directory and shared performance-data output is disabled.
Stdin is closed; JVM heap is 512MB
and ActiveProcessorCount is 1. These JVM settings are not hard container RAM/CPU
quotas. Each import has a bounded 1–120 second timeout (CLI fixed at 120s), two-MiB
capture cap and child-process-group cleanup. There is no hard disk quota or new
network namespace. Use a separately reviewed network-disabled/resource-limited
container for a future larger experiment; do not interpret this small local run
as a performance or capacity benchmark.

Raw logs remain within the new private scratch directory and can contain local
synthetic workspace paths. They are never emitted through stdout or an HTTP API.
The JSON output contains hashes, counts/timing, normalized command tokens, graph
relative filenames and a generated output identifier, not absolute paths, private
source data, GPS fixes, passwords or journey history. Failure stdout is generic.
Do not upload arbitrary raw logs as evidence; inspect and redact them first.
No app factory imports this module, and no runtime/VPS container includes it.

## Rebuild comparison and local result

Every graph file participates in the comparison. The report lists changed,
first-only and second-only filenames, with all hashes preserved in the receipts.
`BYTE_IDENTICAL_OBSERVED` means only that these two outputs matched. A difference
is `DIFFERENCES_OBSERVED`; it is never hidden by excluding metadata files, and it
does not automatically mean import failure. General reproducibility remains
UNVERIFIED in both cases.

The initial corrected local Java 21 run observed two successful imports with
changes in `properties` and `properties.txt`. A text diff of `properties.txt`
showed `datareader.import.date` differing between the two import times. Binary
`properties` differed by one byte; this observation alone does not independently
parse or explain every possible binary difference. Other runs/runtimes may differ.
CI exercises the same harness under Java 17; no byte-identity outcome is asserted.

A successful observed import is not a read-only graph-load test or proof of
routing/turn/hazard correctness. `read_only_graph_load`, index geometry coverage,
legal/hazard compliance and general reproducibility remain UNVERIFIED. Navigation
is false and production migration is NO_GO regardless of output equality.

## Commands and exit status

Example from a reviewed local checkout, not a VPS command executed here:

```sh
python -m prototypes.graphhopper11.import_provenance \
  --jar /path/to/hash-verified/graphhopper-web-11.1.jar \
  --output-parent /path/to/existing/scratch
```

No engine or dataset download is performed by this command. Generated artifacts
remain under a fresh `voyagr-gh11-import-*` child for review; nothing is deleted.

- Exit 0: two fixed-fixture imports were observed and final bindings checked.
  This does not require or imply byte-identical graphs.
- Exit 2: a process failure/limit prevented establishing both imports; retained
  receipts cannot be promoted to successful construction evidence.
- Exit 1: artifact, runtime, input/output integrity or other harness refusal.

Focused tests:

```sh
GH11_PROTOTYPE_JAR=/path/to/hash-verified/graphhopper-web-11.1.jar \
  python -m pytest -q tests/test_gh11_import_provenance.py
```

Tests cover two real imports, complete receipts and output hashes, explicit
file differences, wrong engines, invalid budgets, failed imports, changed earlier
source/model/graph/logs/receipts, replacement during import, changed observer source,
existing-file preservation, inherited-option removal, output caps, process-group
timeout cleanup and refusal of external input arguments. The test file is included
in the existing Java 17 synthetic CI job.

## Remaining gates

This is the first observed-construction harness, restricted to its fixed synthetic
fixture. Next: bind read-only graph loading and the inventory/finite-geometry
audits to the exact newly observed output. Reproducible real UK/US construction,
independent exhaustive geometry-to-cell validation, full runtime/environment
attestation, measured scale/concurrency and the four full UK journey acceptance
streams remain open. Any real-data/VPS experiment requires a separate concrete,
reviewed action. Nothing here imports real maps, enables navigation, merges code,
deploys, restarts services or modifies VPS2/UK production.
