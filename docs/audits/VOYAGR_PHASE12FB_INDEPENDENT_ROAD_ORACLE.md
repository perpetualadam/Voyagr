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
roads and vehicle/motor_vehicle/motorcar overrides are supported in that precedence. Unspecified link direction, reversible
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
  from CI's **Run Python behaviour tests** step: **1,271 passed, 68 subtests passed**.
  This includes all **75** new synthetic oracle tests. It excludes the documented
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

## Addendum: explaining connectivity uncertainty

The additive `uncertainty_diagnostics` object (schema 1) explains a result without
changing traversal, candidate validation, eligibility or provenance acceptance.
`access()` and `transition()` still make all decisions; diagnostic labels never
feed into either. Existing result fields and safety flags retain their meanings.

Fixed category counters identify:

| Category | Meaning and limits |
| --- | --- |
| `uncertain_access` | The existing access evaluator reports uncertainty; includes ambiguous/default access and may overlap conditional, physical and barrier labels. Node labels respect the existing directional/access uncertainty guard. This is not a vehicle-specific legal ruling. |
| `barrier` | A barrier tag on a traversed directed road segment or departure node. No barrier subtype or opening permission is inferred. |
| `direction` | The existing direction classifier is uncertain: unknown/reversible values, conditional direction or unspecified link direction. |
| `conditional_rules` | A tag contains `conditional`; conditions are not evaluated. Conditional restriction relations are separately counted at export scope. |
| `physical_rules` | Dimensional/vehicle tags or construction/proposed evidence recognised conservatively by existing access logic; actual vehicle suitability is not evaluated. |
| `ambiguous_turn` | A supported same-way restriction other than a supported U-turn has ambiguous interpretation at the examined transition. |
| `restriction_complexity` | More than 64 applicable supported turn rules at a transition: existing semantics treat traversal as uncertain. |

Export counters count directed original segments and nodes (node reasons union
both directions), not unique real-world roads. Unresolved relation counts include
missing member/role/incidence evidence, exceptions and conditionals; these counts
can overlap. They do not establish completeness of the source or identify a
specific exception's applicability. Unsupported relation forms remain unresolved.
No OSM IDs, tag contents or geometry are exposed.

Both searches report states discovered, edge examinations, uncertain allowed
transitions, global restriction-guard transition counts, per-category counts and
`limit`: `NONE`, `STATES`, or `EDGE_EXAMINATIONS`. Counts describe examined allowed
transitions, including revisits and transitions rejected by the known-only filter;
they are not necessarily on a successful path. The terminating examination can
make the examination counter equal `8*max_states+1`. State storage remains bounded
by the existing `max_states` cap. No search ordering, bounds or return values change.

The potential search retains one predecessor per discovered state and reconstructs
its first successful BFS path internally. This requires O(max_states) additional
storage, with at most max_states-1 path transitions; no path list is serialized.
The representative path report contains availability, transition count and aggregate
reason counts. It is not a shortest metric route, a least-uncertain route, a legal
route or the operator's candidate. It may be uncertain even when a different known
path exists. Repeated path transitions count repeatedly. An identical origin/target
has an available zero-transition path, without invented traversal uncertainty.
If no potential path is found or search is exhausted, path/off-path counts are null,
not zero. A search limit is not a no-path conclusion.

`outside_representative_path` counts reasons on original directed segment keys not
used by that path, and nodes not used as departure nodes. A destination-only barrier
is therefore not claimed as a traversed barrier. Segments split by virtual endpoints
retain their original key. These counts distinguish untraversed evidence from
encountered evidence; they do not prove evidence is irrelevant to legal connectivity.

Unresolved restrictions remain a **global guard**, even when their recorded via node
is outside the representative path. The report separately counts unresolved
relations whose available via node is on/off the path and relations whose via-node
locality is unknown. Via-way relations and missing via nodes have unknown locality.
Incomplete relations may have a locatable via node while their full extent remains
unknown. `locality_is_relevance_proof:false` prohibits interpreting off-path location
as a waiver. No attempt is made to resolve vehicle exceptions, missing members,
via-way effects or conditional expressions. These limitations preserve UNVERIFIED.

