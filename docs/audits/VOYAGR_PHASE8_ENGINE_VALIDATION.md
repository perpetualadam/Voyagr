# Phase 8 — routing-engine validation

Date: 2026-10-27. **PHASE8_PARTIALLY_VERIFIED — production NO-GO.** Integration baseline: latest main `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` plus existing Phase 6 `c5c67686` and Phase 7 `0701f4df`; these changes are not present on fetched main. PR refs #343/#344 still point to those commits; current PR state/rules cannot be read because GitHub API access returns HTTP 403. Phase 8 branch: `codex/phase8-evidence-and-pwa-acceptance`, based on `0701f4df`. No previous changes duplicated. No Contabo access, production configuration/database/graph/service mutation, deployment, paid API call, Kivy/native Android change or deployment automation change.

**REAL_ENGINE_EXECUTION_NOT_TESTED.** Isolated loopback discovery found no Valhalla 8002, GraphHopper 8989 or OSRM 5001 listener. The existing replay tool, explicitly approved for this isolated local check, returned all providers unavailable, no installed metadata, **0 routing requests**, **36 NOT_TESTED combinations**. Raw artifact: [VOYAGR_PHASE8_ENGINE_DISCOVERY.json](VOYAGR_PHASE8_ENGINE_DISCOVERY.json). No production/public routing service was contacted. Engine version/build, graph date/revision, profiles and encoded values remain UNKNOWN; no cross-provider accuracy/enforcement comparison is possible.

The Phase 5 manifest still covers normal routing, point/polygon/segment exclusions, cameras, railway crossings, tolls, alternatives, multi-stop, unsupported restrictions, no compliant route and failure/timeout across three engines. It is now v2, with reviewed per-provider oracle requirements. No actual provider fixtures were filled with invented data.

## Confirmed defects and improvements

A failing regression reproduced HTTP 400 invalid input being accepted as no-route evidence. Generic errors no longer establish infeasibility: explicit provider-specific no-route codes are required. The runner now validates every returned GraphHopper/OSRM alternative, complete Valhalla journey geometry and ordered required waypoints, rather than just the first option. Forbidden polygons remain segment-intersection checks, not vertex-only checks.

Network access is off by default. Explicit `--approved-local-services` only permits credential-free loopback origins and documented read-only metadata/route paths; arbitrary admin paths, redirect, DELETE/mutation methods, inherited proxy/netrc credentials and unbounded response/request bodies are refused. At most 36 engine/case combinations, sequential requests, 64 KiB fixture request /2 MiB response caps and connect/read timeouts. No hard total streaming deadline or installed-graph provisioning is claimed.

Review requires oracle SHA256, engine version, graph revision, profile and reviewed status. Unknown/mismatched installed versions or declared graph revision differences block routing execution. Missing graph revision from a metadata API is not evidence the loaded graph matches: retain independently acquired build/graph manifests and review them. Metadata export retains whitelisted version/profile/encoded-value fields, excluding unrelated/nested credentials. Valid geometry without an avoidance oracle remains ENFORCEMENT_UNVERIFIED; accepted options/HTTP 200 are never enforcement proof. Timeout/failure cases require an isolated fault proxy and reviewed expected outcome, never deliberate production disruption.

## Operator execution

1. Export/read existing version/profile/graph build manifests through approved access. Do not scan databases, rebuild graphs or restart services.
2. Prepare a separate **isolated** graph-backed service with the same pinned build/profile/graph snapshot; do not repoint the replay tool at a remote production URL.
3. Copy the existing manifest to a new review file. Fill provider requests and reviewed `oracle` fields (`reviewed`, 64-character `source_sha256`, `engine_version`, `graph_revision`, `profile`). Add source-backed `forbidden_polygons`, `required_waypoints`, `waypoint_tolerance_m`, `minimum_routes` or explicit no-route expectations as appropriate. Keep unsupported cases explicitly unresolved.
4. Run `.venv/bin/python scripts/replay-routing-engines.py --manifest /tmp/phase8-approved-replay.json --approved-local-services > /tmp/phase8-engine-results.json`.
5. Compare every geometry/alternative/leg against source restrictions, actual graph/profile provenance and equivalent provider coverage. Graph age, costing and profile differences are explanations to investigate, not automatically defects.

The unit tests mock provider boundaries to verify runner behavior. Their success is not real-engine execution. No graph-backed performance or accuracy result is claimed.
