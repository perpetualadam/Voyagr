# Phase 7 — deterministic GPS replay

Date: 2026-10-27. **PHASE7_PARTIALLY_VERIFIED — production NO-GO.** Latest main at start: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a`. Phase 6 PR #343 was open, CI green; Phase 7 branch `codex/phase7-directional-road-matching` includes its dependency commit `c5c67686541a7dcb30f3d82d5d24d1a2f2b27951`. Phase 7 changes are reviewed relative to that commit; inherited Phase 6 work is not newly implemented Kivy/native work. No Phase 7 Kivy/Android changes, VPS access, production configuration/data change, deployment or paid API call.

Versioned fixture: `tests/fixtures/phase7/directional-replay-v1.json`, schema 1, explicitly synthetic. Contexts are shared rather than duplicated per trace. The existing Phase 6 harness now invokes actual source matcher, route compatibility policy, canonical attribute bundles, hybrid lane logic, hazard association/voice, GPS admission, route progress/arrival, manoeuvre direction and existing reroute decision. It does not implement a test-only matcher. Reproduce with `node scripts/replay-phase7.cjs`; Jest asserts expected states, road identifiers, authority, legal limit, lane suppression, hazard applicability/voice, progress holds, reroute and selected arrivals. Python independently runs the same 20 source/fix contracts. All previous 16 Phase 6 scenarios remain passing.

| Scenario | Final match | Attribute authority | Result |
|---|---|---|---|
| parallel_motorway_carriageways | AMBIGUOUS | no | PASS |
| opposite_direction_traffic | PROBABLE | yes | PASS |
| parallel_urban_roads | AMBIGUOUS | no | PASS |
| slip_road_entry | PROBABLE | yes | PASS |
| slip_road_exit | PROBABLE | yes | PASS |
| multi_level_junction | AMBIGUOUS | no | PASS |
| bridges_and_tunnels | AMBIGUOUS | no | PASS |
| roundabout_entry | PROBABLE | yes | PASS |
| roundabout_exit | PROBABLE | yes | PASS |
| gps_drift_near_junctions | UNMATCHED | no | PASS |
| low_speed_heading_instability | PROBABLE | no | PASS |
| stationary_drift | PROBABLE | no | PASS |
| temporary_gps_loss | UNMATCHED | no | PASS |
| gps_reacquisition | PROBABLE | no | PASS |
| wrong_turn | PROBABLE | yes | PASS |
| route_rejoining | PROBABLE | no | PASS |
| closely_spaced_manoeuvres | PROBABLE | yes | PASS |
| intermediate_stop_arrival | PROBABLE | yes | PASS |
| final_destination_arrival | PROBABLE | yes | PASS |
| network_interruption | PROBABLE | yes | PASS |

Wrong turn uses a connected source branch, qualified direction and enough elapsed time for existing multi-fix/time reroute hysteresis. Known unrelated hazards are not announced. Slip entry/exit use connected source ways, not only renamed straight traces. Parallel roads and ambiguous levels pause progress without inventing a road. Signal failure clears authority; reacquisition needs fresh continuity. A corrected roundabout fixture allows enough elapsed time for its actual distance instead of weakening causal bounds. Final arrival and intermediate-stop non-completion remain asserted; closely spaced manoeuvres use actual step lookup.

Scope limits: these are small algorithmic witnesses, not complete reconstructions of 20 real UK journeys. Some failure modes share geometry by design. Bridge/tunnel cases establish uncertainty without elevation; they do not determine a physical level. Source-topology exit validation is separate from live provider graph acceptance. Browser sensors, audio timing, network/suspension, map rendering and devices remain mocked/unexecuted as appropriate.

Additional actual integration tests cover source fetch lifecycle, route and vehicle supersession, immediate GPS invalidation, request throttling, network-only service worker, and lane UI refusal under ambiguous common evidence. Existing security/routing/offline/voice regressions remain part of complete CI selections.