For the operator-reported fixture 0, the existing global unresolved flag is enough
to prevent known non-empty traversal regardless of whether the five reported
relations lie on a representative path. The new report can distinguish that guard
from access/barrier/direction evidence on the selected potential path. It cannot
establish which actual fixture 0 categories apply without the private export and
specification. The reported 0.419 m / 0.055 m projection distances are geometric
fit observations, not legal connectivity or permission to relocate an origin.
No private evidence, VPS or routing/OSM requests were used for this addendum.

Changed files for this focused follow-up: `voyagr/utils/road_oracle.py`,
`tests/test_independent_road_oracle.py`, and this technical audit. No production
routing files, configuration, acceptance validators or original captures changed.
Every report remains `reviewed:false`, `navigation_authorized:false`,
`acceptance:UNVERIFIED`, and **PRODUCTION_NO_GO**. No accepted oracle hash is generated.

Follow-up validation (2026-10-28): configured CI backend file selection via
`.venv/bin/python -m pytest -q`: **1,293 passed, 68 subtests passed**. Oracle suite:
**97 passed**, including 22 new reporting/locality/privacy/limit/eligibility cases.
A separate 162-case differential check loaded the baseline f2aa2711 implementation
and confirmed every pre-existing report field remained identical across access,
direction, restriction, candidate and state-bound variations. `npm run lint:tests`
and `npm run test:ci -- --maxWorkers=2` passed (100 suites, 1,935 tests, coverage
thresholds met). `.venv/bin/python scripts/test-dashcam-session-sql.py`: 11 passed
on temporary local PostgreSQL. Black formatting and `git diff --check` passed.
Desktop/custom-router/live-service suites were not run. No real-road result is
claimed; hosted PR/main CI results are reported in the task handoff.

## Addendum: private evidence inspector

Operational status remains **PRODUCTION_NO_GO**. `inspect-phase12fb-road-oracle-private.py`
is a separate local operator-only CLI, not a public diagnostic flag. It accepts a
local bounded OSM export, unreviewed exact-endpoint specification and explicit NEW
absolute output filename outside Git. It does not accept captures, HTTP responses,
credentials, receipt approvals or accepted oracle references. Provisional topology
inspection is intentionally separate from formal provenance acceptance.

`RoadOracle.analyse()` delegates to `_analyse_with_path()` and returns only the
unchanged public report. The shared internal method returns that report and the
same representative path already reconstructed by PR #361. No second routing
algorithm, extra search, altered edge order, traversal predicate, bound, candidate
rule or navigation decision was added. Private path data is never stored on the
oracle for later public serialization. A private set of supported relation IDs is
recorded at the existing parser decision, so evidence reporting cannot accidentally
classify an unsupported relation as supported merely because another relation has
the same from/via/to tuple.

Private `PATH_TRANSITION` records describe all representative transitions, including
known-permitted transitions. They include OSM way/segment/direction, ordered segment
node IDs, real node references (virtual vertices use a fixed marker), incoming edge,
source object hashes, routing tags and reasons. Source roles distinguish EDGE,
DEPARTURE_NODE, TURN_TRANSITION and GLOBAL_UNRESOLVED_RESTRICTION_GUARD. Supported
applicable turn tuples link to separate original relation records. Direction -1 is
preserved in node-order terms; implicit motorway direction and uncertain slip-road
direction continue to come from the existing parser. No straight-line connector,
projected coordinate/fraction or road geometry is emitted.

