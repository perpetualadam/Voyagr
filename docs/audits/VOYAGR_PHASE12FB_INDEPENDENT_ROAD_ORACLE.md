# Phase 12F-B independent road oracle

Operational status: **PRODUCTION_NO_GO**. Every generated diagnostic has
`reviewed:false`, `navigation_authorized:false`, and `acceptance:UNVERIFIED`.
Synthetic connectivity in an OSM export does not establish a legal safe exit,
GraphHopper graph equivalence, camera avoidance, or permission to relocate an origin.

The previous uncommitted draft did not survive. This implementation was reconstructed
from current main a8d25456406a481dd195a2a3338b27e1a3bca144 and the supplied scope.
No private captures, actual coordinates, export or receipts were supplied. No server
was accessed, including either VPS. No routing/OSM network requests, deployment,
restart, graph rebuild, dataset/configuration changes or private capture writes occurred.
Operator-reported fixture0 ways, nodes, 89-edge candidate and five displacements
are unverified observations and are not embedded as expected passing topology.

## Supported diagnostic model

`voyagr/utils/road_oracle.py` reads bounded Overpass-style JSON. OSM positive IDs,
ordered way nodes, tags and relation members are preserved; duplicate keys/IDs,
nonfinite coordinates, malformed tags/members and absent endpoint nodes are refused.
Limits: 32 MiB per file, 100,000 elements, 200,000 segments. Search retains incoming
way, segment and direction, caps discovered states (default 100,000), and bounds
edge examinations. Restriction-heavy transitions beyond the supported bound become
uncertain. Candidate processing also has an examination limit. No HTTP client or
DB is used. Offline pyproj WGS84 local azimuthal-equidistant projection explicitly
disables PROJ network grids. Only the exact declared ordered segment is projected;
there is no nearest-road search. Degenerate or >100 km endpoint segments and >100 m
projection separation are refused. These are diagnostic input limits, never origin
continuity tolerances. The production gate remains 2 metres.

Each endpoint names a way ID, zero-based segment index, ordered pair of node IDs,
and `[latitude, longitude]`. Virtual endpoints split that segment in both allowed
directions; exact endpoints retain junction identity. Candidate entries are
`[way_id, segment_index, direction]`, with direction +1 in stored node order or -1
against it. Include the first partial segment and last partial segment. When both
projections split a segment, each traversed subsegment consumes one entry. A
candidate starting downstream, ending early, jumping between roads or taking a
forbidden direction/turn is invalid. No incoming turn is invented when the actual
origin itself is a junction; arrival at the target junction needs no outgoing turn.

Explicit/implicit motorway and roundabout direction, reverse direction, bidirectional
roads and motorcar overrides are supported. Unspecified link direction, reversible
and conditional direction remain uncertain. Access precedence is motorcar,
motor_vehicle, vehicle, access, including directional variants at each level.
Conditional permission can add potential traversal, never known traversal. Private/no
access blocks unless conditional evidence makes permission uncertain. Destination,
unknown default/access, dimensional rules, construction and barriers are conservative.
Barrier traversal remains uncertain even with a permissive access tag.

Supported restrictions are complete via-node no/only left, right, straight, U-turn,
no-entry and no-exit relations. Same-way U-turns retain segment/direction. Ambiguous
same-way other turns are uncertain. Via-way, missing members, unsupported kinds,
exceptions and conditional restrictions mark known search uncertain globally.
Conflicting supported restrictions are applied together, never arbitrarily selected.
Missing way nodes set coverage-gap evidence. Unknown restrictions are never ignored
as proof of a known path. A successful known search means only
`KNOWN_PATH_IN_EXPORT`; possible traversal alone is `UNVERIFIED`.

## Provenance and acceptance boundary

