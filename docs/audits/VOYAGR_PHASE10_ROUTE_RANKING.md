# Phase 10 — Route Ranking

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## GraphHopper-first product policy

A valid, complete GraphHopper Optimised route that is automatically eligible under existing mandatory gates is displayed first. In preference mode, higher nearby-marker counts do not demote it. Display position does not certify compliance, safety, shortest distance or fastest travel. Valhalla Fastest, Quiet, Scenic and genuinely distinct alternatives remain available for manual eligible selection. Exact same-geometry eligible alternatives may be deduplicated after independent assessment.

The old primary retention was intentional product behavior, but pre-assessment same-road deletion and later sorting were inconsistent with it. Final ordering now happens after geometry, visit-order and mandatory assessment: valid geometry first, mandatory automatic eligibility next, then GraphHopper provider preference, preserving stable order of other alternatives. Invalid/unverified mandatory GraphHopper routes cannot displace eligible independently assessed fallbacks. No avoidance option is removed to manufacture eligibility.

Existing max_detour preferences, hazard/time/distance/fuel scoring and alternative-generation limits are unchanged. No new detour cap or global-optimum claim is added. Selected navigation remains protected by the existing acceptance and geometry-binding checks.

## Explainability

`route_comparison` contains engine, position, time, distance, camera evidence, status, limitations, geometry binding, automatic eligibility and a fixed ranking reason. Cards identify engine, Nearby observations, assessment status and possible/applicable evidence; unsupported preference limitations remain attached to their own alternative. Selection and normalization carry these fields rather than borrowing primary evidence.

## Evidence and unresolved questions

Regressions cover GraphHopper20 versus Valhalla10 preference ranking, compliant mandatory GraphHopper preference, ineligible mandatory GraphHopper rejection, malformed geometry and same-road retention. Existing alternative/manual-selection and multi-stop suites pass. These fixtures do not prove which real production route is better; assess the supplied discrepancy with private source/geometry evidence before changing avoidance semantics.