Reason categories retain the public meanings. Each local reason has status
AMBIGUOUS (access, barrier, direction, ambiguous same-way turn) or UNSUPPORTED
(conditional evaluation, physical applicability, excessive rule complexity).
Uncertain transitions are UNRESOLVED; a supported export-only transition is not an
independently approved legal route. Overlapping access/physical/barrier reasons are
not mutually exclusive. Turn records use SUPPORTED_RULE or UNRESOLVED and identify
missing role/member/incidence evidence, exceptions, conditions or other unsupported
forms. Member references are retained even when their source object is missing.
No condition/exception is silently evaluated.

All restriction relations are described with available member references, routing
tags and via-node locality. On-path supported applicability is reported separately
from AT_PATH_NODE, OUTSIDE_PATH_NODES and UNKNOWN locality. Global unresolved
relations retain `global_guard:true` and `locality_is_relevance_proof:false` even
outside the path. Other uncertain directed edges and non-departure node evidence
are separately labelled. When no representative path exists, endpoint segments
are still identified and access-only results are explicitly not direction/turn
permission. A bounded search failure does not certify closed-component no-path.

Private tags are allowlisted to routing roots and known key qualifiers. Names,
addresses, free-form notes, source/user metadata, arbitrary element fields and raw
request/response objects are not serialized. Common original OSM values and safe
conditional text are retained verbatim, without evaluation. Unknown/free-form,
credential-like, coordinate-like, control/non-ASCII or overly long values are
withheld with a value hash. Original object and complete-tag hashes let an authorised
reviewer inspect the unchanged source. Redaction is conservative, not a semantic
parser, secret scanner certification or an assertion that omitted metadata is safe.
The source export and entire private report remain restricted evidence.

Bounds: existing 32 MiB input limits and graph/search limits; at most 5,000 evidence
records, 8 MiB compact evidence, 64 members per relation, 64 supported turn tuples
per transition, and 16 MiB encoded report. Omitted records/members/rules are explicit;
an oversized final report is refused. Path records have priority, followed by global
unresolved relations, other supported relations, off-path edge and node evidence.
Truncation never affects public counters or routing. No path/geometry is printed to
stdout. Incidental package output and exception/argument text are suppressed by the
CLI; only fixed success/refusal messages appear. The public CLI does not import the
private inspector.

Output is exclusively created outside the current repository and other detected
Git checkouts/worktrees/bare repositories. Existing symlinks/files and symlinked
paths into repositories are refused. Empty platform `.git` placeholder directories
without repository state are not treated as actual repositories. POSIX files use
0600 plus exclusive/no-follow creation. Windows inherits directory ACLs: the operator
must first secure the local evidence folder. This protects normal local operation,
not hostile concurrent replacement of ancestor directories or privileged OS users.
A partial write may leave a restricted incomplete file which will not be overwritten.
No original input is written. No upload functionality is present.

The private fixture, captures and 58-transition operator report were unavailable
here and were not tested. Nothing in this work waives the global guard, the recorded
46.31 m displacement or the two-metre origin-integrity rule. No VPS, deployment,
Docker change or live routing/OSM request occurred. The exact Windows command is in
[operator instructions](VOYAGR_PHASE12FB_CONTABO_OPERATOR.md).

Changed-file inventory for this follow-up:

- `voyagr/utils/road_oracle.py`: expose the existing reconstruction internally; track supported relation IDs without changing public outputs.
- `voyagr/utils/road_oracle_private.py`: private evidence descriptions, conservative tag handling and exclusive output protection.
- `scripts/inspect-phase12fb-road-oracle-private.py`: separate offline CLI with fixed console messages.
- `tests/test_private_road_oracle.py`: deterministic synthetic inspection, security, eligibility and baseline public-report regressions.
- `.github/workflows/ci.yml`: add the new suite to the configured backend selection.
- `docs/audits/VOYAGR_PHASE12FB_INDEPENDENT_ROAD_ORACLE.md`: technical audit and compatibility limits.
- `docs/audits/VOYAGR_PHASE12FB_CONTABO_OPERATOR.md`: exact PowerShell procedure and private handling requirements.

