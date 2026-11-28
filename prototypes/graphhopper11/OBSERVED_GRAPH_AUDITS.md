# Observed imports bound to read-only graph audits

25 November 2026. Fixed synthetic fixture only; no deployment or navigation grant.

## Implemented chain

`observed_graph_audits` invokes the fixed-fixture two-import observer and continues
from its returned in-memory record. It verifies that record against retained
`evidence.json`, both receipts, source/config/model hashes, original graph-file
manifests, bounded import logs, engine/harness hashes and Java launcher/version/
release metadata. A valid content hash is not treated as a trusted signature.
The CLI accepts no uploaded receipt, external OSM/config or existing graph input.

For each observed build it creates a new `bound-audits/build-a` or `build-b`
directory. Existing audit directories are refused, not overwritten. The original
import configuration and artifacts remain unchanged. A distinct load-only config
is derived from the fixed import config with exactly these recorded overrides:

| Field | Import | Audit load |
| --- | --- | --- |
| `datareader.file` | `source.osm` | Empty; import disabled |
| `graph.location` | Relative `graph` | Exact observed graph directory |
| `custom_models.directory` | Implicit import working directory | Exact observed build directory |

The model filename and bytes, profiles, turn-cost settings, encoded values, MMAP
storage, import-parser configuration and CH/LM settings are retained. The pinned
GH11.1 runtime supports `custom_models.directory`; the real synthetic test checks
that the custom model can be resolved when the audit process runs from a different
temporary directory. The report records both import/load config hashes and the
explicit override map; it never equates different configuration hashes.

A separate operator-only registry has one ID without route coordinates, solely to
meet the existing local bridge's manifest contract. No registered route is added,
no route API is called and no app factory or listener is started. The actual
manifest points to the original observed graph, source and new load config. It
must match the receipt's complete graph manifest before either diagnostic runs.

The existing pinned native runner sets `setAllowWrites(false)`, disables import
fallback and requires `load()` to succeed before emitting either audit result.
Successful bound inventory/finite-geometry responses therefore observe a read-only
load for these exact audit requests. They do not prove graph loadability for all
profiles, code versions, endpoints or environments, and do not grant route authority.
An inventory mismatch or incomplete finite probe can coexist with an observed load.

## Refusal and evidence boundaries

The chain rechecks original inputs/model/graph/logs/receipts before and after audit
stages. Each nested audit must retain its own valid evidence identity, exact
scope/schema, current auditor source hash, manifest/config/graph/source/engine/code
bindings, matching Java version and disabled navigation. The chain checks all
load configs/registries and manifests again after both builds, plus Java and code
bindings, before writing final `bound-audits/evidence.json`.

Changed or missing original artifacts, mismatched receipts/evidence, graph/root
symlinks, altered load configs or auditor claims refuse. No graph is rebuilt if
loading or validation fails. Budget exhaustion, spatial mismatch or incomplete
observations remain unknown/mismatched; the chain does not invent a matching
coverage verdict. Both original import records and nested diagnostics retain their
own identities; the new chain has a separate binder-source/content identity.

These are observer records, not independent cryptographic attestation. Hashes
are checked before/after operations, not against a frozen filesystem. Read-only
means the engine's read-only mode plus unchanged graph-file hashes; no new OS
read-only mount, hard RAM/CPU/disk quota or network namespace is installed here.
Transient replacement or a compromised observer/JVM/kernel remains outside this
proof. Java launcher/version/release checks do not hash every JDK library.

The spatial oracle shares its geometry-distance kernel with the index diagnostic.
Finite one-metre vertex/midpoint probes cannot establish every segment/cell/radius,
projection or global envelope. General reproducibility, index geometry coverage,
legal/hazard compliance, physical road/heading association and real UK/US capacity
remain unverified. The import comparison still includes every graph file and can
report timestamp-related metadata differences; nothing normalizes those away.

## Invocation and result interpretation

Example from a reviewed local checkout, not a VPS command executed here:

```sh
python -m prototypes.graphhopper11.observed_graph_audits \
  --jar /path/to/hash-verified/graphhopper-web-11.1.jar \
  --output-parent /path/to/existing/scratch
```

Optional `--edge-limit` is 1–10,000; `--sample-limit` is 1–128. Limits are validated
before starting imports. Imports use their existing bounded fixed environment and
process limits. Bound audits reuse that clean-environment bounded process runner
through an operator-only bridge factory, retaining manifest verification, existing
process/output/heap/native limits and fixed scratch-home/temp JVM flags. Host Java
options, classpaths and dynamic-loader overrides are not inherited by the child.
This also permits legitimate host/CI settings without trusting them in the audit.
The standalone auditors keep their existing default transport; no HTTP input can
select the factory, and the normal app bridge is unchanged.
The full workflow includes two imports and four audit loads, plus integrity/runtime
checks; it is not a scalability benchmark or a single-request latency measurement.

- Exit 0 / `BOUND_FINITE_CHECKS_MATCHED`: both observed graphs loaded through bound
  read-only audit requests, inventory matched and complete finite probes matched.
- Exit 2 / `BOUND_CHECKS_UNVERIFIED_OR_MISMATCHED`: bound load observations exist,
  but at least one inventory/probe observation is incomplete or mismatched.
- Exit 1 / `OBSERVED_GRAPH_AUDIT_REFUSED`: construction, artifact, runtime, audit
  evidence, workspace reuse or other integrity/contract checks refused the chain.

Every result retains navigation false, production migration NO_GO and general
coverage/reproducibility/legal compliance UNVERIFIED. JSON output omits absolute
paths and probe coordinates. Retained load config files contain local scratch
paths and stay under the observer's private scratch root; raw import logs remain
local. No owner/device history, saved journeys or real datasets are accessed.

## Verification and remaining work

Focused tests use actual GH11.1 synthetic imports and read-only loads. They verify
unchanged original graph/source/model/config hashes, explicit config mapping,
complete nested bindings, partial-probe semantics, pre-Java artifact refusal,
mutation between audits or after earlier load configs were checked, changed
Java/binder identities, mislabeled/rehashed evidence, hostile inherited runtime
settings, symlinks, workspace-reuse
refusal and the CLI's fixed-input boundary. Routing and reimport entrypoints are
forbidden in the successful read-only continuation test. The new file is included
in the existing Java 17 CI job.

This closes the fixed-synthetic import-to-load-to-diagnostic binding checkpoint.
It does not close exhaustive spatial coverage, real UK/US construction/scale,
mandatory legal/hazard enforcement, the four full UK journey acceptance streams,
phone behaviour or rollout/rollback gates. Milestone 3 remains open. No VPS2 or
production graph/service/configuration/data has been read, changed or deployed.
