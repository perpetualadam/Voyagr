# Phase 10 — Graphhopper Valhalla Parity

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## Preserved integration

PR349 collision-safe inline IDs and exact area-token rewriting remain unchanged. PR350 verified `/info` metadata, capability freshness/invalidation, absent toll withholding and per-route limitation records remain unchanged. Camera references, OSM hard-block areas and CAZ geometry are retained; avoidance is not disabled to get an HTTP200. Existing tests cover mixed models, multiple hazards, duplicate IDs, unsupported toll capabilities, provider errors and fallback.

GraphHopper geometry decoding/manoeuvre conversion and Valhalla geometry precision remain unchanged. Each returned alternative receives an assessment of its actual geometry; accepted custom models or Valhalla exclusion requests alone do not certify mandatory compliance. OSRM is independently assessed and is never advertised as a native avoidance engine. Unsupported mandatory requirements remain blocked even when a provider returns a route.

## Dataset provenance

The repository installed-area candidate has 128 distinct MultiPolygon features; previously recorded SHA256 is 65038dece07721214bc3245739aeb6cc8508acef3efe780e01c054d1753cae2f. Prior offline JTS checks reported 102 invalid geometries. These are prior parser/provenance findings, not a new installed-engine acceptance run. The production 128-feature file and application's 137-section log are not proven identical datasets. GRAPHHOPPER_CAMERA_AREAS_COUNT can influence a logged total independently of local IDs. Neither configuration nor file provenance was obtained from Contabo during Phase10.

Do not replace polygons, rebuild graphs or force counts to match. Operator must record installed file checksum, generation/source/version, profile and graph import provenance, then validate geometries locally before proposing a separate reviewed data correction. Parser acceptance alone does not verify returned geometry respects hard blocks on the installed graph.

## Unexecuted acceptance

Graph-backed geographic exclusion compliance, graph/schema version matching, the supplied real journey, installed128 versus application137 identity and physical-browser manoeuvre alignment require operator evidence. No installed GraphHopper/Valhalla/OSRM requests were executed for this change.