Private-inspector validation (2026-10-29, local Linux cloud checkout): configured
backend file list via `.venv/bin/python -m pytest -q`: **1,336 passed, 68 subtests
passed**. Focused oracle/inspector selection: **140 passed** (43 new inspector cases).
Five committed synthetic golden public-report hashes were generated from baseline
36f170f3; a separate 162-case differential comparison confirmed complete public
report equality, including the uncertainty summary. Flask-level regression preserves
Valhalla selection when the GraphHopper origin is displaced. `npm run lint:tests`
and `npm run test:ci -- --maxWorkers=2`: passed, 100 suites / 1,935 tests with coverage.
`.venv/bin/python scripts/test-dashcam-session-sql.py`: 11 passed on isolated temporary
PostgreSQL. Black formatting and `git diff --check`: passed. Initial private-output
tests found empty platform Git-marker placeholders and incidental import output;
repository detection and CLI-only output suppression were corrected without
weakening actual Git-path exclusion. Desktop/custom-router/live-service suites,
actual Windows execution/ACL enforcement and private fixture 0 were not tested.
Hosted PR/main CI outcomes are reported separately in the task handoff.

## Addendum: alternative motorcar connectivity investigation

The operator-reported PR #362 path includes footway/pedestrian infrastructure,
a kerb and `maxheight=default`. These findings were not reproduced here. The ordinary
oracle intentionally retains uncertain access as possible traversal and returns
its first bounded potential BFS path, not a passenger-car route or a least-uncertain
alternative. Its first result therefore cannot answer the motorcar plausibility
question. That is a scope distinction, not permission to weaken the oracle.

`motorcar_investigation.py` introduces a private diagnostic view of the existing
parsed graph. The original `RoadOracle` source is unchanged. The view filters
existing directed edges in their original order, and calls the original transition
predicate before additional diagnostic exclusions. It invokes the exact same
`_analyse_with_path()` endpoint splitting, state search, turn handling and bounds.
No separate search algorithm, connector, downstream start or candidate validation
is implemented. The original graph instance, global guard and public reports are
not modified. Candidate input is explicitly not reclassified by this diagnostic.

The single policy is `PROVISIONAL_MOTORCAR_PLAUSIBILITY_V1`, not strict legally
known-permitted traversal. Its ordinary-road defaults are limited to motorway,
trunk, primary, secondary, tertiary, unclassified, residential, living_street,
service and their existing motorway/trunk/primary/secondary/tertiary link classes.
Missing access on every other class is not permission. Footway, pedestrian, steps,
path, cycleway, bridleway, track and generic road require directional/unconditional
motorcar yes/designated/permissive. Other unsupported/construction classes are
excluded. Effective access follows the original modal/directional precedence.
Unknown/restricted permissions, conditional access/oneway evidence, unsupported
access qualifiers, ambiguous direction and barriers are removed from this view.
Supported turn prohibitions still run first; ambiguous same-way/excessive-rule
transitions are additionally excluded. Conservative exclusion may miss a valid
real-world route: it never proves disconnection.

Barrier presence is not opening/clearance evidence, even with motorcar=yes.
Kerbs are never automatically traversable. Checks retain the original departure-node
and endpoint-junction semantics: arriving at a junction does not invent an outgoing
turn or a crossing beyond the endpoint. Known restrictions are not relaxed.
Vehicle exception/conditional/via-way/incomplete relations remain unresolved and
continue to impose the global guard in both the ordinary and filtered searches.
No off-path locality waiver is introduced.

Dimensional/physical rules are deliberately retained as explicit unsupported
conditions in a provisional path: neither `maxheight=default` nor a numeric value
certifies clearance for an unspecified vehicle. Explicit motorcar access on normally
non-motorcar infrastructure likewise leaves physical suitability unverified. The
summary reports aggregate path uncertainties and booleans for access-evaluator,
barrier, physical/dimensional, conditional, turn/global-restriction and infrastructure
suitability limitations. Access-evaluator uncertainty can overlap physical tags;
it does not mean an otherwise excluded unknown permission was admitted.

