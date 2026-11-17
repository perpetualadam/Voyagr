# Independent route warning observations

This implements the first two priorities from the 17 November personal-mode hazard
audit: retaining warnings independently of avoidance, and bounded signal/crossing
acquisition for larger planning extents. It does not certify phone audio or complete
hazard coverage.

## Data paths

`prepare_route_hazards` retains a mapped observation snapshot before filtering its
camera subtypes and avoid flags. The returned HazardDataset still iterates only
the preference-filtered engine/scoring inputs; `warning_observations` is a separate
attribute. GraphHopper/Valhalla exclusion builders do not iterate the observation
snapshot. Explicit avoid points and incident handling retain their existing paths.

Route warning serialization uses the snapshot with a 150 m geographic corridor
around the actual returned route segments, independent of avoidance preferences.
It retains available source/time/association metadata. Geometry proximity alone
does not prove road, direction or vehicle applicability. The GPS owner continues
its Possible/Unrelated policy and alert settings. Warning rows and avoidance
hazard counts/penalties are separate: zero avoidance penalty can coexist with
warning observations.

GraphHopper, Valhalla primary/alternate parsers and OSRM fallback serialize the
warning rows and coverage. Existing private route caching therefore retains the
serialized data rather than depending on Python-only attributes after delivery.
Multi-drop summary, comparison route and legs receive the same independent data;
when avoidance is off, its warning acquisition follows successful valid geometry
and does not supply exclusions to the engine. Frontend route normalization and
selection retain coverage and clear it when a replacement route supplies none.

## Bounded acquisition

Small planning extents use their bounds plus 0.002 degrees, replacing the former
0.1-degree margin that could push moderate routes beyond the 0.35-degree guard.
For larger journeys, at most four 0.30-degree areas are sampled across the planning
visit chain (actual returned geometry for multi-drop with avoidance off). Both
signal and level-crossing queries share one eight-second child budget: no more
than eight synchronous provider calls, with the existing helper output caps and
cache. Parent deadlines still abort the request. Invalid/dateline-crossing sample
geometry does not trigger a guessed query.

This is incomplete acquisition for long/bent journeys, not an assertion that every
road between samples was checked. Duplicate observations are merged. Failed or
unattempted categories stay unknown; sampled coverage stays partial. Single-area
coverage retains the original provider status/bounds/provenance so the existing
avoidance assessment can evaluate the returned geometry conservatively. Stale
source status remains stale even when several areas are combined. Expired work
cannot publish observations. No coverage is promoted to complete by an empty list.

The existing route Info disclosure shows signal and crossing warning coverage,
independently of the speed-widget toggle. It does not claim live light phases,
train/barrier state, or verified absence of hazards.

## Validation and limits

Focused synthetic regressions cover avoidance off and disabled camera subtypes,
empty/unavailable preference storage, real GraphHopper/Valhalla route serialization,
multi-drop summaries/legs and unchanged engine flags, moderate/long/bent planning
areas, duplicates, unavailable/stale coverage, output provenance and child/parent
deadlines. The GPS owner is exercised in personal live mode with synthetic fixes:
retained offline observations call notification/speech spies; simulation and
verified unrelated-road association still suppress them; deduplication remains.
These are requested platform actions, not sounds heard on a physical phone.

The full-candidate browser lab checks coverage through real frontend normalization
and the GPS owner; its existing map/speed/privacy checks remain. Physical phone
acceptance remains open, using the audit's checklist. No production configuration,
account records or private history are changed by this implementation.

Remaining audit items include ordinary-signal coupling to camera-alert Off,
nearby radius parameter mismatch, legacy datasets without independent snapshots,
and broader freshness/rolling coverage tests. This change does not create an
independent GPS-nearby acquisition source for every crossing/signal along a very
long journey. Refresh an older selected/cached plan after deploying the new code;
an old offline route cannot gain observations it never acquired.
