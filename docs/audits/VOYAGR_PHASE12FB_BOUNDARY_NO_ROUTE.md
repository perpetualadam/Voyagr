# Phase12F-B — Boundary and no-route results

**PHASE12FB_PARTIALLY_VERIFIED; production NO-GO.** Base: merged Phase12F PR357 `8a01e63d98a15f56395bae5fae506cad0fb9cdf2`. GraphHopper remains preferred first eligible Optimised; Valhalla alternatives and honest OSRM fallback remain gated. No server access, deployment, dataset replacement, graph rebuild or restart. Live lab/device acceptance is NOT_TESTED.

`scripts/fixtures/phase12fb/acceptance-plan.json` contains13 explicitly unreviewed operator case slots, all NOT_TESTED: origin inside, destination inside, origin boundary, route touch, near miss, one-way, divided carriageways, disconnected roads, all alternatives blocked, genuine no-path, validation failure, deadline exhaustion and inside-area recalculation. No road coordinates or edge oracles are invented.

Local geometry tests distinguish inside/boundary/outside and holes, retain the tiny boundary band during envelope filtering, compare100 random synthetic points against independent GEOS union, and validate malformed outside members before declaring OUTSIDE. Existing12F tests cover endpoint boundaries, sparse geometry/zero-length/native mismatches and deadlines. Existing12C full-segment intersection tests remain available; endpoint envelopes do not replace full route/edge checks.

No-path is only the recognized GraphHopper ConnectionNotFoundException on400/404 in the existing classifier. Generic400 model/schema failures,502/504, HTML, timeout and malformed geometry do not prove no compliant alternative. Zero-length restricted connections are invalid connectivity evidence. The five-case replay requires actual successful displaced-route captures; genuine no-path/validation/deadline captures belong in the separate reviewed matrix and cannot be substituted for those five.

Actual boundary touching, partial-edge inclusion, directed edge exclusion, legal turns, bridge/tunnel levels, snapping that hides no-path and all-alternatives-blocked behaviour remain NOT_TESTED here. Prior12D six-region clearance/12 equal comparisons are operator evidence only, not nationwide or edge-level acceptance.
