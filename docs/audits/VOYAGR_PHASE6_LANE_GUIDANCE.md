# Phase 6 — lane guidance

Date: 2026-10-27. Baseline: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` (latest fetched main; Phase 5 PR #341 merged). Branch: `codex/phase6-uk-navigation-accuracy`. **PHASE6_PARTIALLY_VERIFIED; production NO-GO.** No deployment, production access/data/configuration change or paid provider call.

## Evidence contract

EXPLICIT requires a trusted matched directional road, compatible one-way direction, a 1–12 lane count matching `turn:lanes[:direction]`, and an understood manoeuvre. Shared through/turn lanes retain all allowed matches. Bus-only and access-denied lanes are excluded; incomplete/conflicting counts and conditional/change restrictions cannot grant permission. Destination signs are retained as evidence, not translated into permission. No heading-derived current lane is emitted.

PROVIDER means native active lane flags from a routing provider; it does not mean surveyed or legally verified. GraphHopper adapter preserves native active lanes before generating fallback arrays. Synthesized arrays are INFERRED and cannot be laundered into PROVIDER. UNKNOWN/INFERRED output has no actionable recommendation; ordinary turn guidance remains available. `valid_indications` without active flags does not establish a choice.

Live hybrid selection prefers active provider evidence, then actionable EXPLICIT API evidence. It no longer applies second-exit-left or generic rightmost-exit rules. Raw legacy estimation helpers remain for compatibility but are disconnected from live actionable hybrid guidance. Rendering requires fresh reliable GPS; route/request generation guards discard stale lane responses.

## Coverage and limits

Deterministic tests cover shared directional lanes, one-way mismatch, bus exclusion, missing/mismatched counts, conditional restrictions, multiple valid active choices, inferred-provider contamination, second-exit provider preservation and lookahead road type. Turn tokens alone cannot establish roundabout exit connectivity, merges, U-turns or generic exit side. OSRM/Valhalla/GraphHopper exit-count normalization retains valid provider integers and rejects malformed counts. OSRM forks keep left/right, on-ramps merge, unknown-side off-ramps remain generic exits. Geometry-only inference is labelled and cannot produce definitive junction wording.

Nearby Overpass selection currently cannot establish the driven way: `/api/lane-guidance` returns UNKNOWN without internal verified matching. This intentional reduction in guessed lane output is not completion of road matching. Independent topology validation for actual roundabouts/motorway junctions, provider field semantics, conditional lane access, temporary restrictions, HGV lanes and desktop display remains required. No lane-level accuracy claim.
