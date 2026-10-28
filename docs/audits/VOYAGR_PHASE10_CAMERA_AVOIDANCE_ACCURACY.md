# Phase 10 — Camera Avoidance Accuracy

Status: PHASE10_PARTIALLY_VERIFIED. Production remains NO-GO.

Baseline: main `7a4591fa8234e993fcd725e9bc4fb5533ed63882`; PRs #349 and #350 merged. Their collision-safe area identifiers, hard-block conditions, verified `/info` capability cache and unsupported-toll handling remain intact. No production access, deployment, configuration, data or graph changes were performed.

## Pipeline and interpretation

Local camera ingestion/SCDB sections feed `hazards.py`; OSM acquisition and CAZ sources add geographic evidence. `engines.py` composes installed SCDB references and request-defined OSM/CAZ areas using the existing collision-safe composition helpers. Valhalla receives bounded exclusion points; neither points nor accepted provider options prove driven-road avoidance. GraphHopper precision-5 and Valhalla precision-6 shapes pass through route entries and journey geometry before `integrity.py` independently indexes each alternative using `hazard_matching.py`.

The old `hazard_count`/penalty path (`score_route_by_hazards`, `get_hazards_on_route`) counts nearby observations across hazard buckets. Camera annotation also has a proximity-based count. These are not interchangeable with independently applicable camera encounters. Sparse road identity, opposing carriageways, directional data, source duplication, freshness and different geometries can all affect the supplied 20/10 counts; none is proven to be the production explanation without the two geometries and matching source snapshot.

## Assessment and fix

Existing MATCH/POSSIBLE/CLEAR semantics remain conservative. MATCH requires the existing credible road/direction evidence; nearby opposing/adjacent-road evidence only clears a hazard when trusted identity/direction supports it. Ambiguous association remains POSSIBLE. There is no independently calibrated PROBABLE class; do not fabricate one or camera accuracy percentages.

Per-alternative `camera_evidence` reports applicable, possible, unknown_or_stale (a subset of possible), confirmed_unrelated and outside_radius observations, with category coverage and scope. Counts are observations, potentially repeated across legs, not guaranteed unique physical cameras. Zero cannot establish camera-free navigation. Stale/missing coverage retains UNVERIFIED mandatory gates. Conflicting-source records are no longer collapsed by partial identity. Distinct records remain assessed; no arbitrary confidence threshold was introduced.

## Remaining acceptance

Capture private geometries and provenance locally under operator control, compare road IDs, direction and freshness with trusted graph matches, and inspect the two count methods independently. Do not send precise route data to application logs or public PRs. No actual 20/10 journey, real carriageway association accuracy or global camera coverage is verified here.