Potential-search results map to the four documented classifications. A found
non-empty path is POTENTIAL_MOTORCAR_PATH_IN_EXPORT, never legal verification.
Potential-search exhaustion is SEARCH_INCOMPLETE with the original state/examination
limit reason and counters. A missing-node coverage gap plus unsuccessful search
is EVIDENCE_INSUFFICIENT. Invalid/conflicting evidence and zero-transition results
are also insufficient. Other unsuccessful bounded results are
NO_MOTORCAR_PATH_FOUND_IN_EXPORT. Every result has real_world_disconnection_proven:false.
Closed-component evidence remains UNVERIFIED regardless of coverage_gap:false.

Public JSON has fixed labels, aggregate counts, uncertainties and safety flags only;
no source IDs, tags, hashes, coordinates or geometry. Excluded-edge counts refer to
edges already present in the original potential graph; base access prohibitions
may already have removed other edges. Excluded examined-transition counts include
both known-only and potential searches and revisits, so are not unique edge counts.
The `search` object and result classification describe the potential search. The
original known-only pass still occurs as part of the shared implementation; no
independently known/legal result is claimed by this policy.

Optional private evidence uses the existing bounded renderer, refactored into a
shared description helper without performing another search. It retains PR #362's
allowlisting/redaction, record/member/byte limits, exclusive creation outside Git,
POSIX 0600 and Windows folder-ACL requirements. Filtered-search details are labelled
policy_search_report instead of public_diagnostic. Omitted private records are
explicit and never change summary counters or routing. No reviewed provenance is
required for provisional investigation, and no accepted oracle_sha256 is generated.
The existing public and private CLIs and formal replay/transport contracts remain
unchanged. The new standalone CLI provides sanitized JSON by default and private
IDs/tags only with an explicit `--private-output` local destination.

Fixture 0, Windows execution and its private evidence remain unavailable/unexecuted.
No VPS access, routing/OSM request, deployment, Docker change, capture modification
or automatic review approval occurred. Passenger-car legality, clearance, exceptions,
conditional expressions and complete source coverage still require independent
review. Even a positive result cannot authorize the reported 46.31 m relocation;
GraphHopper-first eligible ranking, mandatory camera avoidance, Valhalla alternatives
and the two-metre gate remain unchanged. **PRODUCTION_NO_GO**.

Changed-file inventory for this focused investigation:

- `voyagr/utils/motorcar_investigation.py`: isolated stricter diagnostic view and aggregate classifications.
- `voyagr/utils/road_oracle_private.py`: share existing evidence rendering without duplicating search.
- `scripts/investigate-phase12fb-motorcar.py`: local public-summary/optional-private-report CLI.
- `tests/test_motorcar_investigation.py`: synthetic alternatives, policy, safety, limits and output regressions.
- `.github/workflows/ci.yml`: include the new regression file in the backend selection.
- `docs/audits/VOYAGR_PHASE12FB_INDEPENDENT_ROAD_ORACLE.md`: implementation assessment and limitations.
- `docs/audits/VOYAGR_PHASE12FB_CONTABO_OPERATOR.md`: exact PowerShell procedure and result interpretation.

Motorcar-investigation validation (2026-10-29, local Linux checkout): configured CI
backend file list using `.venv/bin/python -m pytest -q`: **1,389 passed, 68 subtests
passed**. Focused investigation/oracle/private-inspector selection: **193 passed**,
including 53 new motorcar-policy cases. A separate 162-case comparison against
baseline a7f83806 confirmed complete authoritative public-report equality after
running investigations. The original road_oracle.py, replay/acceptance validators
and production routing tree have no diff from baseline. Existing committed public
snapshot regressions also pass. `npm run lint:tests` and
`npm run test:ci -- --maxWorkers=2`: 100 suites / 1,935 tests, coverage thresholds
met. Isolated `scripts/test-dashcam-session-sql.py`: 11 passed on temporary local
PostgreSQL, never a production DSN. Black per-file formatting and `git diff --check`
passed. Desktop/custom-router/live-service tests, actual Windows execution and
private fixture 0 were not run. Hosted PR/main CI outcomes are reported separately.

