# Phase 9 — installed engine and graph replay

Date: 2026-10-27. **PHASE9_PARTIALLY_VERIFIED — production NO-GO.** Baseline main `1cd21ebf738867e9426451195cdf6799c2af769e`, Phase 8 PR #345 merged, main CI successful (run 40585697207). Dedicated branch `codex/phase9-real-evidence`. No production access, deployment, service restart, graph/database mutation, paid API calls, Android/Kivy work or deployment automation.

**REAL_ENGINE_EXECUTION_NOT_TESTED.** Actual local metadata discovery returned Valhalla, GraphHopper and OSRM unavailable. Installed version/build/profile/graph revision/date, encoded values, vehicle/costing/exclusion capabilities and alternative support are UNKNOWN. No routing requests executed; all 36 combinations NOT_TESTED. Evidence: [discovery JSON](VOYAGR_PHASE9_ENGINE_DISCOVERY.json). This reports Codex's isolated environment, not Contabo's installations.

The existing Phase 5 manifest (now v2) and Phase 8 runner were inspected and reused without inventing fixtures. Every one of the following remains NOT_TESTED for each of Valhalla, GraphHopper and OSRM:

| Existing case ID | Required distinguishing oracle |
|---|---|
| normal_route | Source-backed connected endpoints and expected legal geometry |
| exclusion_point | Baseline uses excluded area; constrained route avoids it |
| exclusion_polygon | Reviewed polygon, all segments/alternatives checked |
| excluded_road_segment | Stable source/graph identity and a distinguishing baseline |
| mandatory_camera | Source/direction/coverage and a mandatory avoidance baseline |
| railway_crossing | Reviewed crossing association and connected alternative |
| toll_road | Actual graph toll tags/profile semantics and baseline |
| alternatives | Required distinct valid alternatives, all checked |
| multiple_waypoints | Full ordered stops and every leg |
| unsupported_restriction | Explicit unsupported outcome, never silent compliance |
| no_compliant_route | Source-backed infeasibility and provider-specific code |
| timeout_or_failure | Isolated fault injection with expected safe result |

For every unexecuted case: request ID, installed version/profile/graph, actual geometry and avoidance result are N/A/UNKNOWN; source evidence is unavailable. Do not fill these with mock output.

## Reproducible operator handoff

1. Through existing approved access, have the infrastructure owner identify actual engine processes/containers and read only their existing version/profile/build manifests. Do not dump environments, full inspect output or credentials. Record build ID, graph date/revision/source SHA256, profiles, encoded values, costing/exclusion semantics, vehicle restrictions and alternatives. Documentation/configuration is not installed evidence. No production requests authorised here.
2. Use an already approved **isolated** engine/graph copy, pinned to those declarations. Do not rebuild or restart production. If no isolated copy exists, stop and request that capability separately; this phase does not provision one.
3. Copy `scripts/fixtures/routing-engine-replay.json` into a new review directory. Keep all 12 IDs and three providers. Supply reviewed per-provider requests and oracle fields `reviewed`, `source_sha256`, `engine_version`, `graph_revision`, `profile`, plus expected result, source-linked exclusion geometry/IDs, ordered required waypoints and minimum routes. Derive coordinates/polygons from the acquired source. Record an unconstrained control route that distinguishes actual avoidance enforcement from accidental non-intersection.
4. Independently compare **all** installed graph/profile declarations with the oracle before running. The runner blocks version mismatch and declared graph-revision mismatch, but unknown graph metadata is not verified by the runner; OSRM's route endpoint supplies no build identity. Missing graph/profile evidence means NOT_TESTED/blocked acceptance, even if HTTP/geometry checks pass. Supported-provider metadata is filtered, not a capability certification. Unsupported/failure expectations still require manual reviewed assessment; the runner is not a complete expected-outcome oracle.
5. Run from the separate reviewed tools snapshot, with `APPROVED_REPLAY_MANIFEST` and `PHASE9_REVIEW_DIR` supplied by the operator:

```bash
"$REVIEW_PYTHON" scripts/replay-routing-engines.py   --manifest "$APPROVED_REPLAY_MANIFEST" --approved-local-services   > "$PHASE9_REVIEW_DIR/engine-results.json"
sha256sum "$APPROVED_REPLAY_MANIFEST" "$PHASE9_REVIEW_DIR/engine-results.json"
```

The runner permits loopback only, documented read-only route/metadata paths, no credentials/redirects, sequential ≤36 combinations, request ≤64 KiB and response ≤2 MiB, connect/read 2/10 s. Metadata discovery includes a sample OSRM route GET; run only against isolated approved services. Record a unique request ID, exact request digest, engine/build/profile/graph, expected/actual result, all geometry checks, avoidance assessment, status, source digest and latency for each execution. Save sanitized output with checksums alongside the independent installation manifests. Do not record secrets or personal journeys. Any inferred enforcement claim requires the distinguishing oracle, not HTTP 200, option acceptance, or a non-intersecting route alone.

**Needed:** operator-supplied sanitized installation manifests plus reviewed source fixtures and an approved isolated graph service. No versions or profiles can currently be reported as installed on Contabo.
