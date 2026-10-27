# Phase 6 — GPS replay and recovery

Date: 2026-10-27. Baseline: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` (latest fetched main; Phase 5 PR #341 merged). Branch: `codex/phase6-uk-navigation-accuracy`. **PHASE6_PARTIALLY_VERIFIED; production NO-GO.** No deployment, production access/data/configuration change or paid provider call.

## Method and matching policy

`tests/fixtures/phase6-gps-replay.json` contains synthetic UK-style traces with no personal histories. `scripts/lib/navigation-replay.cjs` calls actual product GPS admission, matching, progress/arrival, direction and reroute-decision modules. Jest asserts expected states, progress holds, wrong-turn reroute, selected manoeuvres and final arrival; it also invokes the actual GPS-watch orchestration with ambiguous evidence and asserts no progress mutation. This is deterministic software replay, not sensor/road ground truth.

Fixes must be finite, ordered, ≤15 s old (≤1 s future), with accuracy ≤35 m. Heading is used only with speed ≥3 m/s, accuracy ≤15 m and suitable optional heading accuracy. Competing disconnected nearby route-segment groups produce UNKNOWN rather than selecting the nearest branch. Adjacent dense vertices remain a single continuous candidate. Causal progress bounds reject jumps; low-speed drift holds progress. Initial/resumed/gap fixes reacquire before reliable progress. Reliable anchors are separate from current UNKNOWN evidence. Signal loss/error does not invent coordinates or advance freshness. OFF_ROUTE feeds the existing multi-fix/time hysteresis rather than immediately rerouting; no online request is made by the offline harness.

Arrival requires fresh reliable matching and passed intermediate-stop boundaries, with 8–35 m accuracy-dependent immediate radius. Progress seeding uses the current segment rather than five future vertices. These thresholds are policy choices awaiting device calibration.

| Scenario | Result |
|---|---|
| normal_urban | PASS (synthetic) |
| motorway | PASS (synthetic) |
| parallel_carriageways | PASS (synthetic) |
| roundabout | PASS (synthetic) |
| motorway_exit | PASS (synthetic) |
| closely_spaced_junctions | PASS (synthetic) |
| multi_level_interchange | PASS (synthetic) |
| gps_drift | PASS (synthetic) |
| tunnel_loss | PASS (synthetic) |
| stationary | PASS (synthetic) |
| wrong_turn | PASS (synthetic) |
| rejoining | PASS (synthetic) |
| multi_stop_arrival | PASS (synthetic) |
| final_arrival | PASS (synthetic) |
| suspension_resume | PASS (synthetic) |
| network_loss | PASS (synthetic) |

Parallel carriageways and overlapping multi-level candidates intentionally return UNKNOWN. Tunnel/suspension cases require reacquisition. Wrong-turn frames include enough time for existing reroute hysteresis; no threshold was weakened to make replay pass. Network loss retains local guidance evidence but cannot refresh avoidance. The near-final pending-stop regression is separate from the multi-stop replay and explicitly prohibits premature completion.

## Voice/offline limitations

Contradictory roundabout speech is rebuilt from the same canonical count as the visual instruction. Geometry-only inferred instructions are suppressed. Uncertain GPS clears pending speech and lane guidance; new reroutes reset speech retry and cancel queued speech. Native audio interruption and device speech APIs are not measured.

Persistence flattens the selected alternative, retains geometry/ranges/stops/provenance and progress hints, rejects malformed/mismatched geometry and invalid/future save times, and invalidates old SATISFIED avoidance checks. Resume warns and waits for fresh GPS. Progress hints are not fresh observations or proof a stop was visited. Cached maps/audio may be incomplete. Actual IndexedDB eviction, killed browser, locked screen, device battery suspension and real network transitions remain unverified.

A route-polyline matcher has no independent full-road-network/elevation observation: an unrepresented parallel road can still look plausible. These scenarios establish conservative ambiguity handling where competing geometry exists, not general map matching or lane identity.