## Addendum: independent-review evidence package

The new `prepare-phase12fb-review-package.py` prepares metadata for independent
review from existing local evidence. It does not inspect a server, fetch evidence,
run a route, approve a receipt, populate oracle_sha256 or change a source reviewed
flag. The actual Windows/private evidence named by the operator was unavailable
here. Reported 94-transition motorcar findings, matching export/spec fingerprints,
780 report records and the five unresolved relations remain operator assertions
until an authorised reviewer examines the originals and their provenance.

The deterministic package consists of the five documented JSON/Markdown files.
Files are inventoried by safe relative name, byte size and independently recomputed
SHA-256. No source bodies, parsed coordinates, geometry, credentials, HTTP target
strings or raw source metadata values are copied. Capture wire bytes are decoded
only in memory for hash/object comparisons. No ZIP/raw-inclusion option exists.
Runtime has no network client, upload or Git subprocess. Console output is fixed
success/refusal text with no paths or exception strings. Source/identity hashes
bind supplied evidence, never approval or authenticity.

A separate IO layer enforces local no-follow/no-atime inventory, portable relative
references, bounded traversal and new output creation outside Git and outside the
input hierarchy. Linux O_NOATIME directory/file handles prevent the scanner's reads
from updating access times; file/directory metadata snapshots detect changes during
reads. No chmod, utime or timestamp restoration is performed on source evidence.
Windows uses per-handle all-ones SetFileTime access-time suppression and enumerates
directories using GetFileInformationByHandleEx on that same handle. Windows requires
FILE_WRITE_ATTRIBUTES for this suppression even though no stored timestamp/data/ACL
is changed. Failure to obtain that guarantee refuses the run. Actual Windows
execution is unverified. Output mode is 0700/0600 where POSIX supports it; Windows
inherits folder ACLs and requires a pre-secured private parent. No OS-level immutable
snapshot, hardware write blocker or protection against privileged/concurrent source
replacement is claimed. Known remote/unknown storage types, links/reparse points,
hardlinks, cross-device subtrees and special files are refused. Unknown filesystem
drivers and unsupported platforms fail closed.

Inventory categorisation uses documented Phase12FB names and supporting filename
patterns, with an optional explicit local index for additional evidence roles.
Unidentified is distinguished from absence of actual evidence. Index references
are resolved only against the already inventoried paths/digests, not by opening
arbitrary paths. Traversal, absolute/Windows/UNC/URL references and unsafe names are
rejected as references. Unknown receipt schemas and historical references remain
for review. All regular-file names/hashes stay in the private manifest; document
reference values and arbitrary JSON key names are not copied into findings.

Checks distinguish BYTES_RECOMPUTED, strict/schema observations, MATCH/MISMATCH,
missing/unavailable evidence, conflicting/duplicate artifacts, unreviewed declarations
and independent review required. There is no PASS label. MATCH is only the particular
byte/object equality, not authenticity. Ordinary report SHA bindings and request/
response canonical/wire hash conventions reuse existing documented contracts.
The OSM export is checked with the existing parser and endpoint segment identity
with the existing projection helper; no connectivity result is inferred. Supported
receipt request/response hashes plus fixture IDs allow a numeric equality check
between the exact specification and captured/native endpoints, without emitting
the coordinates or implying independent approval. Query-only POST stays subject to
installed-effect review; the packager never toggles reviewed flags to call formal
acceptance validators. Unsupported import/graph digest conventions are not guessed.

