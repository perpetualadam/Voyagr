# Voyagr speed-limit audit

## Sources and consumers

`speed_limit_detector.py` consults TomTom Snap to Roads, then nearby Overpass maxspeed data, then highway/region inference. Memory caching uses coordinate rounding, source and some road-class checks; heading assists TomTom matching but is not part of the cache key. Browser speed-gps handles GPS speed/filtering and legacy edge-limit resolution. Current README describes the PWA as a GPS speedometer without displayed posted-limit/over-limit alerts; legacy detector/backend/widget and desktop functionality still exist. This patch preserves those functions and does not enable a new displayed limit feature.

P1 SPEED-01 fixed: `_parse_osm_maxspeed_to_mph` interpreted bare numbers as mph in UK/US. OSM unqualified numeric maxspeed is km/h worldwide. Now bare `50` -> 31mph, explicit `30 mph` -> 30mph, and `50 km/h` -> 31mph in all regions. GB:nsl_single/dual/motorway symbolic values retain their existing special handling. The old `maxspeed='40'` fixture now expects 25mph, with an explanatory comment; no assertion was weakened. Regression tests also keep variable/signals/none unknown at parsing level.

## Confirmed remaining safety concerns (P1)

- `infer_highway_tag_maxspeed_mph` and `_get_tomtom_or_osm_posted_limit` may convert missing legal data into road-class defaults; SPEED_LIMIT_ROAD_TYPE_FALLBACK defaults true. Highway inference can occur even when the final road-type fallback switch is off. Source labels exist, but consumers can still receive a numeric estimate as speed_limit_mph. A reliable legal limit should remain unknown unless grounded in applicable signage/map attributes. Changing all consumers and strict warning behavior requires an explicit source/confidence contract and isolated tests, so no blanket fallback removal was attempted.
- `_osm_way_maxspeed_mph` prefers general maxspeed/zone presets and does not fully resolve maxspeed:forward/backward/conditional against matched way direction, vehicle classes, time-dependent restrictions or temporary roadworks. Cache coordinates do not distinguish carriageway/direction. Nearest way and plausibility checks reduce obvious errors but cannot establish correct-road or legal applicability.
- National-speed-limit interpretation must combine country, carriageway type and vehicle restrictions; symbolic parsing is not proof of complete legal coverage. Numeric fallback safety should not be inferred from car-only road-class tests.
- Detector state is shared on the backend; current/previous speed-limit changes are not user-specific. Review isolation before interpreting transitions per journey.

## Traffic flow and confidence

`_freeflow_kmh_to_limit_mph` exists as a heuristic helper, but repository search found its definition and no active call in the detector; the active posted-limit pipeline uses Snap/OSM/inference. Traffic duration multiplication uses current/free-flow ratio for ETA, which is distinct from a posted legal speed. Do not reintroduce free-flow speed as a legal-limit source.

Source labels (OSM-maxspeed, TomTom-SnapToRoads, OSM-highway-inferred, road-type-default, none) are present. They are not empirically calibrated confidence scores. Recommended contract: posted/estimated/unknown, source age, direction and vehicle applicability; legal-limit UI/warnings consume only applicable posted values, without deleting strict alerts for valid data.

## Validation limits

Existing detector and speed-limit-fix suites plus new unit-conversion tests pass. They use deterministic fixtures where available; a legacy detector test can attempt Overpass with graceful fallback, so its passing result is not a live legal-limit validation. No paid TomTom call was intentionally made. Browser/desktop warning timing, variable motorway signs and a real UK road transition dataset remain unverified.