The private binding receipt is a separately supplied, reviewed schema-version-1
object. Required fields: `fixture_id`, `export_sha256`, `capture_sha256`,
`road_source_sha256`, `graph_sha256`, `import_receipt_sha256`, `engine_build_sha256`,
`dataset_sha256`, `request_sha256`, `response_sha256`. Export/capture/receipt/specification
hashes are SHA256 of exact input bytes; embedded request/response hashes use the
existing canonical sorted compact JSON encoding. The receipt must agree with the
selected unique fixture and capture engine identities. Existing reviewed transport
validation is reused, including GH8 query-effect proof requirements. HTTP200 alone
cannot establish `ch.disable` activation. Diagnostic endpoint coordinates must equal
the actual recorded requested origin and decoded native snapped origin.

This binding compares operator-supplied provenance; it cannot independently attest
the export's source extraction, graph import or receipt authenticity. Raw wire-body
hashes and source extraction records still need independent review. No source file,
installed graph or extraction receipt was independently examined here. Candidate
selection and exact segment identity also need private independent review. The
report binds the specification hash for that review. A hash is not an authenticity
proof. Never create a receipt or change reviewed flags merely to satisfy the tool.

Diagnostic preparation does not require, generate, populate or overwrite
`engine.oracle_sha256`. Normal replay still requires its separately accepted oracle
reference and all existing five-case, mandatory camera avoidance, transport, native
snap, browser/cache and ranking requirements. Optional replay diagnostics run only
after normal replay validation. Original request/response objects are read-only.
No production routing files or eligibility decisions are changed.

## Remaining unverified requirements

A bounded export does not prove a closed component. All no-path findings therefore
remain UNVERIFIED, including searches exhausted without a possible path. A future
scoped no-path claim needs independently reviewed complete incident-road and
restriction coverage tied to the original source and export; this implementation
intentionally provides no mechanism to assert closure from an unchecked flag.
Via-way and general conditional-rule evaluation remain unsupported. Physical
vehicle restrictions are not resolved. Neither diagnostic nor tests constitute
real-road/GraphHopper acceptance. All five recorded captures and the thirteen
acceptance cases still require real private evidence and independent review.

## Changed-file inventory

- `voyagr/utils/road_oracle.py`: parser, projection, directed graph, search, candidate/provenance checks and summaries.
- `scripts/diagnose-phase12fb-road-oracle.py`: bounded private offline CLI, fixed failure report, sanitized JSON and human summary.
- `scripts/replay-phase12fb-origin.py`: optional diagnostic attachment after existing acceptance validation.
- `tests/test_independent_road_oracle.py`: synthetic topology, malformed-input, provenance, privacy and non-circular replay regressions.
- `.github/workflows/ci.yml`: include the new Python suite in configured backend validation.
- `docs/audits/VOYAGR_PHASE12FB_INDEPENDENT_ROAD_ORACLE.md`: technical audit, inventory, limitations and validation record.
- `docs/audits/VOYAGR_PHASE12FB_CONTABO_OPERATOR.md`: private offline diagnostic procedure.
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`: remaining independent evidence requirements.

## Executed local validation

2026-10-28, disposable cloud checkout; Python 3.12, existing npm lockfile/dependencies.
Geometry dependencies installed from `requirements-geometry.txt`; isolated SQL tools
installed at CI-pinned pgserver 0.1.4 and psycopg2-binary 2.9.13.

- `.venv/bin/python -m pytest -q` with the complete backend file list extracted
  from CI's **Run Python behaviour tests** step: **1,266 passed, 68 subtests passed**.
  This includes all **70** new synthetic oracle tests. It excludes the documented
  desktop/Kivy, custom-router and live-service suites; those were not run.
- Focused oracle/Phase12FB/transport selection during development: **128 passed**.
- `npm run lint:tests`: passed.
- `npm run test:ci -- --maxWorkers=2`: **100 suites, 1,935 tests passed**, coverage thresholds met.
- `.venv/bin/python scripts/test-dashcam-session-sql.py`: **11 passed**, temporary
  local PostgreSQL only, no production DSN.
- Black formatting applied to the four changed Python files; `git diff --check`: passed.

Initial oracle test collection lacked pyproj; installing the repository's pinned
geometry requirements resolved it. No assertion/security checks were weakened.
These results are local synthetic/software validation, not CI or road acceptance.
PR/CI/merge results are reported separately in the task handoff.