The checklist separates file availability, recomputed fingerprints/matching bindings,
operator declarations not authenticated, unresolved/missing observations and the
independent review still required. It covers capture/hop/transport, engine/build/
profile/config, graph-cache/import/source/date/extraction/camera dataset relationships,
exact origins/segments, restrictions/exceptions/conditionals/barriers, diagnostic
scope, displacement, five-case replay and application/device acceptance. Unreviewed
receipts may support review only after their underlying artifacts and chronology
are examined; consistency does not make their claims true. Missing replay/application/
device evidence is not substituted by a provenance receipt. Every output stays
reviewed:false, navigation_authorized:false, acceptance:UNVERIFIED and
**PRODUCTION_NO_GO**. No mechanism promotes the package into an approved oracle.

Limits and refusal behaviour are documented in the operator procedure. Unreadable
or concurrently changed evidence, unsafe filesystem objects and hard traversal/check
bounds refuse creation; byte/JSON budgets produce explicit unavailable observations
rather than fabricated hashes. Partial output writes can leave an incomplete private
directory which will not be overwritten. The package deliberately omits timestamps,
absolute input/output paths and generated time so repeated unchanged input inventories
produce byte-identical output regardless of the new destination name. Deterministic
output is not a signature, chain-of-custody certification or evidence completeness.

Changed-file inventory:

- `voyagr/utils/review_package_io.py`: local no-atime/no-follow inventory and exclusive private output directory/files.
- `voyagr/utils/review_package.py`: strict structures, file/object/wire binding checks, evidence roles, findings and reviewer checklist.
- `scripts/prepare-phase12fb-review-package.py`: offline metadata-only CLI with fixed console messages.
- `tests/test_review_package.py`: synthetic forensic IO, schema/binding, privacy, determinism and acceptance regressions.
- `.github/workflows/ci.yml`: include package tests in configured backend validation.
- `docs/audits/VOYAGR_PHASE12FB_CONTABO_OPERATOR.md`: exact PowerShell command, role/index semantics, security/Windows limitations.
- `docs/audits/VOYAGR_PHASE12FB_INDEPENDENT_ROAD_ORACLE.md`: implementation/forensic assessment and validation.

All authoritative road/motorcar searches, candidate/replay/transport validators,
production routing eligibility and the two-metre integrity gate are unchanged.
No VPS access, deployment, Docker change, live routing/OSM request or private capture
modification occurred. Private artifacts and actual Windows execution were not tested.

Evidence-package validation (2026-10-29, local Linux checkout): configured backend
selection via `.venv/bin/python -m pytest -q`: **1,439 passed, 68 subtests passed**,
including **50** new synthetic package cases. Tests verify byte-identical repeat
packages, unchanged source file/directory access/modification/change times and
permissions, fixed console output, missing/corrupt/duplicate/nonfinite JSON, byte/
wire/endpoint mismatches, rejected references/links/special files, collisions,
unsupported storage and unavailable budgets. Windows path/reference and directory
record parsing are unit-tested; actual Windows APIs, ACLs and private artifacts
remain unexecuted. Existing public oracle golden snapshots and provenance/navigation
regressions pass. No original road/private/motorcar oracle, replay/transport validator
or routing-service file differs from baseline 9ebd9085. `npm run lint:tests` and
`npm run test:ci -- --maxWorkers=2`: 100 suites / 1,935 tests with coverage passed.
Isolated session SQL policy: 11 passed using temporary local PostgreSQL only.
Black per-file formatting and `git diff --check` passed. Desktop/custom-router/live
service suites were not run. Hosted PR/main CI outcomes are reported separately.

Final malformed-export regression also enforces a runtime-independent JSON nesting cap of 64 and avoids reparsing JSON already rejected by the strict decoder. Deep/unsupported JSON is recorded as invalid evidence rather than reaching the OSM parser. No assertion or acceptance protection was weakened.
